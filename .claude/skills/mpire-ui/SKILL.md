---
name: mpire-ui
description: MPIRE design-system rules for any UI/UX work in this repo — building or restyling pages, components, forms, tables, dialogs, charts, or fixing RTL/Arabic, accessibility, or visual-consistency issues. Use whenever creating or editing anything under src/components/ or page JSX under src/app/[locale]/.
---

# MPIRE UI/UX Design System — "Architectural Gold"

Dark-first, gold-accent, bilingual (English LTR / Arabic RTL) property-management UI.
Tokens live in `src/app/globals.css` (Tailwind v4 `@theme` block + CSS variables). Never hardcode colors.

## Tokens (use these, never raw hex)

- Surfaces: `bg-background`, `bg-surface`, `bg-surface-elevated`; borders `border-border` (soften with `/40`–`/60`)
- Text: `text-text-primary`, `text-text-secondary`; accent: `text-accent`, `bg-accent`, `text-accent-foreground` (on gold fills)
- Status: `success` (paid/active/cleared), `warning` (pending/due/maintenance), `destructive` (overdue/bounced/archived), `info`
- Fonts: `font-display` (Syne — page/section headings only), `font-sans` (Manrope — body), `font-mono` (JetBrains Mono — money, dates, IDs, counts)
- Effects (sparingly): `.glass`, `.gold-shimmer`, `.border-glow`, `.stagger-children`, `.animate-fade-in-up`

## Primitives — always reuse, never hand-roll

All in `src/components/ui/`: `Button` (variants + `loading` prop), `Input`/`Select`/`Textarea` (built-in `label`, `error`, `helperText` — never raw `<input>`/`<select>`), `Table` family, `Badge` (status variants), `Card`, `Dialog` family, `Alert` (`destructive`/`success` — replaces ad-hoc error/success divs), `Spinner` (replaces hand-rolled border-spin divs), `EmptyState`, `Skeleton`, `PageHeader` (with breadcrumbs), `Pagination`, `Stepper`, toast.

If a needed primitive doesn't exist, extend `src/components/ui/` once and reuse — don't create per-screen variants.

## Canonical patterns

- **Lists**: desktop `Table` primitives + `md:hidden` mobile card list (must be scannable at 375px). Status → `Badge`. Empty → `EmptyState` with a primary action.
- **Detail pages**: dossier layout — identity card up top (name, status Badge, `dl` fact grid), actions top-end, then sectioned tables/cards.
- **Forms**: Card-grouped sections with `font-display` headings; field errors via primitive `error` prop; form-level errors via `Alert`; submit = `Button loading={...}` at the end-aligned action row, Cancel as ghost/secondary.
- **Financial figures**: always `font-mono ltr-nums`, amounts `text-end`; credit/debit distinguished by success/destructive tone **plus a textual sign or label — never color alone**.
- **Async states**: every fetch surface needs loading (`Spinner`/`Skeleton`), empty (`EmptyState`), and error (`Alert`) states.

## RTL / bilingual (non-negotiable)

- Logical properties ONLY: `ms-`/`me-`/`ps-`/`pe-`/`text-start`/`text-end`/`border-s`/`border-e`. Never `ml-`/`mr-`/`pl-`/`pr-`/`text-left`/`text-right`.
- Directional icons (arrows/chevrons) get `rtl:rotate-180`.
- Numbers, phone numbers, dates: wrap in `.ltr-nums` so they stay LTR in Arabic.
- Every user-visible string goes through next-intl (`useTranslations` client / `getTranslations` server) with keys in BOTH `src/i18n/messages/en.json` and `ar.json`. No hardcoded UI strings — if a key is missing, add it to both files in the same change.

## Accessibility floor

Icon-only buttons need localized `aria-label`; decorative icons get `aria-hidden`. Focus: `focus-visible:ring-2 focus-visible:ring-accent/40` on all interactive elements (including custom chip groups — real `<button>`s with `aria-pressed`). Inputs associated with labels (primitives handle this). Toggles/expanders need `aria-expanded`/`aria-pressed`.

## Hard boundaries — presentation changes must never touch

- Money math / business logic: `src/lib/owners/balance.ts`, `src/lib/expenses/summary.ts`, payment allocation, late fees, lease/date logic
- `src/db/schema/`, `supabase/migrations/`, RLS policies, auth rules, `.env*`, CI/deploy configs
- API contracts, fetch queries, form payload shapes, handler semantics — restyling keeps the same handlers, props, and data flow

## Verify before calling any UI change done

```
npx tsc --noEmit && npm run lint && npm run build
```

All three must be green. Repo lints `react-hooks/set-state-in-effect` at error level — no synchronous `setState` inside `useEffect`. Avoid the generic "AI dashboard" look: no purple gradients, no untouched library defaults, no centered-everything.
