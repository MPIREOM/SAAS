# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **MPIRE staff** (roles `super_admin` and `property_manager`) run day-to-day property management for MPIRE Property Management, Oman. They work in both Arabic and English and often on phones, away from a desk, as well as on desktops. Property managers see only their assigned properties.
- **Tenants** never log in. They reach MPIRE through token links, usually shared on WhatsApp and opened on a phone: tenant portal, visit booking and schedule, maintenance requests, tenant agreement, and bank e-mandate OTP confirmation.
- **Property owners** are tracked as records with their own pages in the dashboard; they are not confirmed as direct users.

## Product Purpose

An internal operating system for one company, MPIRE Property Management. It replaces scattered spreadsheets, phone notes and manual WhatsApp messages with one place to run properties, units, tenants, leases, rent, invoices, payments and cheques, expenses, maintenance, documents and reminders. Success means rent is collected on time, nothing expires or falls through unnoticed, and tenants get clear, timely communication.

It is not sold to other companies. Multi-company (multi-tenant SaaS) concerns are out of scope unless that changes.

## Positioning

Built around how MPIRE actually works in Oman: Arabic and English as equals, WhatsApp as the main channel to tenants, cheques and Bank Muscat direct debit (e-mandates) as payment methods, and Omani rial amounts.

## Operating Context

- Staff switch between Arabic (RTL) and English (LTR) and between phone and desktop during the same day.
- Tenants act on a phone, from a WhatsApp message, often once: book a visit, confirm an OTP, file a maintenance request, read their agreement.
- Automated reminders go out by WhatsApp (Meta Cloud API) and email (Resend) on schedules run by cron.
- Daily cron jobs generate rent invoices and pull e-mandate collections; settlement and returns arrive from the bank.
- Staff export reports to PDF (on the MPIRE letterhead) and Excel.

## Capabilities and Constraints

- Stack: Next.js 16 App Router, Supabase (Postgres, Auth, Row Level Security, Storage), Drizzle, Tailwind CSS 4, shadcn/ui, next-intl, deployed on Vercel.
- Two staff roles only; data access is enforced in the database with RLS.
- Tenant-facing pages work from a token link without an account.
- Every staff and tenant surface must work fully in Arabic RTL and English LTR, and on a phone.
- WhatsApp templates require Meta approval; the business number was banned once (September 2026), so messaging must stay within Meta policy and one business per number.
- E-mandates currently run against a mock bank until Bank Muscat sandbox access arrives.

## Brand Commitments

- Name: MPIRE (MPIRE Property Management, Oman).
- The existing `mpire-ui` design system ("Architectural Gold") is the binding visual authority; see `.claude/skills/mpire-ui/` and `CLAUDE.md`.
- Tenant-facing pages carry the MPIRE brand to customers and get the same care as the staff dashboard.

## Evidence on Hand

- Arabic font files: `public/fonts/ThmanyahSans-Regular.otf`, `public/fonts/ThmanyahSans-Bold.otf`.
- Letterhead for PDFs: `public/letterhead/page.jpg`.
- Sample real data: `public/weekly expenses report DATA.xlsx`.
- Runbooks: `docs/e-mandates.md`, `docs/whatsapp-rebuild.md`; planning: `PHASE-0-PLANNING.md`.
- No testimonials, metrics or customer quotes exist; do not invent them.

## Product Principles

1. Never lose track of money: rent, cheques, debits and deposits must always be traceable to a lease and an invoice.
2. Arabic and English are equals; neither is a translation afterthought.
3. Phone-first for anything done away from a desk, by staff or tenants.
4. Tenants should finish their one task from a WhatsApp link without help.
5. Surface what needs attention (overdue, expiring, failed) before it becomes a problem.
