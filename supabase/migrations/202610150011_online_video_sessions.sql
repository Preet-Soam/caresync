-- Give confirmed video appointments a private, participant-only realtime room.
alter table public.appointments add column if not exists video_room_id uuid;

create or replace function public.assign_video_room_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.appointment_type = 'video' then
    if new.video_room_id is null then new.video_room_id := gen_random_uuid(); end if;
  else
    new.video_room_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_assign_video_room on public.appointments;
create trigger appointments_assign_video_room
before insert or update of appointment_type on public.appointments
for each row execute function public.assign_video_room_id();

update public.appointments set video_room_id = gen_random_uuid()
where appointment_type = 'video' and video_room_id is null;

create unique index if not exists appointments_video_room_idx
on public.appointments(video_room_id) where video_room_id is not null;

create or replace function public.get_video_session_room(target_appointment uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare room uuid;
begin
  select a.video_room_id into room
  from public.appointments a
  join public.doctor_profiles d on d.id = a.doctor_id
  where a.id = target_appointment
    and a.appointment_type = 'video'
    and a.status = 'confirmed'
    and now() between a.scheduled_start - interval '15 minutes' and a.scheduled_end + interval '60 minutes'
    and (
      a.patient_id = (select auth.uid())
      or (d.user_id = (select auth.uid()) and public.is_active_doctor())
    );
  if room is null then
    raise exception 'This video session is unavailable. Confirm the appointment and join within 15 minutes of its start time.';
  end if;
  return room;
end;
$$;
revoke all on function public.get_video_session_room(uuid) from public;
grant execute on function public.get_video_session_room(uuid) to authenticated;

-- Realtime checks the participant relationship on private channel subscription
-- and for each broadcast. The random room key is never selected from the table.
create policy "appointment participants receive video signals"
on realtime.messages for select to authenticated using (
  extension = 'broadcast'
  and exists (
    select 1
    from public.appointments a
    join public.doctor_profiles d on d.id = a.doctor_id
    where a.video_room_id::text = split_part(realtime.topic(), ':', 2)
      and realtime.topic() like 'caresync-video:%'
      and a.appointment_type = 'video'
      and a.status = 'confirmed'
      and now() between a.scheduled_start - interval '15 minutes' and a.scheduled_end + interval '60 minutes'
      and (a.patient_id = (select auth.uid()) or (d.user_id = (select auth.uid()) and public.is_active_doctor()))
  )
);

create policy "appointment participants send video signals"
on realtime.messages for insert to authenticated with check (
  extension = 'broadcast'
  and exists (
    select 1
    from public.appointments a
    join public.doctor_profiles d on d.id = a.doctor_id
    where a.video_room_id::text = split_part(realtime.topic(), ':', 2)
      and realtime.topic() like 'caresync-video:%'
      and a.appointment_type = 'video'
      and a.status = 'confirmed'
      and now() between a.scheduled_start - interval '15 minutes' and a.scheduled_end + interval '60 minutes'
      and (a.patient_id = (select auth.uid()) or (d.user_id = (select auth.uid()) and public.is_active_doctor()))
  )
);

create policy "appointment participants see video room presence"
on realtime.messages for select to authenticated using (
  extension = 'presence'
  and exists (
    select 1 from public.appointments a
    join public.doctor_profiles d on d.id = a.doctor_id
    where a.video_room_id::text = split_part(realtime.topic(), ':', 2)
      and realtime.topic() like 'caresync-video:%'
      and a.appointment_type = 'video' and a.status = 'confirmed'
      and now() between a.scheduled_start - interval '15 minutes' and a.scheduled_end + interval '60 minutes'
      and (a.patient_id = (select auth.uid()) or (d.user_id = (select auth.uid()) and public.is_active_doctor()))
  )
);

create policy "appointment participants publish video room presence"
on realtime.messages for insert to authenticated with check (
  extension = 'presence'
  and exists (
    select 1 from public.appointments a
    join public.doctor_profiles d on d.id = a.doctor_id
    where a.video_room_id::text = split_part(realtime.topic(), ':', 2)
      and realtime.topic() like 'caresync-video:%'
      and a.appointment_type = 'video' and a.status = 'confirmed'
      and now() between a.scheduled_start - interval '15 minutes' and a.scheduled_end + interval '60 minutes'
      and (a.patient_id = (select auth.uid()) or (d.user_id = (select auth.uid()) and public.is_active_doctor()))
  )
);

comment on column public.appointments.video_room_id is 'Random participant-authorized realtime signaling room for confirmed video visits; retrieve only via get_video_session_room.';
