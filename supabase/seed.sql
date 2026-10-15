-- Fictional reference departments for local demonstrations. No accounts or patient data are created.
insert into public.departments (name, description) values
  ('Heart & Vascular', 'Fictional demo department for cardiology.'),
  ('Skin & Wellness', 'Fictional demo department for dermatology.'),
  ('Children’s Health', 'Fictional demo department for pediatrics.'),
  ('Brain & Nerves', 'Fictional demo department for neurology.')
on conflict (name) do nothing;
