# CareSync

CareSync is a responsive healthcare coordination MVP built with React, TypeScript, Vite, Tailwind CSS, and Supabase. The public site and role-based demo work without external credentials. Demo clinical data is fictional and held in the current page session. Demo clinic-profile edits are stored in this browser only; neither is a clinical record service.

## Run locally

1. Install Node.js 20 or newer.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local` and add a Supabase project URL and public anon key if using connected authentication.
4. Start the local app with `npm run dev`.
5. Open the URL shown by Vite and choose one of the three demo roles, or create a patient account after configuring Supabase.

### Windows launcher

Run `caresync.bat` from File Explorer or a terminal. Its menu has **Start** and **End**: Start checks for Node.js 20 or newer, installs packages if needed, launches the app at `http://127.0.0.1:5173`, and opens it in your browser. End stops the server started by the launcher. The Vite server runs in a separate window while the app is open.

The Supabase anon key is intended for browser use and is constrained by row-level security. Never put a service-role key in `.env.local` under a `VITE_` name or in any browser bundle.

## Demo walkthrough

Without `.env.local`, use the demo account shortcuts on `/login`. Patients can open **Find a doctor**, allow browser location to sort fictional nearby clinics, inspect addresses, qualifications, sample doctor and clinic ratings and comments, and request an available appointment. Doctors can review the shared demo waiting list, accept or decline requests, create visit summaries, issue prescriptions, and publish weekly hours. Patient appointments, doctor visit summaries, and prescriptions sync between role workspaces within the same browser session. First-time patient and doctor workspaces show a quick setup guide that can be reopened in Settings. Demo clinical data is fictional and remains in browser memory.

Doctors can set recurring weekday hours, one-day openings, blocked times, holidays, and leave in their practice time zone. The schedule editor includes a downloadable spreadsheet template and imports `.xlsx` and `.csv` timetables. Patients see the remaining available slots and choose an in-person, video, or phone appointment type. In connected mode, the database validates bookings against the saved schedule and time zone.

Confirmed video visits use private Supabase Realtime signaling and browser WebRTC. Calls are not recorded by default. A doctor can ask the patient to record; recording starts only after both participants grant appointment-specific consent. Either person can stop; if the patient withdraws consent, the in-progress recording is discarded. A saved recording is uploaded to the private `video-recordings` bucket, appears in the patient's **Online sessions** library, and can be reviewed or removed by an administrator under **Session recordings**. The browser limits recordings to 45 minutes and 256 MB. Configure a TURN relay for dependable calls across restrictive networks; the included STUN servers alone cannot guarantee connectivity.

After a completed visit, patients can submit separate doctor and clinic ratings and comments. Live comments are shown in the directory only after an administrator approves them in **Reviews**. Administrators can register and maintain clinics, hospitals, and diagnostic centres in **Hospitals & clinics**, assign approved providers to an active facility, and manage departments, applications, accounts, appointments, and the audit trail. An assigned active facility supplies the patient directory address and map coordinates.

## Supabase setup

1. Create a Supabase project and link it with the Supabase CLI.
2. Apply all migrations using `supabase db push`: the initial schema, clinic location fields, doctor/clinic ratings and review comments, doctor workspace, administrator operations, connected health facilities, the audit log and role notifications, doctor schedules, private video signaling, doctor credential documents, mobile login and provider approval, and mutually consented private session recordings.
3. Add the project URL and anon key to `.env.local`, then restart the Vite server.
4. Enable email/password authentication and configure the email templates and allowed redirect URLs for local and deployed origins. To support mobile login, also configure an SMS provider and phone OTP settings in Supabase Auth. The application's 10-digit phone normalization currently assumes the India `+91` country code.
5. Sign up with a patient account. The database trigger creates its patient profile; client metadata cannot set a privileged role.
6. Provision the first administrator only after verifying the intended account, using an authorized database operator workflow. The migration includes a commented setup example. Administrator provisioning must never be exposed to public signup.
7. Doctors must have an approved profile before clinic details and workspace tools are available. Facility assignments are made by administrators and require an active facility; deactivating a facility clears its provider links. Ratings appear in the live directory only after review moderation. The policies and schema are an initial base and must be reviewed before real health information is used.

Appointment booking uses the database `book_appointment` RPC once a real patient session and approved doctor profile exist. Its database exclusion constraint prevents overlapping active reservations for one doctor. The current UI's sample doctor IDs and time choices are for demo mode; the live directory reads approved doctor profiles and the database rejects unavailable times.

## Integrations

- Configured in the app: React Router, Supabase JS client, in-app demo feedback.
- Requires project setup: Supabase Auth, PostgreSQL migration, RLS, private Storage bucket.
- Not configured: email/SMS delivery, payment processor, AI report explanation, reminder scheduler, Vercel deployment.

## Current scope and limitations

- Landing, demo login, role-based onboarding, three role workspaces, nearby provider discovery, appointment slot booking, doctor schedules and consultation summaries, patient records and prescriptions, administrator controls, facility management, an audit log, and responsive navigation are present.
- The connected auth and patient booking paths are early integrations. Not every dashboard action persists yet; demo actions are labeled accordingly.
- The migration is a starting point for security review. It does not make a deployment compliant with any healthcare regulation. Review SQL policies and test them against real Supabase roles before real patient data.
- Demo account shortcuts are intentionally unavailable when Supabase is configured, because they are not real authenticated sessions.
- There is no payment processing, clinical decision support, or automatic medical content generation.

## Deployment

Deploy the Vite frontend to Render by connecting this repository as a Blueprint; Render reads `render.yaml`, builds with `npm ci && npm run build`, and serves `dist/` with a rewrite for React Router routes. If using Supabase, configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Render service's build environment and configure authentication redirects in Supabase separately. Do not deploy with real patient information until access controls, operational processes, legal terms, and clinical workflows have received appropriate review.
