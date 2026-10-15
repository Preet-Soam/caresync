-- Keep phone-created accounts contactable in the application profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, phone, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email, new.phone, 'patient');
  insert into public.patient_profiles (user_id) values (new.id);
  return new;
end;
$$;

-- A doctor applicant is locked out of every patient and provider workspace
-- while an administrator evaluates the request.
create or replace function public.submit_doctor_request(
  request_specialty text, request_qualifications text, request_experience smallint default null,
  request_department uuid default null, request_biography text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare applicant uuid := auth.uid(); request_id uuid;
begin
  if applicant is null or (select role from public.profiles where id=applicant and account_status='active') is distinct from 'patient' then
    raise exception 'An active patient account is required to apply';
  end if;
  if nullif(trim(request_specialty),'') is null or nullif(trim(request_qualifications),'') is null then
    raise exception 'Specialty and professional qualifications are required';
  end if;
  insert into public.doctor_requests(user_id,specialty,qualifications,experience_years,department_id,biography,status)
  values(applicant,left(trim(request_specialty),120),left(trim(request_qualifications),1000),request_experience,request_department,left(trim(coalesce(request_biography,'')),2000),'pending')
  on conflict(user_id) do update set specialty=excluded.specialty,qualifications=excluded.qualifications,
    experience_years=excluded.experience_years,department_id=excluded.department_id,biography=excluded.biography,
    status='pending',review_note=null,reviewed_by=null,reviewed_at=null,updated_at=now()
  where public.doctor_requests.status='rejected'
  returning id into request_id;
  if request_id is null then raise exception 'A doctor application is already under review or approved'; end if;
  update public.profiles set account_status='inactive',updated_at=now() where id=applicant and role='patient';
  if not found then raise exception 'The applicant account could not be locked'; end if;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,safe_metadata)
  values(applicant,'doctor.requested','doctor_request',request_id,jsonb_build_object('specialty',left(trim(request_specialty),120)));
  return request_id;
end;
$$;
revoke all on function public.submit_doctor_request(text,text,smallint,uuid,text) from public;
grant execute on function public.submit_doctor_request(text,text,smallint,uuid,text) to authenticated;

create or replace function public.review_doctor_request(target_request uuid, approve boolean, decision_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare request_row public.doctor_requests%rowtype; administrator uuid := auth.uid();
begin
  if public.current_role() is distinct from 'administrator' then raise exception 'Administrator access required'; end if;
  select * into request_row from public.doctor_requests where id=target_request and status='pending' for update;
  if request_row.id is null then raise exception 'Pending doctor request not found'; end if;
  if approve then
    update public.profiles set role='doctor',account_status='active',updated_at=now()
      where id=request_row.user_id and role='patient' and account_status='inactive';
    if not found then raise exception 'Applicant account is not awaiting doctor approval'; end if;
    insert into public.doctor_profiles(user_id,specialty,qualifications,experience_years,department_id,biography,verification_status)
      values(request_row.user_id,request_row.specialty,request_row.qualifications,request_row.experience_years,request_row.department_id,request_row.biography,'approved');
    insert into public.notifications(user_id,title,message,notification_type)
      values(request_row.user_id,'Doctor account approved','Your doctor account has been approved. Sign in to complete your practice profile.','account');
  else
    update public.profiles set account_status='active',updated_at=now()
      where id=request_row.user_id and role='patient' and account_status='inactive';
    insert into public.notifications(user_id,title,message,notification_type)
      values(request_row.user_id,'Doctor application reviewed','Your application was not approved. Sign in to review the decision with CareSync support.','account');
  end if;
  update public.doctor_requests set status=case when approve then 'approved' else 'rejected' end,
    review_note=left(coalesce(decision_note,''),500),reviewed_by=administrator,reviewed_at=now(),updated_at=now()
    where id=target_request;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,safe_metadata)
  values(administrator,case when approve then 'doctor.approved' else 'doctor.rejected' end,'doctor_request',target_request,
    jsonb_build_object('applicant_id',request_row.user_id));
end;
$$;
revoke all on function public.review_doctor_request(uuid,boolean,text) from public;
grant execute on function public.review_doctor_request(uuid,boolean,text) to authenticated;

-- Applicants can submit verification documents after they send the request,
-- even though the account itself is locked while review is pending.
drop policy if exists "doctors upload own credential metadata" on public.doctor_credential_documents;
create policy "doctors and pending applicants upload own credential metadata" on public.doctor_credential_documents
for insert to authenticated with check (
  user_id=(select auth.uid())
  and storage_path like (select auth.uid())::text || '/%'
  and review_status='pending' and reviewed_by is null and reviewed_at is null
  and (
    public.current_role()='doctor'
    or exists(select 1 from public.doctor_requests r where r.user_id=(select auth.uid()) and r.status='pending')
  )
);
drop policy if exists "doctors upload private credentials to own folder" on storage.objects;
create policy "doctors and pending applicants upload private credentials" on storage.objects
for insert to authenticated with check (
  bucket_id='doctor-credentials' and (storage.foldername(name))[1]=(select auth.uid())::text
  and (storage.extension(name) in ('pdf','jpg','jpeg','png'))
  and (
    public.current_role()='doctor'
    or exists(select 1 from public.doctor_requests r where r.user_id=(select auth.uid()) and r.status='pending')
  )
);
