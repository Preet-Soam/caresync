alter table public.feedback
  add column doctor_comment text check (char_length(doctor_comment) <= 800),
  add column clinic_comment text check (char_length(clinic_comment) <= 800);

create or replace function public.doctor_directory_reviews()
returns table (
  id uuid,
  doctor_id uuid,
  rating smallint,
  clinic_rating smallint,
  doctor_comment text,
  clinic_comment text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id,
    d.id,
    f.rating,
    f.clinic_rating,
    coalesce(f.doctor_comment, f.comment),
    coalesce(f.clinic_comment, f.comment),
    f.created_at
  from public.feedback f
  join public.appointments a on a.id = f.appointment_id
  join public.doctor_profiles d on d.id = a.doctor_id
  where f.moderation_status = 'visible'
    and d.verification_status = 'approved'
  order by f.created_at desc;
$$;

revoke all on function public.doctor_directory_reviews() from public;
grant execute on function public.doctor_directory_reviews() to anon, authenticated;

create or replace function public.admin_pending_reviews()
returns table (
  id uuid,
  doctor_id uuid,
  doctor_name text,
  specialty text,
  rating smallint,
  clinic_rating smallint,
  doctor_comment text,
  clinic_comment text,
  created_at timestamptz
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
  return query
  select f.id, d.id, p.full_name, d.specialty, f.rating, f.clinic_rating,
    coalesce(f.doctor_comment, f.comment), coalesce(f.clinic_comment, f.comment), f.created_at
  from public.feedback f
  join public.appointments a on a.id = f.appointment_id
  join public.doctor_profiles d on d.id = a.doctor_id
  join public.profiles p on p.id = d.user_id
  where f.moderation_status = 'pending'
  order by f.created_at asc;
end;
$$;

create or replace function public.moderate_patient_review(target_review uuid, make_visible boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare administrator uuid := auth.uid();
begin
  if public.current_role() is distinct from 'administrator' then
    raise exception 'Administrator access required';
  end if;
  update public.feedback
  set moderation_status = case when make_visible then 'visible' else 'hidden' end
  where id = target_review and moderation_status = 'pending';
  if not found then raise exception 'Pending review not found'; end if;
  insert into public.audit_logs(actor_id, action, resource_type, resource_id, safe_metadata)
  values(administrator, case when make_visible then 'review.approved' else 'review.hidden' end,
    'feedback', target_review, '{}'::jsonb);
end;
$$;

revoke all on function public.admin_pending_reviews() from public;
revoke all on function public.moderate_patient_review(uuid, boolean) from public;
grant execute on function public.admin_pending_reviews() to authenticated;
grant execute on function public.moderate_patient_review(uuid, boolean) to authenticated;
