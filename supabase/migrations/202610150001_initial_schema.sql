-- CareSync initial schema. Apply with Supabase CLI before using real accounts.
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create type public.app_role as enum ('patient', 'doctor', 'administrator');
create type public.account_state as enum ('active', 'inactive', 'suspended');
create type public.doctor_verification as enum ('pending', 'approved', 'rejected');
create type public.appointment_state as enum ('requested', 'confirmed', 'completed', 'cancelled', 'rejected');
create type public.prescription_state as enum ('draft', 'finalized', 'amended');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  role public.app_role not null default 'patient',
  account_status public.account_state not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Identity and role come from trusted auth data; user metadata cannot set a role.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email, 'patient');
  insert into public.patient_profiles (user_id) values (new.id);
  return new;
end;
$$;

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);
create table public.patient_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  date_of_birth date,
  emergency_contact jsonb not null default '{}'::jsonb,
  relevant_information text check (char_length(relevant_information) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.doctor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  specialty text not null,
  qualifications text not null default '',
  experience_years smallint check (experience_years between 0 and 70),
  department_id uuid references public.departments(id) on delete set null,
  consultation_fee numeric(10,2) check (consultation_fee >= 0),
  verification_status public.doctor_verification not null default 'pending',
  biography text check (char_length(biography) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.doctor_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  specialty text not null check (char_length(specialty) between 2 and 120),
  qualifications text not null check (char_length(qualifications) between 2 and 1000),
  experience_years smallint check (experience_years between 0 and 70),
  department_id uuid references public.departments(id) on delete set null,
  biography text check (char_length(biography) <= 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text check (char_length(review_note) <= 500),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.doctor_availability (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctor_profiles(id) on delete cascade,
  weekday smallint check (weekday between 0 and 6),
  available_on date,
  start_time time not null,
  end_time time not null,
  slot_duration smallint not null default 30 check (slot_duration between 10 and 240),
  availability_status text not null default 'available' check (availability_status in ('available','blocked','leave')),
  created_at timestamptz not null default now(),
  check ((weekday is not null) <> (available_on is not null)),
  check (end_time > start_time)
);
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id),
  doctor_id uuid not null references public.doctor_profiles(id),
  department_id uuid references public.departments(id),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  reason text check (char_length(reason) <= 500),
  status public.appointment_state not null default 'requested',
  appointment_type text not null default 'in_person' check (appointment_type in ('in_person','video','phone')),
  cancellation_reason text check (char_length(cancellation_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start),
  exclude using gist (doctor_id with =, tstzrange(scheduled_start, scheduled_end, '[)') with &&)
    where (status in ('requested','confirmed'))
);
create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id),
  doctor_id uuid not null references public.doctor_profiles(id),
  patient_id uuid not null references public.profiles(id),
  clinical_notes text not null default '',
  diagnosis text,
  treatment_plan text,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations(id),
  patient_id uuid not null references public.profiles(id),
  doctor_id uuid not null references public.doctor_profiles(id),
  status public.prescription_state not null default 'draft',
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  medication_name text not null check (char_length(medication_name) between 1 and 200),
  dosage text not null,
  route text not null,
  frequency text not null,
  duration text not null,
  instructions text check (char_length(instructions) <= 1000)
);
create table public.medical_documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id),
  uploaded_by uuid not null references public.profiles(id),
  document_type text not null check (char_length(document_type) <= 80),
  storage_path text not null unique,
  description text check (char_length(description) <= 500),
  created_at timestamptz not null default now()
);
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id),
  appointment_id uuid not null unique references public.appointments(id),
  amount numeric(10,2) not null check (amount >= 0),
  currency char(3) not null default 'INR',
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) <= 120),
  message text not null check (char_length(message) <= 500),
  notification_type text not null,
  related_appointment_id uuid references public.appointments(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id),
  appointment_id uuid not null unique references public.appointments(id),
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1200),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','visible','hidden')),
  created_at timestamptz not null default now()
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index appointments_patient_start_idx on public.appointments(patient_id, scheduled_start desc);
create index appointments_doctor_start_idx on public.appointments(doctor_id, scheduled_start);
create index appointments_status_start_idx on public.appointments(status, scheduled_start);
create index doctor_specialty_idx on public.doctor_profiles(specialty) where verification_status='approved';
create index doctor_department_idx on public.doctor_profiles(department_id) where verification_status='approved';
create index doctor_requests_status_idx on public.doctor_requests(status, created_at desc);
create index availability_doctor_weekday_idx on public.doctor_availability(doctor_id, weekday) where availability_status='available';
create index consultation_patient_idx on public.consultations(patient_id, created_at desc);
create index document_patient_idx on public.medical_documents(patient_id, created_at desc);
create index notification_user_created_idx on public.notifications(user_id, created_at desc);
create index audit_occurred_idx on public.audit_logs(occurred_at desc);

create function public.current_role() returns public.app_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid()) and account_status = 'active'
$$;
create function public.is_active_doctor() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p join public.doctor_profiles d on d.user_id=p.id
    where p.id=(select auth.uid()) and p.account_status='active' and p.role='doctor' and d.verification_status='approved')
$$;
create function public.can_access_patient(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select target = (select auth.uid()) or exists (
    select 1 from public.appointments a join public.doctor_profiles d on d.id=a.doctor_id
    where a.patient_id=target and d.user_id=(select auth.uid()) and public.is_active_doctor()
      and a.status in ('requested','confirmed','completed'))
$$;
create function public.submit_doctor_request(
  request_specialty text, request_qualifications text, request_experience smallint default null,
  request_department uuid default null, request_biography text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare applicant uuid := auth.uid(); request_id uuid;
begin
  if applicant is null or (select role from public.profiles where id=applicant and account_status='active') is distinct from 'patient' then
    raise exception 'Active patient account required';
  end if;
  insert into public.doctor_requests(user_id,specialty,qualifications,experience_years,department_id,biography,status)
  values(applicant,left(trim(request_specialty),120),left(trim(request_qualifications),1000),request_experience,request_department,left(trim(coalesce(request_biography,'')),2000),'pending')
  on conflict(user_id) do update set specialty=excluded.specialty,qualifications=excluded.qualifications,
    experience_years=excluded.experience_years,department_id=excluded.department_id,biography=excluded.biography,
    status='pending',review_note=null,reviewed_by=null,reviewed_at=null,updated_at=now()
  where public.doctor_requests.status='rejected'
  returning id into request_id;
  if request_id is null then raise exception 'A request is already under review or approved'; end if;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,safe_metadata)
  values(applicant,'doctor.requested','doctor_request',request_id,jsonb_build_object('specialty',left(trim(request_specialty),120)));
  return request_id;
end;
$$;
create function public.review_doctor_request(target_request uuid, approve boolean, decision_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare request_row public.doctor_requests%rowtype; administrator uuid := auth.uid();
begin
  if public.current_role() is distinct from 'administrator' then raise exception 'Administrator access required'; end if;
  select * into request_row from public.doctor_requests where id=target_request and status='pending' for update;
  if request_row.id is null then raise exception 'Pending request not found'; end if;
  if approve then
    update public.profiles set role='doctor',updated_at=now() where id=request_row.user_id and role='patient' and account_status='active';
    if not found then raise exception 'Applicant account is not eligible'; end if;
    insert into public.doctor_profiles(user_id,specialty,qualifications,experience_years,department_id,biography,verification_status)
      values(request_row.user_id,request_row.specialty,request_row.qualifications,request_row.experience_years,request_row.department_id,request_row.biography,'approved');
    insert into public.notifications(user_id,title,message,notification_type)
      values(request_row.user_id,'Doctor account approved','Your doctor account is approved. You can now access the clinical workspace.','account');
  else
    insert into public.notifications(user_id,title,message,notification_type)
      values(request_row.user_id,'Doctor request reviewed','Your doctor registration request has been reviewed.','account');
  end if;
  update public.doctor_requests set status=case when approve then 'approved' else 'rejected' end,
    review_note=left(coalesce(decision_note,''),500),reviewed_by=administrator,reviewed_at=now(),updated_at=now()
    where id=target_request;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,safe_metadata)
  values(administrator,case when approve then 'doctor.approved' else 'doctor.rejected' end,'doctor_request',target_request,
    jsonb_build_object('applicant_id',request_row.user_id));
end;
$$;
revoke all on function public.submit_doctor_request(text,text,smallint,uuid,text) from public;
revoke all on function public.review_doctor_request(uuid,boolean,text) from public;
grant execute on function public.submit_doctor_request(text,text,smallint,uuid,text) to authenticated;
grant execute on function public.review_doctor_request(uuid,boolean,text) to authenticated;
create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger auth_user_profile_created after insert on auth.users for each row execute function public.handle_new_user();
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger patient_profiles_touch_updated_at before update on public.patient_profiles for each row execute function public.touch_updated_at();
create trigger doctor_profiles_touch_updated_at before update on public.doctor_profiles for each row execute function public.touch_updated_at();
create trigger doctor_requests_touch_updated_at before update on public.doctor_requests for each row execute function public.touch_updated_at();
create trigger appointments_touch_updated_at before update on public.appointments for each row execute function public.touch_updated_at();
create trigger consultations_touch_updated_at before update on public.consultations for each row execute function public.touch_updated_at();
create trigger prescriptions_touch_updated_at before update on public.prescriptions for each row execute function public.touch_updated_at();
create trigger invoices_touch_updated_at before update on public.invoices for each row execute function public.touch_updated_at();
-- Slot reservation is transactional. The exclusion constraint is the final concurrency guard.
create function public.book_appointment(
  target_doctor uuid, starts_at timestamptz, visit_reason text default null, visit_type text default 'in_person'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare patient uuid := auth.uid(); doctor_user uuid; duration_minutes integer; slot_start time; slot_end time; slot_weekday integer; appointment_id uuid;
begin
  if patient is null then raise exception 'Sign in required'; end if;
  if (select role from public.profiles where id=patient and account_status='active') <> 'patient' then raise exception 'Patient account required'; end if;
  if visit_type not in ('in_person','video','phone') then raise exception 'Invalid appointment type'; end if;
  if starts_at <= now() or starts_at > now() + interval '180 days' then raise exception 'Invalid appointment date'; end if;
  select d.user_id into doctor_user from public.doctor_profiles d join public.profiles p on p.id=d.user_id
    where d.id=target_doctor and d.verification_status='approved' and p.account_status='active' and p.role='doctor';
  if doctor_user is null then raise exception 'Doctor unavailable'; end if;
  slot_weekday := extract(dow from starts_at at time zone 'UTC')::integer;
  select a.start_time,a.end_time,a.slot_duration into slot_start,slot_end,duration_minutes
    from public.doctor_availability a where a.doctor_id=target_doctor and a.availability_status='available'
      and ((a.available_on=(starts_at at time zone 'UTC')::date) or (a.available_on is null and a.weekday=slot_weekday))
      and (starts_at at time zone 'UTC')::time >= a.start_time
      and ((starts_at at time zone 'UTC')::time + make_interval(mins=>a.slot_duration)) <= a.end_time
    order by (a.available_on is not null) desc limit 1;
  if duration_minutes is null then raise exception 'This time is not available'; end if;
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

alter table public.profiles enable row level security;
alter table public.patient_profiles enable row level security;
alter table public.doctor_profiles enable row level security;
alter table public.doctor_requests enable row level security;
alter table public.departments enable row level security;
alter table public.doctor_availability enable row level security;
alter table public.appointments enable row level security;
alter table public.consultations enable row level security;
alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;
alter table public.medical_documents enable row level security;
alter table public.invoices enable row level security;
alter table public.notifications enable row level security;
alter table public.feedback enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles self or scoped admin read" on public.profiles for select to authenticated using (id=(select auth.uid()) or public.current_role()='administrator');
create policy "profiles self update safe fields" on public.profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()) and role=public.current_role());
revoke update on public.profiles from authenticated;
grant update (full_name, phone, updated_at) on public.profiles to authenticated;
create policy "patients view own extended profile" on public.patient_profiles for select to authenticated using (user_id=(select auth.uid()) or public.can_access_patient(user_id) and public.current_role()='doctor' or public.current_role()='administrator');
create policy "patients update own profile" on public.patient_profiles for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "patient profile own insert" on public.patient_profiles for insert to authenticated with check (user_id=(select auth.uid()) and public.current_role()='patient');
create policy "public sees active departments" on public.departments for select to anon, authenticated using (status='active' or public.current_role()='administrator');
create policy "admin manages departments" on public.departments for all to authenticated using (public.current_role()='administrator') with check (public.current_role()='administrator');
create policy "applicant reads own doctor request" on public.doctor_requests for select to authenticated using (user_id=(select auth.uid()) or public.current_role()='administrator');
create policy "administrator reads doctor requests" on public.doctor_requests for select to authenticated using (public.current_role()='administrator');
create policy "approved doctor directory" on public.doctor_profiles for select to anon, authenticated using (verification_status='approved' or user_id=(select auth.uid()) or public.current_role()='administrator');
create policy "doctor edits own pending profile" on public.doctor_profiles for update to authenticated using (user_id=(select auth.uid()) and public.current_role()='doctor') with check (user_id=(select auth.uid()) and public.current_role()='doctor' and verification_status in ('pending','rejected'));
create policy "doctor availability directory" on public.doctor_availability for select to anon, authenticated using (availability_status='available' or exists(select 1 from public.doctor_profiles d where d.id=doctor_id and d.user_id=(select auth.uid())) or public.current_role()='administrator');
create policy "approved doctors manage own availability" on public.doctor_availability for all to authenticated using (public.is_active_doctor() and exists(select 1 from public.doctor_profiles d where d.id=doctor_id and d.user_id=(select auth.uid()))) with check (public.is_active_doctor() and exists(select 1 from public.doctor_profiles d where d.id=doctor_id and d.user_id=(select auth.uid())));
create policy "participants and scoped admins read appointments" on public.appointments for select to authenticated using (patient_id=(select auth.uid()) or exists(select 1 from public.doctor_profiles d where d.id=doctor_id and d.user_id=(select auth.uid()) and public.is_active_doctor()) or public.current_role()='administrator');
create policy "patient cancels own appointment" on public.appointments for update to authenticated using (patient_id=(select auth.uid()) and status in ('requested','confirmed')) with check (patient_id=(select auth.uid()) and status='cancelled');
create policy "approved doctor updates appointment status" on public.appointments for update to authenticated using (exists(select 1 from public.doctor_profiles d where d.id=doctor_id and d.user_id=(select auth.uid()) and public.is_active_doctor())) with check (exists(select 1 from public.doctor_profiles d where d.id=doctor_id and d.user_id=(select auth.uid()) and public.is_active_doctor()));
revoke update on public.appointments from authenticated;
grant update (status, cancellation_reason, updated_at) on public.appointments to authenticated;
create policy "authorized care participants read consultations" on public.consultations for select to authenticated using (patient_id=(select auth.uid()) or exists(select 1 from public.doctor_profiles d where d.id=doctor_id and d.user_id=(select auth.uid()) and public.is_active_doctor()));
create policy "approved doctor creates clinical notes" on public.consultations for insert to authenticated with check (public.is_active_doctor() and exists(select 1 from public.doctor_profiles d where d.id=doctor_id and d.user_id=(select auth.uid())) and exists(select 1 from public.appointments a where a.id=appointment_id and a.doctor_id=consultations.doctor_id and a.patient_id=consultations.patient_id and a.status='completed'));
create policy "approved doctor updates own clinical notes" on public.consultations for update to authenticated using (public.is_active_doctor() and exists(select 1 from public.doctor_profiles d where d.id=doctor_id and d.user_id=(select auth.uid()))) with check (public.is_active_doctor() and exists(select 1 from public.doctor_profiles d where d.id=doctor_id and d.user_id=(select auth.uid())));
create policy "patient and treating doctor read prescriptions" on public.prescriptions for select to authenticated using (patient_id=(select auth.uid()) or exists(select 1 from public.doctor_profiles d where d.id=doctor_id and d.user_id=(select auth.uid()) and public.is_active_doctor()));
create policy "approved doctor creates prescription draft" on public.prescriptions for insert to authenticated with check (status='draft' and issued_at is null and public.is_active_doctor() and exists(select 1 from public.doctor_profiles d where d.id=doctor_id and d.user_id=(select auth.uid())) and exists(select 1 from public.consultations c where c.id=consultation_id and c.patient_id=prescriptions.patient_id and c.doctor_id=prescriptions.doctor_id));
create policy "patient reads own prescription items" on public.prescription_items for select to authenticated using (exists(select 1 from public.prescriptions p where p.id=prescription_id and (p.patient_id=(select auth.uid()) and p.status in ('finalized','amended') or p.doctor_id in (select id from public.doctor_profiles where user_id=(select auth.uid())) and public.is_active_doctor())));
create policy "doctor manages own prescription items" on public.prescription_items for all to authenticated using (exists(select 1 from public.prescriptions p join public.doctor_profiles d on d.id=p.doctor_id where p.id=prescription_id and d.user_id=(select auth.uid()) and p.status='draft' and public.is_active_doctor())) with check (exists(select 1 from public.prescriptions p join public.doctor_profiles d on d.id=p.doctor_id where p.id=prescription_id and d.user_id=(select auth.uid()) and p.status='draft' and public.is_active_doctor()));
create policy "authorized patients read document metadata" on public.medical_documents for select to authenticated using (patient_id=(select auth.uid()) or uploaded_by=(select auth.uid()) or (public.current_role()='doctor' and public.can_access_patient(patient_id)));
create policy "patient uploads own document metadata" on public.medical_documents for insert to authenticated with check (patient_id=(select auth.uid()) and uploaded_by=(select auth.uid()) and public.current_role()='patient');
create policy "invoice owner and admin read" on public.invoices for select to authenticated using (patient_id=(select auth.uid()) or public.current_role()='administrator');
create policy "notification owner reads and marks read" on public.notifications for select to authenticated using (user_id=(select auth.uid()));
create policy "notification owner updates read timestamp" on public.notifications for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy "patient feedback for own completed visit" on public.feedback for insert to authenticated with check (patient_id=(select auth.uid()) and exists(select 1 from public.appointments a where a.id=appointment_id and a.patient_id=(select auth.uid()) and a.status='completed'));
create policy "patients and admins read feedback" on public.feedback for select to authenticated using (patient_id=(select auth.uid()) or public.current_role()='administrator');
create policy "administrators read audit logs" on public.audit_logs for select to authenticated using (public.current_role()='administrator');
-- No direct client write policy exists for audit events. Privileged workflows append them.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('medical-documents','medical-documents',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do nothing;
create policy "authorized care team reads private medical file" on storage.objects for select to authenticated using (
  bucket_id='medical-documents' and exists(select 1 from public.medical_documents m where m.storage_path=name and
    ((m.patient_id=(select auth.uid()) and (storage.foldername(name))[1]=(select auth.uid())::text) or
     (public.current_role()='doctor' and public.can_access_patient(m.patient_id) and (storage.foldername(name))[1]=m.patient_id::text)))
);
create policy "patient uploads private medical file" on storage.objects for insert to authenticated with check (bucket_id='medical-documents' and (storage.foldername(name))[1]=(select auth.uid())::text and (storage.extension(name) in ('pdf','jpg','jpeg','png')));
create policy "patient deletes own unreferenced upload" on storage.objects for delete to authenticated using (bucket_id='medical-documents' and (storage.foldername(name))[1]=(select auth.uid())::text and not exists(select 1 from public.medical_documents m where m.storage_path=name));

-- Provision the first administrator with a reviewed, out-of-band SQL operation after signup:
-- update public.profiles set role='administrator' where id='<verified auth.users UUID>';
