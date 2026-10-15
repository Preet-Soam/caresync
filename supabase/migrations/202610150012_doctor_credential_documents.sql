-- Private qualification evidence. Documents are accessible only to their doctor and administrators.
create table public.doctor_credential_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 240),
  credential_type text not null check (char_length(credential_type) between 1 and 120),
  review_status text not null default 'pending' check (review_status in ('pending','verified','rejected')),
  review_note text check (char_length(review_note) <= 500),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index doctor_credential_documents_user_idx on public.doctor_credential_documents(user_id,created_at desc);
alter table public.doctor_credential_documents enable row level security;
create policy "doctors and administrators read credential metadata" on public.doctor_credential_documents
for select to authenticated using (user_id=(select auth.uid()) or public.current_role()='administrator');
create policy "doctors upload own credential metadata" on public.doctor_credential_documents
for insert to authenticated with check (user_id=(select auth.uid()) and storage_path like (select auth.uid())::text || '/%' and public.current_role()='doctor' and review_status='pending' and reviewed_by is null and reviewed_at is null);
create policy "administrators review credentials" on public.doctor_credential_documents
for update to authenticated using (public.current_role()='administrator') with check (public.current_role()='administrator');
create policy "doctors remove own pending credential metadata" on public.doctor_credential_documents
for delete to authenticated using (user_id=(select auth.uid()) and review_status='pending');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('doctor-credentials','doctor-credentials',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do nothing;

create policy "doctors upload private credentials to own folder" on storage.objects
for insert to authenticated with check (
  bucket_id='doctor-credentials' and (storage.foldername(name))[1]=(select auth.uid())::text
  and public.current_role()='doctor' and (storage.extension(name) in ('pdf','jpg','jpeg','png'))
);
create policy "doctors and administrators read referenced credential files" on storage.objects
for select to authenticated using (
  bucket_id='doctor-credentials' and exists (
    select 1 from public.doctor_credential_documents c where c.storage_path=name
      and (c.user_id=(select auth.uid()) or public.current_role()='administrator')
  )
);
create policy "doctors delete own pending credential files" on storage.objects
for delete to authenticated using (
  bucket_id='doctor-credentials' and (storage.foldername(name))[1]=(select auth.uid())::text
  and (not exists(select 1 from public.doctor_credential_documents c where c.storage_path=name)
    or exists(select 1 from public.doctor_credential_documents c where c.storage_path=name and c.user_id=(select auth.uid()) and c.review_status='pending'))
);

grant select, insert, delete on public.doctor_credential_documents to authenticated;
grant update (review_status,review_note,reviewed_by,reviewed_at) on public.doctor_credential_documents to authenticated;

revoke update on public.doctor_profiles from authenticated;
grant update (clinic_name,clinic_address,clinic_city,clinic_state,clinic_postal_code,clinic_country,latitude,longitude,qualifications)
on public.doctor_profiles to authenticated;
