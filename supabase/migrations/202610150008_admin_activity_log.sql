-- Allow administrators to record the small set of successful management
-- actions that are performed through direct table writes in the admin UI.
-- Workflows that already write an audit row continue to use their own RPCs.
create function public.admin_record_activity(target_action text, target_resource_type text, target_resource_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare activity_id uuid;
begin
  if public.current_role() is distinct from 'administrator' then
    raise exception 'Administrator access required';
  end if;
  if target_action not in (
    'department.created','department.updated','department.status_changed',
    'facility.created','facility.updated'
  ) then
    raise exception 'Unsupported administrator activity';
  end if;
  if target_resource_type not in ('department','health_facility') or target_resource_id is null then
    raise exception 'Invalid activity reference';
  end if;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,safe_metadata)
    values((select auth.uid()),target_action,target_resource_type,target_resource_id,'{}'::jsonb)
    returning id into activity_id;
  return activity_id;
end;
$$;
revoke all on function public.admin_record_activity(text,text,uuid) from public;
grant execute on function public.admin_record_activity(text,text,uuid) to authenticated;
