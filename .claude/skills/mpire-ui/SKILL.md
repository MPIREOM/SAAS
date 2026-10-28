---
name: mpire-ui
description: MPIRE "Teal & Sand" design-system rules for any UI/UX work in this repo — building or restyling pages, components, forms, tables, dialogs, charts, or fixing RTL/Arabic, accessibility, or visual-consistency issues. Use whenever creating or editing anything under src/components/ or page JSX under src/app/[locale]/.
---

# MPIRE UI/UX Design System — "Teal & Sand"

Calm, flat, bilingual (English LTR / Arabic RTL) property-management UI: warm sand ground, white cards, deep teal as the one accent. Light and dark are both first-class; the theme follows the device unless the user picks one (`data-theme` on `<html>`, saved in `localStorage.theme`).
Tokens live in `src/app/globals.css` (Tailwind v4 `@theme` block + CSS variables). Never hardcode colors. Full reference: `DESIGN.md`; source design: https://claude.ai/artifact/4qBc8Ej5ppw5263RSDNGqt

## Tokens (use these, never raw hex)

- Surfaces: `bg-background` (sand), `bg-surface` (cards), `bg-surface-elevated` (table heads, footers, hover), `bg-sunken` (tracks, disabled fields); borders `border-border`, `border-border-strong` (inputs, secondary buttons). Don't soften borders with opacity.
- Text: `text-text-primary`, `text-text-secondary`, `text-text-tertiary` (placeholders, faint meta). All pass 4.5:1.
- Accent (teal): `bg-accent` + `text-accent-foreground` for primary actions; `bg-accent-tint` + `text-accent-tint-foreground` for selected/active states (nav item, chosen option).
- Status: tint background + strong text — `bg-success-tint text-success` (paid/active), `bg-warning-tint text-warning` (pending/due), `bg-destructive-tint text-destructive-text` (overdue/bounced/errors), `bg-info-tint text-info` (vacant/info), `bg-neutral-tint text-text-secondary` (archived). Use `Badge`, which adds a dot so colour is never alone.
- Charts: `chart-1`…`chart-6` in fixed order; never reuse status colours for series.
- Depth: `shadow-card` on cards, `shadow-overlay` on dialogs, popovers, toasts. Scrim: `bg-scrim`.
- Font: Thmanyah Sans for everything, English and Arabic (`font-sans`; `font-display` is the same face — use weight for hierarchy). `tabular-nums` for money, counts and dates. `font-mono` only for codes/IDs.
- Sizes: page title 24px bold (22px phone), card title 15px semibold, body 14px, labels 13px semibold, help/meta 12.5px. Radii: 8px controls, 12px cards, 14px dialogs, full for badges.
- No decoration: no gradients, glow, glass, noise or shimmer. `.gold-shimmer`, `.glass`, `.noise-overlay`, `.border-glow` are retired; remove them when you touch a file.

## Primitives — always reuse, never hand-roll

All in `src/components/ui/`: `Button` (variants + `loading` prop), `Input`/`Select`/`Textarea` (built-in `label`, `error`, `helperText` — never raw `<input>`/`<select>`), `Table` family, `Badge` (status variants), `Card`, `Dialog` family, `Alert` (`destructive`/`success` — replaces ad-hoc error/success divs), `Spinner` (replaces hand-rolled border-spin divs), `EmptyState` (framed card by default; `bare` inside an existing card), `Skeleton`, `PageHeader` (with breadcrumbs), `Pagination`, `Stepper`, toast.

If a needed primitive doesn't exist, extend `src/components/ui/` once and reuse — don't create per-screen variants.

## Canonical patterns

- **Lists**: desktop `Table` primitives + `md:hidden` mobile card list (must be scannable at 375px). Status → `Badge`. Empty → `EmptyState` with a primary action.
- **Detail pages**: dossier layout — identity card up top (name, status Badge, `dl` fact grid), actions top-end, then sectioned tables/cards.
- **Forms**: Card-grouped sections with `font-display` headings; field errors via primitive `error` prop; form-level errors via `Alert`; submit = `Button loading={...}` at the end-aligned action row, Cancel as ghost/secondary.
- **Financial figures**: always `tabular-nums ltr-nums`, three decimals, unit in a smaller `text-text-secondary` span (`220.000 OMR` / `ر.ع.`), amounts `text-end`; credit/debit distinguished by success/destructive tone **plus a textual sign or label — never color alone**.
- **Async states**: every fetch surface needs loading (`Spinner`/`Skeleton`), empty (`EmptyState`), and error (`Alert`) states.

## RTL / bilingual (non-negotiable)

- Logical properties ONLY: `ms-`/`me-`/`ps-`/`pe-`/`text-start`/`text-end`/`border-s`/`border-e`. Never `ml-`/`mr-`/`pl-`/`pr-`/`text-left`/`text-right`.
- Directional icons (arrows/chevrons) get `rtl:rotate-180`.
- Numbers, phone numbers, dates: wrap in `.ltr-nums` so they stay LTR in Arabic.
- Every user-visible string goes through next-intl (`useTranslations` client / `getTranslations` server) with keys in BOTH `src/i18n/messages/en.json` and `ar.json`. No hardcoded UI strings — if a key is missing, add it to both files in the same change.

## Accessibility floor

Icon-only buttons need localized `aria-label`; decorative icons get `aria-hidden`. Focus: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus` on all interactive elements (including custom chip groups — real `<button>`s with `aria-pressed`). Inputs associated with labels (primitives handle this). Toggles/expanders need `aria-expanded`/`aria-pressed`.

## Hard boundaries — presentation changes must never touch

- Money math / business logic: `src/lib/owners/balance.ts`, `src/lib/expenses/summary.ts`, payment allocation, late fees, lease/date logic
- `src/db/schema/`, `supabase/migrations/`, RLS policies, auth rules, `.env*`, CI/deploy configs
- API contracts, fetch queries, form payload shapes, handler semantics — restyling keeps the same handlers, props, and data flow

## Verify before calling any UI change done

```
npx tsc --noEmit && npm run lint && npm run build
```

All three must be green. Repo lints `react-hooks/set-state-in-effect` at error level — no synchronous `setState` inside `useEffect`. Avoid the generic "AI dashboard" look: no gradients, no untouched library defaults, no centered-everything. Touch targets ≥40px (≥48px on tenant-facing phone pages).
