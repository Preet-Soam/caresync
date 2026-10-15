-- Support content is private to the member and the administrator team.
create table public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_role text not null check (user_role in ('patient','doctor')),
  category text not null check (char_length(category) between 1 and 120),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  assigned_admin_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index support_conversations_owner_idx on public.support_conversations(user_id,updated_at desc);
create index support_conversations_queue_idx on public.support_conversations(status,updated_at desc);
alter table public.support_conversations enable row level security;
create policy "members and administrators read support conversations" on public.support_conversations
for select to authenticated using (user_id=(select auth.uid()) or public.current_role()='administrator');
grant select on public.support_conversations to authenticated;

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  sender_role text not null check (sender_role in ('patient','doctor','administrator')),
  message text not null check (char_length(message) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index support_messages_conversation_idx on public.support_messages(conversation_id,created_at);
alter table public.support_messages enable row level security;
create policy "members and administrators read support messages" on public.support_messages
for select to authenticated using (
  public.current_role()='administrator' or exists(select 1 from public.support_conversations c where c.id=conversation_id and c.user_id=(select auth.uid()))
);
grant select on public.support_messages to authenticated;

create function public.create_support_conversation(target_category text, initial_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); actor_role text := public.current_role(); created_id uuid; safe_category text; safe_message text;
begin
  if actor is null or actor_role not in ('patient','doctor') then raise exception 'An authenticated patient or doctor is required'; end if;
  safe_category := left(trim(coalesce(target_category,'')),120);
  safe_message := left(trim(coalesce(initial_message,'')),4000);
  if safe_category='' or safe_message='' then raise exception 'Choose a topic and describe the issue'; end if;
  insert into public.support_conversations(user_id,user_role,category) values(actor,actor_role,safe_category) returning id into created_id;
  insert into public.support_messages(conversation_id,sender_id,sender_role,message) values(created_id,actor,actor_role,safe_message);
  insert into public.notifications(user_id,title,message,notification_type)
    select p.id,'Support chat needs a reply',safe_category||' · A member is waiting for support.','support_request'
    from public.profiles p where p.role='administrator' and p.account_status='active';
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,safe_metadata)
    values(actor,'support.conversation_created','support_conversation',created_id,jsonb_build_object('category',safe_category));
  return created_id;
end;
$$;
revoke all on function public.create_support_conversation(text,text) from public;
grant execute on function public.create_support_conversation(text,text) to authenticated;

create function public.send_support_message(target_conversation uuid, message_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); actor_role text := public.current_role(); owner_id uuid; current_status text; assigned_admin uuid; safe_message text;
begin
  if actor is null or actor_role not in ('patient','doctor','administrator') then raise exception 'Sign in to send a support message'; end if;
  safe_message := left(trim(coalesce(message_body,'')),4000);
  if safe_message='' then raise exception 'Message cannot be empty'; end if;
  select user_id,status,assigned_admin_id into owner_id,current_status,assigned_admin from public.support_conversations where id=target_conversation for update;
  if owner_id is null then raise exception 'Support conversation not found'; end if;
  if actor_role='administrator' then
    if current_status='closed' then raise exception 'This support conversation is closed'; end if;
    update public.support_conversations set status='in_progress',assigned_admin_id=actor,updated_at=now(),last_message_at=now() where id=target_conversation;
  else
    if owner_id<>actor then raise exception 'You cannot reply to this support conversation'; end if;
    if current_status='closed' then raise exception 'This support conversation is closed'; end if;
    update public.support_conversations set status=case when current_status='resolved' then 'open' else current_status end,
      assigned_admin_id=case when current_status='resolved' then null else assigned_admin end,
      updated_at=now(),last_message_at=now() where id=target_conversation;
  end if;
  insert into public.support_messages(conversation_id,sender_id,sender_role,message) values(target_conversation,actor,actor_role,safe_message);
  if actor_role='administrator' then
    insert into public.notifications(user_id,title,message,notification_type)
      values(owner_id,'CareSync Support replied','An administrator replied to your support conversation.','support_reply');
  elsif assigned_admin is not null then
    insert into public.notifications(user_id,title,message,notification_type)
      values(assigned_admin,'Member replied to support','A member replied to an assigned support conversation.','support_reply');
  else
    insert into public.notifications(user_id,title,message,notification_type)
      select p.id,'Support chat needs a reply','A member added a message to an open support conversation.','support_request'
      from public.profiles p where p.role='administrator' and p.account_status='active';
  end if;
end;
$$;
revoke all on function public.send_support_message(uuid,text) from public;
grant execute on function public.send_support_message(uuid,text) to authenticated;

create function public.admin_update_support_conversation(target_conversation uuid, new_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; old_status text;
begin
  if public.current_role()<>'administrator' or (select auth.uid()) is null then raise exception 'Administrator access is required'; end if;
  if new_status not in ('open','in_progress','resolved','closed') then raise exception 'Invalid support status'; end if;
  select user_id,status into owner_id,old_status from public.support_conversations where id=target_conversation for update;
  if owner_id is null then raise exception 'Support conversation not found'; end if;
  update public.support_conversations set status=new_status,
    assigned_admin_id=case when new_status='open' then null when new_status='in_progress' then (select auth.uid()) else coalesce(assigned_admin_id,(select auth.uid())) end,
    updated_at=now() where id=target_conversation;
  if old_status is distinct from new_status then
    insert into public.audit_logs(actor_id,action,resource_type,resource_id,safe_metadata)
      values((select auth.uid()),'support.status_changed','support_conversation',target_conversation,jsonb_build_object('from',old_status,'to',new_status));
    if new_status in ('resolved','closed') then
      insert into public.notifications(user_id,title,message,notification_type)
        values(owner_id,'Support conversation updated','Your support conversation was marked '||new_status||'.','support_update');
    end if;
  end if;
end;
$$;
revoke all on function public.admin_update_support_conversation(uuid,text) from public;
grant execute on function public.admin_update_support_conversation(uuid,text) to authenticated;
