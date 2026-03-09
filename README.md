# MPIRE Property Management System

Professional property management system for **MPIRE Property Management, Oman**.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | Supabase (PostgreSQL) |
| ORM | Drizzle ORM |
| Auth | Supabase Auth + RLS |
| UI | shadcn/ui + Radix UI + Tailwind CSS 4 |
| i18n | next-intl (Arabic + English) |
| WhatsApp | Meta Cloud API (direct) |
| Email | Resend |
| Deployment | Vercel + Supabase Cloud |

## Features

- **Multi-property management** with unit tracking
- **Tenant lifecycle** (move-in, active, move-out with archival)
- **Rent & payment tracking** with cheque management
- **Automated reminders** via WhatsApp + Email (configurable templates)
- **Maintenance requests** with status tracking and notes
- **Document management** with expiry alerts
- **Dashboard & reports** with PDF/Excel export
- **Bilingual** Arabic (RTL) + English (LTR)
- **Role-based access** (Super Admin + Property Manager)
- **Row Level Security** enforced at the database level

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Supabase project (free tier works)
- Meta Business account (for WhatsApp API)
- Resend account (for email)

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd mpire
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials (see Environment Variables section below).

### 3. Database Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Run the migration SQL files in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_storage_setup.sql`
3. Go to SQL Editor in Supabase Dashboard and paste each file

### 4. Create First Admin User

1. In Supabase Dashboard > Authentication > Users > Add User
2. Create a user with email/password
3. In SQL Editor, update the role:

```sql
UPDATE users SET role = 'super_admin', full_name = 'Admin' WHERE email = 'your@email.com';
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (for cron) | Yes |
| `DATABASE_URL` | Direct PostgreSQL connection string | For Drizzle |
| `WHATSAPP_ACCESS_TOKEN` | Meta Cloud API permanent token | For WhatsApp |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp phone number ID | For WhatsApp |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Meta Business Account ID | For WhatsApp |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Custom token for webhook verification | For WhatsApp |
| `RESEND_API_KEY` | Resend API key | For Email |
| `RESEND_FROM_EMAIL` | Sender email address | For Email |
| `NEXT_PUBLIC_APP_URL` | Application URL | Yes |
| `CRON_SECRET` | Secret for Vercel Cron authentication | Yes |

## WhatsApp Integration Setup

### Meta Cloud API (Direct)

1. **Create Meta Business Account** at business.facebook.com
2. **Verify your business** (requires Oman trade license)
3. Go to developers.facebook.com > Create App > Business type > Add WhatsApp product
4. **Register phone number** with Coexistence mode enabled (keeps the WhatsApp Business App on the manager's phone active)
5. **Create message templates** for each reminder type in both Arabic and English. Submit for Meta approval.
6. **Generate System User token** (permanent access token)
7. **Configure webhook** pointing to `https://yourdomain.com/api/webhooks/whatsapp`
8. Store credentials in environment variables

### Template Names Convention

Templates should be named:
- `mpire_rent_upcoming_en` / `mpire_rent_upcoming_ar`
- `mpire_rent_overdue_en` / `mpire_rent_overdue_ar`
- `mpire_cheque_due_en` / `mpire_cheque_due_ar`
- `mpire_lease_expiry_en` / `mpire_lease_expiry_ar`

Each template uses variables: `{{1}}` tenant name, `{{2}}` unit number, `{{3}}` property name, `{{4}}` amount, `{{5}}` due date.

## Cron Jobs

Reminders are dispatched daily at 8:00 AM via Vercel Cron:

- **Rent upcoming**: 3 days before due date
- **Rent overdue**: 1 day after missed, then every 3 days
- **Cheque due**: 3 days before cheque date
- **Lease expiry**: 60, 30, and 7 days before end

Configuration is in `vercel.json`. The cron endpoint is protected by `CRON_SECRET`.

## Project Structure

```
src/
├── app/
│   ├── [locale]/
│   │   ├── auth/          # Login, callback
│   │   └── (dashboard)/   # Protected pages
│   │       ├── dashboard/
│   │       ├── properties/
│   │       ├── tenants/
│   │       ├── payments/
│   │       ├── cheques/
│   │       ├── maintenance/
│   │       ├── documents/
│   │       ├── reminders/
│   │       ├── reports/
│   │       └── settings/
│   └── api/
│       ├── cron/          # Scheduled jobs
│       ├── whatsapp/      # Manual send
│       └── webhooks/      # WhatsApp delivery status
├── components/
│   ├── ui/                # Design system components
│   └── layout/            # Sidebar, Topbar
├── db/
│   └── schema/            # Drizzle ORM schema
├── i18n/
│   └── messages/          # en.json, ar.json
├── lib/
│   ├── supabase/          # Client, server, middleware
│   ├── whatsapp/          # Meta Cloud API client
│   ├── email/             # Resend client
│   └── utils/             # Helpers
└── types/                 # TypeScript types
```

## Design System

**Theme: "Operational Clarity"** - Dark-first, teal accent, inspired by Linear/Vercel.

- **Font**: Geist (Latin) + IBM Plex Arabic (Arabic)
- **Colors**: Dark background (#0A0A0B), teal accent (#2DD4A8), amber warnings (#F5A623)
- **Light mode**: Available via toggle
- **RTL**: Full Arabic support with layout mirroring

## Deployment

### Vercel

```bash
vercel --prod
```

Set all environment variables in Vercel Dashboard > Settings > Environment Variables.

### Supabase

The Supabase project runs on Supabase Cloud. No self-hosting required.

## License

Private - MPIRE Property Management, Oman.
