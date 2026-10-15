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

Without `.env.local`, use the demo account shortcuts on `/login`. Patients can open **Find a doctor**, allow browser location to sort fictional nearby clinics, inspect addresses, qualifications, sample doctor and clinic ratings and comments, and open directions. After a completed visit, patients can submit separate doctor and clinic ratings and comments. Live comments are shown in the directory only after an administrator approves them in **Reviews**. Doctors can use **Clinic profile** to enter a practice address and optional map coordinates. Demo profile information is stored only in this browser. Appointment requests and reviews remain fictional demo actions.

## Supabase setup

1. Create a Supabase project and link it with the Supabase CLI.
2. Apply all migrations using `supabase db push`: the initial schema, clinic location fields, doctor/clinic ratings, and patient review comments.
3. Add the project URL and anon key to `.env.local`, then restart the Vite server.
4. Enable email/password authentication and configure the email templates and allowed redirect URLs for local and deployed origins.
5. Sign up with a patient account. The database trigger creates its patient profile; client metadata cannot set a privileged role.
6. Provision the first administrator only after verifying the intended account, using an authorized database operator workflow. The migration includes a commented setup example. Administrator provisioning must never be exposed to public signup.
7. Doctor application and approval screens, consultations, prescriptions, private-file upload UI, and live admin analytics are not yet wired to the database. A doctor profile must already be approved before clinic details can be saved. Ratings appear in the live directory only after review moderation. The policies and schema are an initial base and must be reviewed before real health information is used.

Appointment booking uses the database `book_appointment` RPC once a real patient session and approved doctor profile exist. Its database exclusion constraint prevents overlapping active reservations for one doctor. The current UI's sample doctor IDs and time choices are for demo mode; the live directory reads approved doctor profiles and the database rejects unavailable times.

## Integrations

- Configured in the app: React Router, Supabase JS client, in-app demo feedback.
- Requires project setup: Supabase Auth, PostgreSQL migration, RLS, private Storage bucket.
- Not configured: email/SMS delivery, payment processor, AI report explanation, reminder scheduler, Vercel deployment.

## Current scope and limitations

- Landing, demo login, three role-based workspaces, nearby doctor directory, clinic location setup, appointment request demo, settings, and responsive navigation are present.
- The connected auth and patient booking paths are early integrations. Not every dashboard action persists yet; demo actions are labeled accordingly.
- The migration is a starting point for security review. It does not make a deployment compliant with any healthcare regulation. Review SQL policies and test them against real Supabase roles before real patient data.
- Demo account shortcuts are intentionally unavailable when Supabase is configured, because they are not real authenticated sessions.
- There is no payment processing, clinical decision support, or automatic medical content generation.

## Deployment

Deploy the Vite frontend to Render by connecting this repository as a Blueprint; Render reads `render.yaml`, builds with `npm ci && npm run build`, and serves `dist/` with a rewrite for React Router routes. If using Supabase, configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Render service's build environment and configure authentication redirects in Supabase separately. Do not deploy with real patient information until access controls, operational processes, legal terms, and clinical workflows have received appropriate review.
