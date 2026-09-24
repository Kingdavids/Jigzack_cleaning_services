# Jigzack Cleaning Services

Website and customer, employee and admin dashboards for Jigzack Cleaning Services, a LAWMA-approved waste collection company in Lagos and Port Harcourt.

Built with Next.js 16 (App Router), Supabase (auth, Postgres, storage, realtime), Tailwind CSS 4, and Resend for email. Hosted on Railway.

## What is in it

- **Public site:** home, about, services and contact pages.
- **Customers:** sign up, confirm email, fill in property details, wait for approval, then see their schedule, before and after photos, invoices and receipts.
- **Employees:** invite only. An admin creates an invite link; the person signs up through it. They see their assigned pickups, run a timer and upload before and after photos.
- **Admin:** approvals, customer records, estates and units, employees and invites, task schedule, uploads, messages and payments. Schedules and monthly invoices are generated from each customer's pickup frequency and property details, and can be edited.

## Running locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000.

Checks before pushing:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## Database

`supabase/schema.sql` describes the tables, row level security policies, storage bucket and helper functions. Run it in the Supabase SQL editor for a fresh project. Access control lives in those policies, so the anon key in the browser cannot read or change anything it should not.

## Environment variables

See `.env.example` for the full list and what each one does. Never commit real keys.

## Project layout

- `app/` routes and server actions (`app/admin/actions.ts`, `app/employee/actions.ts`)
- `components/` UI, split into `auth`, `dashboard` and `ui`
- `lib/` billing rules (`lib/billing`), auth helpers, email
- `proxy.ts` refreshes the Supabase session and sends logged-out visitors from dashboard links to login
- `supabase/schema.sql` database schema and policies
