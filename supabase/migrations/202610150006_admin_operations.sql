-- Administrative overview exposes aggregate counts only.
create function public.admin_dashboard_summary()
returns table (
  patient_accounts bigint,
  doctor_accounts bigint,
  pending_doctor_requests bigint,
  requested_appointments bigint,
  confirmed_appointments bigint,
  reviews_awaiting_moderation bigint,
  appointments_today bigint,
  outstanding_invoices numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_role() is distinct from 'administrator' then
    raise exception 'Administrator access required';
  end if;
  return query select
    (select count(*) from public.profiles where role='patient' and account_status='active'),
    (select count(*) from public.doctor_profiles d join public.profiles p on p.id=d.user_id where p.account_status='active'),
    (select count(*) from public.doctor_requests where status='pending'),
    (select count(*) from public.appointments where status='requested'),
    (select count(*) from public.appointments where status='confirmed'),
    (select count(*) from public.feedback where moderation_status='pending'),
    (select count(*) from public.appointments where status in ('requested','confirmed','completed') and scheduled_start >= date_trunc('day', now()) and scheduled_start < date_trunc('day', now()) + interval '1 day'),
    (select coalesce(sum(amount),0) from public.invoices where payment_status='pending' and currency='INR');
end;
$$;
revoke all on function public.admin_dashboard_summary() from public;
grant execute on function public.admin_dashboard_summary() to authenticated;

-- Account access changes are restricted to patients and doctors; this RPC
-- cannot create or modify another administrator.
create function public.admin_set_account_status(target_user uuid, new_status public.account_state)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare changed_role public.app_role;
begin
  if public.current_role() is distinct from 'administrator' then
    raise exception 'Administrator access required';
  end if;
  if target_user = (select auth.uid()) then raise exception 'Administrators cannot change their own access here'; end if;
  update public.profiles set account_status=new_status
    where id=target_user and role in ('patient','doctor') returning role into changed_role;
  if changed_role is null then raise exception 'Patient or doctor account not found'; end if;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,safe_metadata)
  values((select auth.uid()),'account.status_changed','profile',target_user,jsonb_build_object('role',changed_role,'status',new_status));
end;
$$;
revoke all on function public.admin_set_account_status(uuid, public.account_state) from public;
grant execute on function public.admin_set_account_status(uuid, public.account_state) to authenticated;

-- Administrators can stop or reject a requested/confirmed visit; clinical
-- acceptance and completion remain with the treating provider.
create function public.admin_resolve_appointment(target_appointment uuid, resolution text, resolution_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment_row public.appointments%rowtype;
  target_doctor_user uuid;
  next_status public.appointment_state;
begin
  if public.current_role() is distinct from 'administrator' then
    raise exception 'Administrator access required';
  end if;
  if resolution not in ('cancelled','rejected') then raise exception 'Choose a supported appointment resolution'; end if;
  if nullif(trim(resolution_note),'') is null then raise exception 'Add a reason for the appointment change'; end if;
  select * into appointment_row from public.appointments where id=target_appointment and status in ('requested','confirmed') for update;
  if appointment_row.id is null then raise exception 'Appointment is no longer open'; end if;
  next_status := resolution::public.appointment_state;
  update public.appointments set status=next_status,cancellation_reason=left(trim(resolution_note),500),updated_at=now()
    where id=target_appointment;
  select user_id into target_doctor_user from public.doctor_profiles where id=appointment_row.doctor_id;
  insert into public.notifications(user_id,title,message,notification_type,related_appointment_id)
    values(appointment_row.patient_id,'Appointment updated','An administrator updated your appointment. Please review your visit details.','appointment',target_appointment);
  if target_doctor_user is not null then
    insert into public.notifications(user_id,title,message,notification_type,related_appointment_id)
      values(target_doctor_user,'Appointment updated','An administrator updated an appointment on your schedule.','appointment',target_appointment);
  end if;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,safe_metadata)
    values((select auth.uid()),'appointment.'||resolution,'appointment',target_appointment,jsonb_build_object('reason',left(trim(resolution_note),500)));
end;
$$;
revoke all on function public.admin_resolve_appointment(uuid,text,text) from public;
grant execute on function public.admin_resolve_appointment(uuid,text,text) to authenticated;
