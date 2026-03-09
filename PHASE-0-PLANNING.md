# MPIRE Property Management System — Phase 0 Planning

**Date**: 2026-03-09
**Status**: Awaiting Approval

---

## 0.1 — Stack Decision

### Options Evaluated

| Criteria | Next.js 15 + Supabase | Remix + PostgreSQL + Prisma | SvelteKit + PocketBase |
|---|---|---|---|
| **Multi-role Auth** | ★★★★★ Supabase Auth + RLS built-in | ★★★★ Manual via Prisma + session lib | ★★★ PocketBase has basic auth, limited RLS |
| **Real-time Updates** | ★★★★★ Supabase Realtime (Postgres changes, Broadcast, Presence) | ★★★ Requires adding WebSocket server (Socket.io / Ably) | ★★★★ PocketBase has real-time subscriptions |
| **File Storage** | ★★★★★ Supabase Storage (S3-compatible, signed URLs, policies) | ★★★ Must add S3/Cloudflare R2 separately | ★★★★ PocketBase has built-in file storage |
| **Scheduled Jobs** | ★★★★★ Supabase pg_cron + Vercel Cron + Edge Functions | ★★★ External cron service needed | ★★ Must self-host cron separately |
| **RTL/LTR + i18n** | ★★★★★ next-intl / next-i18next mature, huge ecosystem | ★★★★ remix-i18next works well | ★★★ svelte-i18n exists but smaller ecosystem |
| **Deployment** | ★★★★★ Vercel native, zero-config | ★★★★ Vercel/Fly.io, straightforward | ★★ PocketBase requires VPS (self-hosted) |
| **Ecosystem / Hiring** | ★★★★★ Largest React ecosystem, shadcn/ui, thousands of packages | ★★★★ Full React ecosystem access | ★★ Smaller talent pool, fewer libraries |
| **Form-heavy UX** | ★★★★ Server Actions + react-hook-form | ★★★★★ Remix excels at forms natively | ★★★★ SvelteKit forms are clean |
| **Production Maturity** | ★★★★★ Battle-tested at scale (Vercel, Netflix, etc.) | ★★★★ Solid but merged into React Router 7, transitional period | ★★★ PocketBase is still <v1.0 |

### Scoring Summary

| Stack | Total Score (out of 45) |
|---|---|
| **Next.js 16 + Supabase** | **43** |
| React Router v7 + PostgreSQL + Prisma | 34 |
| SvelteKit + PocketBase | 26 |

> **Note on versions (as of March 2026):** Next.js 16.1.x is current stable (shipped Oct 2025) with Turbopack as default bundler and stable React Compiler. Remix has merged into React Router v7 (Nov 2024). PocketBase remains pre-v1.0 (v0.36.x). Supabase pg_cron now supports sub-minute intervals.

### ★ Recommendation: Next.js 16 (App Router) + Supabase

**Why this stack wins for MPIRE:**

1. **Supabase is an all-in-one backend**: Auth, PostgreSQL database, Row Level Security, real-time subscriptions, file storage, Edge Functions, and pg_cron — all from one platform. This eliminates the need to integrate 5+ separate services.

2. **Row Level Security (RLS)** is critical for multi-role property management. Property managers should only see their assigned properties' data. RLS policies enforce this at the database level, making it impossible to accidentally leak data even if application code has bugs.

3. **Real-time is built-in**: When a payment is logged or a maintenance request status changes, all connected dashboards update instantly via Supabase Realtime. No WebSocket server to manage.

4. **Supabase Storage** with signed URLs and storage policies handles lease documents, ID copies, and maintenance photos securely. Access control mirrors database RLS.

5. **Scheduled reminders** via Supabase pg_cron (runs SQL on schedule) + Vercel Cron Routes (HTTP endpoints triggered on schedule) gives two complementary cron mechanisms for WhatsApp/email reminders.

6. **Next.js App Router** provides: Server Components (fast initial loads), Server Actions (form submissions without API routes), middleware (auth guards), and streaming (skeleton loaders built-in).

7. **Ecosystem depth**: shadcn/ui for the component library (highly customizable, not opinionated), next-intl for bilingual support, react-hook-form + zod for validation, Tailwind CSS for styling with RTL support via `rtl:` variant.

8. **Deployment**: Vercel deployment is zero-config for Next.js. Supabase offers a generous free tier and managed hosting.

**Specific versions / packages:**

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 16 (App Router) | Full-stack React framework |
| Database + Auth | Supabase (PostgreSQL 15) | Auth, DB, RLS, Realtime, Storage |
| ORM | Drizzle ORM | Type-safe SQL, lightweight, great Supabase compat |
| UI Components | shadcn/ui + Radix UI | Accessible, customizable components |
| Styling | Tailwind CSS 4 | Utility-first CSS with RTL plugin |
| Forms | react-hook-form + zod | Validation and form state |
| i18n | next-intl | Bilingual AR/EN with RTL support |
| Charts | Recharts or Tremor | Dashboard visualizations |
| PDF Export | @react-pdf/renderer | Generate reports |
| Excel Export | xlsx / ExcelJS | Spreadsheet exports |
| Email | Resend | Transactional emails |
| WhatsApp | Meta Cloud API (see 0.2) | Automated reminders |
| Cron | Vercel Cron + Supabase pg_cron | Scheduled reminder dispatch |
| Deployment | Vercel + Supabase Cloud | Hosting |

---

## 0.2 — WhatsApp Integration Decision

### Options Evaluated

#### Option 1: WhatsApp Business API (Meta Cloud API) — ★ RECOMMENDED

| Aspect | Details |
|---|---|
| **Phone coexistence** | **YES** — Meta launched "Coexistence mode" (May 2025, now broadly available). The same number works simultaneously on the WhatsApp Business App (physical phone) and Cloud API (automation). Messages mirror between both. Requires WhatsApp Business App v2.24.17+ on the phone. Minor trade-offs: throughput reduced to 20 msg/sec (irrelevant for rent reminders), disappearing messages and view-once media disabled. |
| **Setup** | Create Meta Business account → complete Meta Business Verification (requires Oman trade license) → create Developer App → add WhatsApp product → register phone number with Coexistence enabled → submit message templates → generate System User permanent access token |
| **Cost** | Utility conversations (reminders) cost ~$0.005–0.015 per conversation (24h window) depending on country. For Oman: ~$0.015/conversation. For 200 tenants × 4 reminders/month = ~$12/month. |
| **Ban risk** | Zero — this is the official API. |
| **Template messages** | Full support. Templates must be pre-approved by Meta (usually 24h). Supports variables like `{{1}}`, `{{2}}` for tenant name, amount, etc. Utility category = cheapest rates + fastest approval. Arabic and English templates both supported. |
| **Scheduling** | API is stateless HTTP calls — our cron job calls the API when a reminder is due. |
| **Rate limits** | Starts at 250 messages/24h, scales to 100K+ with quality rating. More than sufficient for property management. |

#### Option 2: Twilio WhatsApp Business API

| Aspect | Details |
|---|---|
| **Phone coexistence** | Same as Meta Cloud API (Twilio is a wrapper). YES with coexistence mode. |
| **Setup** | Twilio account → WhatsApp Sender registration → phone number provisioning or BYON (Bring Your Own Number) |
| **Cost** | Twilio markup: $0.005/message + Meta's conversation fee. Roughly 2× the cost of direct Meta API. |
| **Ban risk** | Zero — official API underneath. |
| **Template messages** | Full support via Twilio Content Templates. |
| **Verdict** | Good abstraction layer, but adds unnecessary cost and an intermediary for a straightforward integration. Better for multi-channel (SMS + WhatsApp + Voice) scenarios. |

#### Option 3: Baileys / WWebJS (Unofficial)

| Aspect | Details |
|---|---|
| **Phone coexistence** | Technically yes (mimics WhatsApp Web linked device). But unreliable — sessions drop, require QR re-scan. |
| **Setup** | npm install + QR code scan from phone. Simple technically but fragile. |
| **Cost** | Free (open source). |
| **Ban risk** | **HIGH AND INCREASING** — Violates WhatsApp ToS. Reports of escalating bans throughout 2025: accounts that ran bots for 3+ years are now being permanently banned. A malicious npm package mimicking Baileys was discovered late 2025 (supply chain risk). WWebJS is still alpha (v1.34.5-alpha.3). No predictable pattern — may work for months or get banned in a week. |
| **Verdict** | **Rejected.** The risk of permanently losing the business WhatsApp number (and the entire tenant contact network) makes this a non-starter. Saving ~$12/month vs. official API does not justify the risk. |

#### Option 4: SaaS Wrappers (WATI, AiSensy, Zoko)

| Aspect | Details |
|---|---|
| **Phone coexistence** | YES — all use Meta Cloud API underneath, so coexistence mode works. |
| **Setup** | Sign up → connect WhatsApp number → configure templates via GUI → use their API |
| **Cost** | WATI: ~$49/month (1,000 conversations) to $98/month (unlimited). AiSensy: ~$20/month base. Zoko: ~$35/month. All charge Meta's conversation fees on top. |
| **Benefit** | GUI template editor, built-in analytics, no-code automation flows |
| **Verdict** | Adds monthly SaaS cost for features we'll build natively in MPIRE. Makes sense if you want a no-code solution, but unnecessary when we're building a full system with our own template engine and scheduler. |

### ★ Recommendation: Meta Cloud API (Direct)

**Why:**

1. **Cheapest option** — only pay Meta's per-conversation fees (~$12/month for typical usage)
2. **Full control** — templates, scheduling, and logging all managed within our system
3. **Phone coexistence confirmed** — the manager's WhatsApp Business App on their phone continues to work normally alongside our API integration
4. **No intermediary** — direct HTTP calls to Meta's Graph API, simple to implement and debug
5. **No ban risk** — fully compliant with WhatsApp's policies

**Setup Steps:**

1. Create a Meta Business account at business.facebook.com
2. Complete Meta Business Verification (requires business documents — trade license for Oman)
3. Go to developers.facebook.com → Create App → select "Business" type → add WhatsApp product
4. In WhatsApp > Getting Started: add the MPIRE business phone number
5. Verify the phone number via SMS/voice code
6. Enable "Coexistence mode" so the number stays active on the physical phone
7. Create message templates for each reminder type (rent due, overdue, cheque, lease expiry) in both Arabic and English — submit for Meta review
8. Generate a permanent System User access token (never use temporary tokens in production)
9. Store the access token and Phone Number ID in environment variables
10. Implement HTTP POST calls to `https://graph.facebook.com/v21.0/{phone_number_id}/messages` in our reminder service

**Email Provider Recommendation: Resend**

For the email reminder channel, I recommend **Resend** over SendGrid:
- Modern developer experience, built for Next.js
- React Email for building templates with JSX (matches our stack)
- Generous free tier: 3,000 emails/month (more than enough)
- Simple API, excellent TypeScript SDK
- Founded by a former SendGrid engineer, designed to fix SendGrid's pain points

---

## 0.3 — Design Direction

### Option A: "Operational Clarity"  ★ RECOMMENDED FOR MPIRE

> **Philosophy**: Clean precision inspired by Linear and Vercel. Information-dense without feeling cluttered. Built for people who use this tool 8 hours a day.

**Color Palette:**

| Role | Color | Hex |
|---|---|---|
| Background (dark) | Near-black | `#0A0A0B` |
| Surface | Dark charcoal | `#141416` |
| Surface elevated | Slightly lighter | `#1C1C1F` |
| Border | Subtle gray | `#2A2A2E` |
| Text primary | Off-white | `#EDEDEF` |
| Text secondary | Muted gray | `#8B8B8D` |
| Accent primary | Teal | `#2DD4A8` |
| Accent secondary | Amber (warnings/overdue) | `#F5A623` |
| Destructive | Soft red | `#EF4444` |
| Success | Green | `#22C55E` |

Light mode: Invert to white/light gray backgrounds, dark text. Accent colors remain.

**Typography:**

| Role | Font | Weight |
|---|---|---|
| Latin display | **Geist** (by Vercel) | 600, 700 |
| Latin body | **Geist** | 400, 500 |
| Arabic display | **IBM Plex Arabic** | 600, 700 |
| Arabic body | **IBM Plex Arabic** | 400, 500 |
| Monospace (numbers, IDs) | **Geist Mono** | 400 |

Why Geist: Purpose-built for dashboards, excellent number readability (critical for financial data), clean and professional without being generic. IBM Plex Arabic is one of the few premium Arabic typefaces with proper OpenType features and matching weights.

**Layout:**

- **Collapsible sidebar** (240px expanded, 64px collapsed icon-only mode)
- Sidebar sections: Dashboard, Properties, Tenants, Payments, Maintenance, Documents, Reminders, Settings
- **Top bar**: Current page breadcrumb, search (⌘K), language toggle, dark/light mode, user avatar
- **Content area**: Max-width 1400px, responsive grid
- **Cards**: Subtle border, no heavy shadows, slight hover elevation
- **Tables**: Dense rows (40px height), sticky headers, inline actions
- **Status badges**: Pill-shaped, color-coded, subtle background tint

**RTL/LTR Strategy:**

- Tailwind CSS RTL plugin (`rtl:` variant) for directional styles
- `dir` attribute set at `<html>` level based on user preference
- Sidebar flips to right side in RTL
- All flex/grid layouts use logical properties (`ms-`, `me-` instead of `ml-`, `mr-`)
- Numbers and dates remain LTR even in RTL mode (standard Arabic UI convention)
- next-intl handles string interpolation for both languages

**Dark/Light Mode:**

- Dark by default (CSS variables on `:root` and `[data-theme="light"]`)
- System preference detection on first visit
- User preference persisted to database

---

### Option B: "Luxury Minimal"

> **Philosophy**: Premium real-estate aesthetic. White space as a design element. Feels like a high-end property brochure turned digital.

**Color Palette:**

| Role | Color | Hex |
|---|---|---|
| Background (dark) | Deep navy | `#0C1222` |
| Surface | Navy gray | `#151D2E` |
| Accent primary | Gold | `#C9A96E` |
| Accent secondary | Slate blue | `#6B7FBF` |
| Text primary | Warm white | `#F4F1EC` |
| Text secondary | Muted slate | `#8892A4` |
| Destructive | Coral | `#E8655A` |
| Success | Sage green | `#6BAF7A` |

Light mode: Warm off-white backgrounds (`#FAF8F5`), navy text.

**Typography:**

| Role | Font |
|---|---|
| Latin display | **Playfair Display** (serif, elegant) |
| Latin body | **DM Sans** (clean geometric sans) |
| Arabic display | **Almarai** (bold, modern Arabic) |
| Arabic body | **Almarai** (regular) |

**Layout:**

- Wider spacing, more generous padding
- Sidebar with property thumbnails
- Card-based layout with larger cards, more whitespace
- Emphasis on hero metrics at top of dashboards

**Trade-offs:**
- Looks premium but sacrifices information density
- Serif display font less practical for data-heavy screens
- Gold accent can feel dated if not executed carefully
- Less practical for daily operational use

---

### Option C: "Bold Modern"

> **Philosophy**: High-energy, color-forward design. Inspired by Raycast and Arc Browser. Vibrant without being childish.

**Color Palette:**

| Role | Color | Hex |
|---|---|---|
| Background (dark) | True black | `#000000` |
| Surface | Dark gray | `#111111` |
| Accent primary | Electric blue | `#3B82F6` |
| Accent secondary | Violet | `#8B5CF6` |
| Accent tertiary | Cyan | `#06B6D4` |
| Text primary | White | `#FFFFFF` |
| Text secondary | Gray | `#737373` |
| Destructive | Bright red | `#DC2626` |
| Success | Bright green | `#16A34A` |

Light mode: Pure white backgrounds, same vibrant accents.

**Typography:**

| Role | Font |
|---|---|
| Latin display + body | **Plus Jakarta Sans** (friendly geometric) |
| Arabic display + body | **Noto Sans Arabic** (Google, well-supported) |

**Layout:**

- Full-bleed sidebar with gradient accent line
- Bolder use of color — colored section headers, gradient badges
- More visual indicators (sparklines in cards, progress rings)
- Tab-based navigation within sections

**Trade-offs:**
- Energetic but can feel noisy for a B2B tool used daily
- Multiple accent colors require careful balance
- May not convey the "professional property management" tone expected in Oman's market
- Gradients and bold colors need extra design discipline to avoid looking "startup-y"

---

### Design Recommendation

**I recommend Option A: "Operational Clarity"** for MPIRE because:

1. **Daily-use ergonomics**: Property managers will spend hours in this tool. Information density + clean typography reduces fatigue.
2. **Financial data readability**: Geist Mono for numbers, dense tables, and clear status badges make payment tracking fast.
3. **Professional tone**: Teal + dark mode conveys competence without being flashy. Appropriate for Oman's professional property management market.
4. **RTL excellence**: IBM Plex Arabic is one of the best-engineered Arabic typefaces, and the minimal design means fewer directional edge cases.
5. **Maintenance simplicity**: A restrained palette and consistent component patterns are easier to maintain as the system grows.

---

## Summary of Recommendations

| Decision | Recommendation | Status |
|---|---|---|
| **Stack** | Next.js 15 (App Router) + Supabase + Drizzle ORM + shadcn/ui + Tailwind CSS 4 | Awaiting approval |
| **WhatsApp** | Meta Cloud API (direct) with Coexistence Mode | Awaiting approval |
| **Email** | Resend with React Email templates | Awaiting approval |
| **Design** | Option A: "Operational Clarity" (dark-first, Geist + IBM Plex Arabic, teal accent) | Awaiting approval |

---

## Next Steps (After Approval)

1. Scaffold Next.js 15 project with TypeScript, Tailwind CSS 4, and ESLint
2. Set up Supabase project (database, auth, storage)
3. Configure next-intl for bilingual AR/EN support
4. Install and configure shadcn/ui with custom theme tokens
5. Design database schema and create migrations
6. Build Module 1 (Auth & Role Management) first
7. Proceed through modules in specified order

**Awaiting your approval or feedback on each of the three decisions before proceeding to implementation.**
