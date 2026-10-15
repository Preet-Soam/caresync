-- Record meaningful account and care-workflow changes, without copying health
-- details into the audit trail. Notifications are delivered only to the user
-- whose role should take the next action.

create or replace function public.record_site_activity(target_action text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare activity_id uuid;
begin
  if target_action not in ('session.started','session.ended') then
    raise exception 'Unsupported session activity';
  end if;
  if (select auth.uid()) is null or public.current_role() is null then
    raise exception 'Active account required';
  end if;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,safe_metadata)
    values((select auth.uid()),target_action,'session',(select auth.uid()),'{}'::jsonb)
    returning id into activity_id;
  return activity_id;
end;
$$;
revoke all on function public.record_site_activity(text) from public;
grant execute on function public.record_site_activity(text) to authenticated;

create or replace function public.capture_site_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role := public.current_role();
  recipient uuid;
  action_name text;
  object_id uuid;
  object_type text;
  notice_title text;
  notice_message text;
  notice_type text;
  related_visit uuid;
begin
  if tg_table_name = 'profiles' then
    object_id := new.id;
    object_type := 'profile';
    if tg_op = 'UPDATE' and old.account_status is distinct from new.account_status then
      action_name := 'account.status_changed';
      if actor_role = 'administrator' then
        insert into public.notifications(user_id,title,message,notification_type)
          values(new.id,'Account access updated','Your account access status has changed. Sign in to view the latest account state.','account');
      end if;
    elsif tg_op = 'UPDATE' and (old.full_name is distinct from new.full_name or old.phone is distinct from new.phone) then
      action_name := 'profile.updated';
    end if;

  elsif tg_table_name = 'patient_profiles' then
    object_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
    object_type := 'patient_profile';
    action_name := case when tg_op = 'INSERT' then 'patient.profile_created' else 'patient.profile_updated' end;

  elsif tg_table_name = 'doctor_profiles' then
    object_id := case when tg_op = 'DELETE' then old.id else new.id end;
    object_type := 'doctor_profile';
    if tg_op = 'UPDATE' and (
      old.specialty is distinct from new.specialty or old.qualifications is distinct from new.qualifications or
      old.experience_years is distinct from new.experience_years or old.biography is distinct from new.biography or
      old.clinic_name is distinct from new.clinic_name or old.clinic_address is distinct from new.clinic_address or
      old.clinic_city is distinct from new.clinic_city or old.clinic_state is distinct from new.clinic_state or
      old.clinic_postal_code is distinct from new.clinic_postal_code or old.clinic_country is distinct from new.clinic_country or
      old.latitude is distinct from new.latitude or old.longitude is distinct from new.longitude
    ) then action_name := 'doctor.practice_updated'; end if;

  elsif tg_table_name = 'doctor_availability' then
    object_id := case when tg_op = 'DELETE' then old.id else new.id end;
    object_type := 'doctor_availability';
    action_name := case when tg_op = 'INSERT' then 'availability.created' when tg_op = 'UPDATE' then 'availability.updated' else 'availability.deleted' end;

  elsif tg_table_name = 'appointments' and tg_op = 'UPDATE' and old.status is distinct from new.status then
    object_id := new.id;
    object_type := 'appointment';
    action_name := 'appointment.' || new.status::text;
    related_visit := new.id;
    if new.status::text in ('confirmed','rejected','completed') then
      recipient := new.patient_id;
      notice_type := 'appointment';
      notice_title := case new.status::text when 'confirmed' then 'Appointment accepted' when 'rejected' then 'Appointment update' else 'Visit completed' end;
      notice_message := case new.status::text when 'confirmed' then 'Your doctor accepted the appointment request.' when 'rejected' then 'Your appointment request was declined. Open appointments to review your options.' else 'Your visit has been marked complete. Check your records for the consultation summary.' end;
    elsif new.status::text = 'cancelled' then
      notice_type := 'appointment'; notice_title := 'Appointment cancelled';
      if actor_role = 'administrator' then
        recipient := new.patient_id;
        notice_message := 'An administrator updated your appointment. Open appointments for details.';
      else
        select d.user_id into recipient from public.doctor_profiles d where d.id=new.doctor_id;
        notice_message := 'A patient cancelled an appointment in your schedule.';
      end if;
    end if;

  elsif tg_table_name = 'consultations' then
    object_id := case when tg_op = 'DELETE' then old.id else new.id end;
    object_type := 'consultation';
    action_name := case when tg_op = 'INSERT' then 'consultation.created' when tg_op = 'UPDATE' then 'consultation.updated' else 'consultation.deleted' end;
    if tg_op = 'INSERT' then
      recipient := new.patient_id; notice_type := 'consultation'; notice_title := 'Visit summary available';
      notice_message := 'Your doctor saved a consultation summary. Open medical records to review it.';
      select a.id into related_visit from public.appointments a where a.id=new.appointment_id;
    end if;

  elsif tg_table_name = 'prescriptions' then
    object_id := case when tg_op = 'DELETE' then old.id else new.id end;
    object_type := 'prescription';
    if tg_op = 'UPDATE' and old.status::text not in ('finalized','amended') and new.status::text in ('finalized','amended') then
      action_name := 'prescription.issued';
      recipient := new.patient_id; notice_type := 'prescription'; notice_title := 'New prescription';
      notice_message := 'Your doctor issued a prescription. Open prescriptions to review the instructions.';
      select c.appointment_id into related_visit from public.consultations c where c.id=new.consultation_id;
    elsif tg_op = 'DELETE' then action_name := 'prescription.deleted'; end if;

  elsif tg_table_name = 'medical_documents' then
    object_id := case when tg_op = 'DELETE' then old.id else new.id end;
    object_type := 'medical_document';
    action_name := case when tg_op = 'INSERT' then 'medical_document.added' else 'medical_document.deleted' end;

  elsif tg_table_name = 'feedback' and tg_op = 'INSERT' then
    object_id := new.id; object_type := 'review'; action_name := 'review.submitted';
    notice_type := 'review'; notice_title := 'Patient feedback to review';
    notice_message := 'New patient feedback is waiting for moderation.';
    for recipient in select p.id from public.profiles p where p.role='administrator' and p.account_status='active' loop
      insert into public.notifications(user_id,title,message,notification_type)
        values(recipient,notice_title,notice_message,notice_type);
    end loop;

  elsif tg_table_name = 'doctor_requests' and tg_op = 'INSERT' then
    object_id := new.id; object_type := 'doctor_request';
    for recipient in select p.id from public.profiles p where p.role='administrator' and p.account_status='active' loop
      insert into public.notifications(user_id,title,message,notification_type)
        values(recipient,'Doctor application received','A provider application is ready for review.','doctor_request');
    end loop;

  elsif tg_table_name = 'invoices' then
    object_id := case when tg_op = 'DELETE' then old.id else new.id end;
    object_type := 'invoice';
    action_name := case when tg_op = 'INSERT' then 'invoice.created' when tg_op = 'UPDATE' and old.payment_status is distinct from new.payment_status then 'invoice.payment_status_changed' when tg_op = 'DELETE' then 'invoice.deleted' else null end;
    if tg_op = 'INSERT' then
      recipient := new.patient_id; notice_type := 'billing'; notice_title := 'New invoice available';
      notice_message := 'A new invoice is available in your billing workspace.';
    elsif tg_op = 'UPDATE' and old.payment_status is distinct from new.payment_status then
      recipient := new.patient_id; notice_type := 'billing'; notice_title := 'Invoice status updated';
      notice_message := 'Your invoice payment status changed. Open billing for details.';
    end if;
  end if;

  if action_name is not null and actor is not null
    and not (tg_table_name='profiles' and action_name='account.status_changed' and actor_role='administrator')
    and not (tg_table_name='appointments' and actor_role='administrator') then
    insert into public.audit_logs(actor_id,action,resource_type,resource_id,safe_metadata)
      values(actor,action_name,object_type,object_id,'{}'::jsonb);
  end if;
  if recipient is not null and notice_title is not null then
    insert into public.notifications(user_id,title,message,notification_type,related_appointment_id)
      values(recipient,notice_title,notice_message,notice_type,related_visit);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists site_audit_profiles on public.profiles;
create trigger site_audit_profiles after update on public.profiles for each row execute function public.capture_site_activity();
drop trigger if exists site_audit_patient_profiles on public.patient_profiles;
create trigger site_audit_patient_profiles after insert or update or delete on public.patient_profiles for each row execute function public.capture_site_activity();
drop trigger if exists site_audit_doctor_profiles on public.doctor_profiles;
create trigger site_audit_doctor_profiles after update on public.doctor_profiles for each row execute function public.capture_site_activity();
drop trigger if exists site_audit_availability on public.doctor_availability;
create trigger site_audit_availability after insert or update or delete on public.doctor_availability for each row execute function public.capture_site_activity();
drop trigger if exists site_audit_appointments on public.appointments;
create trigger site_audit_appointments after update on public.appointments for each row execute function public.capture_site_activity();
drop trigger if exists site_audit_consultations on public.consultations;
create trigger site_audit_consultations after insert or update or delete on public.consultations for each row execute function public.capture_site_activity();
drop trigger if exists site_audit_prescriptions on public.prescriptions;
create trigger site_audit_prescriptions after update or delete on public.prescriptions for each row execute function public.capture_site_activity();
drop trigger if exists site_audit_medical_documents on public.medical_documents;
create trigger site_audit_medical_documents after insert or delete on public.medical_documents for each row execute function public.capture_site_activity();
drop trigger if exists site_audit_feedback on public.feedback;
create trigger site_audit_feedback after insert on public.feedback for each row execute function public.capture_site_activity();
drop trigger if exists site_notify_doctor_requests on public.doctor_requests;
create trigger site_notify_doctor_requests after insert on public.doctor_requests for each row execute function public.capture_site_activity();
drop trigger if exists site_audit_invoices on public.invoices;
create trigger site_audit_invoices after insert or update or delete on public.invoices for each row execute function public.capture_site_activity();

comment on table public.audit_logs is 'Append-only metadata about meaningful website activity. Clinical note contents, medication instructions, and document contents are excluded.';
