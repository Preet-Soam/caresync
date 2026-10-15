alter table public.doctor_profiles
  add column clinic_name text not null default '' check (char_length(clinic_name) <= 180),
  add column clinic_address text not null default '' check (char_length(clinic_address) <= 300),
  add column clinic_city text not null default '' check (char_length(clinic_city) <= 120),
  add column clinic_state text not null default '' check (char_length(clinic_state) <= 120),
  add column clinic_postal_code text not null default '' check (char_length(clinic_postal_code) <= 24),
  add column clinic_country text not null default 'India' check (char_length(clinic_country) <= 120),
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180),
  add constraint doctor_profiles_location_pair_check check ((latitude is null) = (longitude is null));

create index doctor_profiles_location_idx on public.doctor_profiles (clinic_country, clinic_state, clinic_city)
where verification_status = 'approved';

create policy "doctors edit own clinic location" on public.doctor_profiles
for update to authenticated
using (user_id = (select auth.uid()) and public.current_role() = 'doctor')
with check (user_id = (select auth.uid()) and public.current_role() = 'doctor');

revoke update on public.doctor_profiles from authenticated;
grant update (clinic_name, clinic_address, clinic_city, clinic_state, clinic_postal_code, clinic_country, latitude, longitude)
on public.doctor_profiles to authenticated;
