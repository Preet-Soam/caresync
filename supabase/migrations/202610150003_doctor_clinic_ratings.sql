alter table public.feedback
  add column clinic_rating smallint check (clinic_rating between 1 and 5);

create or replace function public.doctor_directory_ratings()
returns table (
  doctor_id uuid,
  doctor_rating numeric,
  doctor_review_count bigint,
  clinic_rating numeric,
  clinic_review_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id,
    round(avg(f.rating)::numeric, 1), count(f.rating),
    round(avg(f.clinic_rating)::numeric, 1), count(f.clinic_rating)
  from public.doctor_profiles d
  left join public.appointments a on a.doctor_id = d.id
  left join public.feedback f on f.appointment_id = a.id and f.moderation_status = 'visible'
  where d.verification_status = 'approved'
  group by d.id;
$$;

revoke all on function public.doctor_directory_ratings() from public;
grant execute on function public.doctor_directory_ratings() to anon, authenticated;
