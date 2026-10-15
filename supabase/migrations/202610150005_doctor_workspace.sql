-- Scoped read API for an approved doctor. Only patients linked to the caller's
-- appointments are returned, and no patient email, phone, or address is exposed.
create function public.doctor_care_workspace()
returns table (
  appointment_id uuid,
  patient_id uuid,
  patient_name text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  appointment_status public.appointment_state,
  appointment_type text,
  visit_reason text,
  consultation_id uuid,
  clinical_notes text,
  diagnosis text,
  treatment_plan text,
  follow_up_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_doctor() then
    raise exception 'An approved doctor account is required';
  end if;

  return query
  select a.id, a.patient_id, p.full_name, a.scheduled_start, a.scheduled_end,
    a.status, a.appointment_type, a.reason, c.id, c.clinical_notes,
    c.diagnosis, c.treatment_plan, c.follow_up_date
  from public.appointments a
  join public.doctor_profiles d on d.id = a.doctor_id
  join public.profiles p on p.id = a.patient_id
  left join public.consultations c on c.appointment_id = a.id
  where d.user_id = (select auth.uid())
  order by a.scheduled_start desc;
end;
$$;
revoke all on function public.doctor_care_workspace() from public;
grant execute on function public.doctor_care_workspace() to authenticated;

-- Issue a complete prescription atomically, so patients can only see it after
-- every medication item is saved and the prescription is finalized.
create function public.issue_prescription(target_appointment uuid, items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_doctor uuid;
  target_patient uuid;
  target_consultation uuid;
  new_prescription uuid;
begin
  if not public.is_active_doctor() then
    raise exception 'An approved doctor account is required';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) < 1 or jsonb_array_length(items) > 20 then
    raise exception 'Add between 1 and 20 medication items';
  end if;

  select d.id, a.patient_id, c.id
    into current_doctor, target_patient, target_consultation
  from public.doctor_profiles d
  join public.appointments a on a.doctor_id = d.id
  join public.consultations c on c.appointment_id = a.id
  where d.user_id = (select auth.uid()) and a.id = target_appointment and a.status = 'completed';
  if target_consultation is null then
    raise exception 'A completed visit with a consultation note is required';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(items) as x(medication_name text, dosage text, route text, frequency text, duration text, instructions text)
    where nullif(trim(x.medication_name), '') is null or length(x.medication_name) > 200
      or nullif(trim(x.dosage), '') is null or nullif(trim(x.route), '') is null
      or nullif(trim(x.frequency), '') is null or nullif(trim(x.duration), '') is null
      or length(coalesce(x.instructions, '')) > 1000
  ) then
    raise exception 'Complete each medication name, dosage, route, schedule, and duration';
  end if;

  insert into public.prescriptions(consultation_id, patient_id, doctor_id, status)
  values(target_consultation, target_patient, current_doctor, 'draft')
  returning id into new_prescription;

  insert into public.prescription_items(prescription_id, medication_name, dosage, route, frequency, duration, instructions)
  select new_prescription, trim(x.medication_name), trim(x.dosage), trim(x.route), trim(x.frequency), trim(x.duration), nullif(trim(x.instructions), '')
  from jsonb_to_recordset(items) as x(medication_name text, dosage text, route text, frequency text, duration text, instructions text);

  update public.prescriptions set status = 'finalized', issued_at = now() where id = new_prescription;
  return new_prescription;
end;
$$;
revoke all on function public.issue_prescription(uuid, jsonb) from public;
grant execute on function public.issue_prescription(uuid, jsonb) to authenticated;
