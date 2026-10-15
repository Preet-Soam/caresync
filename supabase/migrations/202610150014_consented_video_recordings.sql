-- Video is never recorded by default. Both authenticated participants must
-- grant consent during the confirmed appointment before a recording is stored.
create table public.video_recording_consents (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (appointment_id,user_id)
);
alter table public.video_recording_consents enable row level security;
create policy "participants and admins read recording consent" on public.video_recording_consents
for select to authenticated using (
  user_id=(select auth.uid()) or public.current_role()='administrator'
  or exists(select 1 from public.appointments a join public.doctor_profiles d on d.id=a.doctor_id
    where a.id=appointment_id and (a.patient_id=(select auth.uid()) or d.user_id=(select auth.uid())))
);
grant select on public.video_recording_consents to authenticated;

create function public.set_video_recording_consent(target_appointment uuid, allow_recording boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare patient uuid; doctor_user uuid;
begin
  select a.patient_id,d.user_id into patient,doctor_user
  from public.appointments a join public.doctor_profiles d on d.id=a.doctor_id
  where a.id=target_appointment and a.appointment_type='video' and a.status='confirmed'
    and now() between a.scheduled_start-interval '15 minutes' and a.scheduled_end+interval '60 minutes';
  if patient is null or (select auth.uid()) not in (patient,doctor_user) then
    raise exception 'Only a participant in the active, confirmed video visit can manage recording consent';
  end if;
  if doctor_user=(select auth.uid()) and not public.is_active_doctor() then
    raise exception 'An approved doctor is required';
  end if;
  if allow_recording then
    insert into public.video_recording_consents(appointment_id,user_id,consented_at,revoked_at)
      values(target_appointment,(select auth.uid()),now(),null)
      on conflict(appointment_id,user_id) do update set consented_at=now(),revoked_at=null;
  else
    update public.video_recording_consents set revoked_at=now()
      where appointment_id=target_appointment and user_id=(select auth.uid()) and revoked_at is null;
  end if;
end;
$$;
revoke all on function public.set_video_recording_consent(uuid,boolean) from public;
grant execute on function public.set_video_recording_consent(uuid,boolean) to authenticated;

create table public.video_session_recordings (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 240),
  duration_seconds integer not null check (duration_seconds between 1 and 7200),
  size_bytes bigint not null check (size_bytes between 1 and 268435456),
  recording_status text not null default 'ready' check (recording_status in ('ready','deleted')),
  created_at timestamptz not null default now()
);
create index video_recordings_appointment_idx on public.video_session_recordings(appointment_id,created_at desc);
alter table public.video_session_recordings enable row level security;
create policy "visit participants and admins read video recordings" on public.video_session_recordings
for select to authenticated using (
  public.current_role()='administrator'
  or exists(select 1 from public.appointments a join public.doctor_profiles d on d.id=a.doctor_id
    where a.id=appointment_id and (a.patient_id=(select auth.uid()) or d.user_id=(select auth.uid())))
);
create policy "approved doctor stores consensual session recording" on public.video_session_recordings
for insert to authenticated with check (
  created_by=(select auth.uid()) and public.is_active_doctor()
  and recording_status='ready'
  and exists(select 1 from public.appointments a join public.doctor_profiles d on d.id=a.doctor_id
    where a.id=appointment_id and d.user_id=(select auth.uid()) and a.status in ('confirmed','completed') and a.appointment_type='video'
      and exists(select 1 from public.video_recording_consents c where c.appointment_id=a.id and c.user_id=a.patient_id and c.revoked_at is null)
      and exists(select 1 from public.video_recording_consents c where c.appointment_id=a.id and c.user_id=d.user_id and c.revoked_at is null))
);
create policy "administrator manages video recording status" on public.video_session_recordings
for update to authenticated using (public.current_role()='administrator') with check (public.current_role()='administrator');
grant select,insert on public.video_session_recordings to authenticated;
grant update (recording_status) on public.video_session_recordings to authenticated;
create function public.prevent_video_recording_restore()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.recording_status='deleted' and new.recording_status<>'deleted' then
    raise exception 'A deleted session recording cannot be restored';
  end if;
  return new;
end;
$$;
create trigger prevent_video_recording_restore before update on public.video_session_recordings
for each row execute function public.prevent_video_recording_restore();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('video-recordings','video-recordings',false,268435456,array['video/webm','video/mp4'])
on conflict(id) do nothing;
create policy "approved doctor uploads only mutually consented visit recordings" on storage.objects
for insert to authenticated with check (
  bucket_id='video-recordings' and public.is_active_doctor()
  and (storage.extension(name) in ('webm','mp4'))
  and exists(select 1 from public.appointments a join public.doctor_profiles d on d.id=a.doctor_id
    where a.id=((storage.foldername(name))[1])::uuid and d.user_id=(select auth.uid())
      and a.status in ('confirmed','completed') and a.appointment_type='video'
      and exists(select 1 from public.video_recording_consents c where c.appointment_id=a.id and c.user_id=a.patient_id and c.revoked_at is null)
      and exists(select 1 from public.video_recording_consents c where c.appointment_id=a.id and c.user_id=d.user_id and c.revoked_at is null))
);
create policy "visit participants and admins read private session recordings" on storage.objects
for select to authenticated using (
  bucket_id='video-recordings' and exists(
    select 1 from public.video_session_recordings r join public.appointments a on a.id=r.appointment_id
      join public.doctor_profiles d on d.id=a.doctor_id
    where r.storage_path=name and r.recording_status='ready'
      and (public.current_role()='administrator' or a.patient_id=(select auth.uid()) or d.user_id=(select auth.uid()))
  )
);
create policy "administrator deletes private video recording objects" on storage.objects
for delete to authenticated using (bucket_id='video-recordings' and public.current_role()='administrator');

create function public.notify_patient_of_video_recording()
returns trigger language plpgsql security definer set search_path = '' as $$
declare patient uuid;
begin
  select patient_id into patient from public.appointments where id=new.appointment_id;
  if tg_op='INSERT' then
    insert into public.notifications(user_id,title,message,notification_type,related_appointment_id)
    values(patient,'Video visit recording available','A recording from your online visit is ready in Online sessions.', 'video_recording',new.appointment_id);
    if auth.uid() is not null then
      insert into public.audit_logs(actor_id,action,resource_type,resource_id,safe_metadata)
      values(auth.uid(),'video_recording.created','video_recording',new.id,jsonb_build_object('duration_seconds',new.duration_seconds,'size_bytes',new.size_bytes));
    end if;
  elsif old.recording_status is distinct from new.recording_status and new.recording_status='deleted' and auth.uid() is not null then
    insert into public.audit_logs(actor_id,action,resource_type,resource_id,safe_metadata)
    values(auth.uid(),'video_recording.deleted','video_recording',new.id,'{}'::jsonb);
  end if;
  return new;
end;
$$;
create trigger notify_video_recording_ready after insert or update of recording_status on public.video_session_recordings
for each row execute function public.notify_patient_of_video_recording();
