alter table public.doctor_profiles
  add column time_zone text not null default 'Asia/Kolkata'
  check (char_length(time_zone) between 1 and 80);

grant update (time_zone) on public.doctor_profiles to authenticated;

-- Schedule hours are entered in the doctor's selected time zone, while
-- appointment instants remain stored as UTC timestamps.
create or replace function public.book_appointment(
  target_doctor uuid, starts_at timestamptz, visit_reason text default null, visit_type text default 'in_person'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  patient uuid := auth.uid();
  doctor_user uuid;
  doctor_zone text;
  local_start timestamp;
  duration_minutes integer;
  appointment_id uuid;
begin
  if patient is null then raise exception 'Sign in required'; end if;
  if (select role from public.profiles where id=patient and account_status='active') <> 'patient' then raise exception 'Patient account required'; end if;
  if visit_type not in ('in_person','video','phone') then raise exception 'Invalid appointment type'; end if;
  if starts_at <= now() or starts_at > now() + interval '180 days' then raise exception 'Invalid appointment date'; end if;
  select d.user_id,d.time_zone into doctor_user,doctor_zone from public.doctor_profiles d join public.profiles p on p.id=d.user_id
    where d.id=target_doctor and d.verification_status='approved' and p.account_status='active' and p.role='doctor';
  if doctor_user is null then raise exception 'Doctor unavailable'; end if;
  local_start := starts_at at time zone doctor_zone;
  select a.slot_duration into duration_minutes
    from public.doctor_availability a
    where a.doctor_id=target_doctor and a.availability_status='available'
      and ((a.available_on=local_start::date) or (a.available_on is null and a.weekday=extract(dow from local_start)::integer))
      and local_start::time >= a.start_time
      and ((local_start::time + make_interval(mins=>a.slot_duration)) <= a.end_time)
    order by (a.available_on is not null) desc limit 1;
  if duration_minutes is null then raise exception 'This time is not available'; end if;
  if exists (
    select 1 from public.doctor_availability a
    where a.doctor_id=target_doctor and a.availability_status in ('blocked','leave')
      and ((a.available_on=local_start::date) or (a.available_on is null and a.weekday=extract(dow from local_start)::integer))
      and a.start_time < (local_start::time + make_interval(mins=>duration_minutes))
      and a.end_time > local_start::time
  ) then raise exception 'This time is blocked for the doctor'; end if;
  insert into public.appointments(patient_id,doctor_id,department_id,scheduled_start,scheduled_end,reason,status,appointment_type)
  select patient,target_doctor,d.department_id,starts_at,starts_at+make_interval(mins=>duration_minutes),nullif(left(coalesce(visit_reason,''),500),''),'requested',visit_type
  from public.doctor_profiles d where d.id=target_doctor returning id into appointment_id;
  insert into public.notifications(user_id,title,message,notification_type,related_appointment_id)
  values (patient,'Appointment request received','Your appointment request is with the care team.','appointment',appointment_id),
    (doctor_user,'New appointment request','A patient requested an appointment.','appointment',appointment_id);
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,safe_metadata)
  values(patient,'appointment.requested','appointment',appointment_id,jsonb_build_object('doctor_id',target_doctor));
  return appointment_id;
exception when exclusion_violation then raise exception 'This time was just booked. Choose another available slot.';
end;
$$;
revoke all on function public.book_appointment(uuid,timestamptz,text,text) from public;
grant execute on function public.book_appointment(uuid,timestamptz,text,text) to authenticated;
