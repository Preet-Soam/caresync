create table public.health_facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 180),
  facility_type text not null default 'clinic' check (facility_type in ('clinic','hospital','diagnostic_center')),
  address text not null check (char_length(trim(address)) between 2 and 300),
  city text not null check (char_length(trim(city)) between 1 and 120),
  state text not null check (char_length(trim(state)) between 1 and 120),
  postal_code text not null check (char_length(trim(postal_code)) between 2 and 20),
  country text not null default 'India' check (char_length(trim(country)) between 2 and 80),
  phone text check (char_length(phone) <= 40),
  latitude double precision,
  longitude double precision,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);
create index health_facilities_status_name_idx on public.health_facilities(status,name);
create unique index health_facilities_identity_idx on public.health_facilities(lower(name),lower(address),lower(city),lower(postal_code));
alter table public.doctor_profiles add column facility_id uuid references public.health_facilities(id) on delete set null;
create index doctor_profiles_facility_idx on public.doctor_profiles(facility_id) where facility_id is not null;
create trigger health_facilities_touch_updated_at before update on public.health_facilities for each row execute function public.touch_updated_at();

alter table public.health_facilities enable row level security;
create policy "public reads active facilities" on public.health_facilities for select to anon,authenticated using (status='active' or public.current_role()='administrator');
create policy "administrators manage facilities" on public.health_facilities for all to authenticated using (public.current_role()='administrator') with check (public.current_role()='administrator');
grant select on public.health_facilities to anon,authenticated;
grant insert,update on public.health_facilities to authenticated;

create function public.admin_assign_doctor_facility(target_doctor uuid, target_facility uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_role() is distinct from 'administrator' then
    raise exception 'Administrator access required';
  end if;
  if target_facility is not null and not exists(select 1 from public.health_facilities where id=target_facility and status='active') then
    raise exception 'Choose an active clinic or hospital';
  end if;
  update public.doctor_profiles set facility_id=target_facility where id=target_doctor;
  if not found then raise exception 'Doctor profile not found'; end if;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,safe_metadata)
    values((select auth.uid()),'doctor.facility_assigned','doctor_profile',target_doctor,jsonb_build_object('facility_id',target_facility));
end;
$$;
revoke all on function public.admin_assign_doctor_facility(uuid,uuid) from public;
grant execute on function public.admin_assign_doctor_facility(uuid,uuid) to authenticated;

create function public.admin_set_facility_status(target_facility uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_role() is distinct from 'administrator' then
    raise exception 'Administrator access required';
  end if;
  if new_status not in ('active','inactive') then
    raise exception 'Invalid facility status';
  end if;
  update public.health_facilities set status=new_status where id=target_facility;
  if not found then raise exception 'Facility not found'; end if;
  if new_status='inactive' then
    update public.doctor_profiles set facility_id=null where facility_id=target_facility;
  end if;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,safe_metadata)
    values((select auth.uid()),'facility.status_changed','health_facility',target_facility,jsonb_build_object('status',new_status));
end;
$$;
revoke all on function public.admin_set_facility_status(uuid,text) from public;
grant execute on function public.admin_set_facility_status(uuid,text) to authenticated;
