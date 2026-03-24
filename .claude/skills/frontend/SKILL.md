---
name: frontend
description: Use when working on frontend tasks — UI/UX review, component scaffolding, styling enforcement, and frontend cleanup/optimization. Triggers on React component work, Tailwind styling, accessibility questions, responsive design, performance review, or design system consistency checks.
argument-hint: <task> e.g. "review invoices page", "scaffold TenantCard", "audit dashboard performance"
---

# Frontend Skill — MPIRE Property Management

You are a frontend expert for a **Next.js 16 + React 19 + Tailwind 4 + Supabase** property management SaaS. Follow these rules strictly.

When invoked with `$ARGUMENTS`, determine which mode(s) apply and execute them. If no arguments, ask the user what they need.

---

## Mode 1: UI/UX Review

When reviewing components for UI/UX quality, check every item below:

### Accessibility (WCAG 2.1 AA)
- All interactive elements (`<button>`, `<a>`, `<input>`) must have accessible names (visible label, `aria-label`, or `aria-labelledby`)
- Form inputs must have associated `<label>` elements (not just placeholder text)
- `aria-invalid` on inputs with validation errors
- `aria-busy="true"` on loading containers
- `aria-hidden="true"` on decorative icons (Lucide icons next to text labels)
- Dialogs must use the project's `<Dialog>` compound component which provides `role="dialog"`, `aria-modal="true"`, and focus trap
- Color contrast: never rely on color alone to convey meaning — always pair with text/icon
- Focus states: all interactive elements must have visible focus via `focus-visible:ring-2 focus-visible:ring-accent/40` or the `.focus-ring` utility class
- Keyboard navigation: all functionality reachable via keyboard, no `onClick` on `<div>` without `role="button"` and `tabIndex={0}` and `onKeyDown`

### Responsiveness
- Mobile-first: layouts must work at 320px minimum
- Use responsive grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` patterns
- Tables should use the `.mobile-card-view` class or card-based alternatives on mobile
- Touch targets: minimum 44x44px for mobile (`min-h-[44px] min-w-[44px]`)
- No horizontal overflow — check for fixed widths that break on small screens
- Test dialog/modal content doesn't overflow on mobile

### RTL Support (Arabic)
- Use logical properties: `ps-3` / `pe-3` instead of `pl-3` / `pr-3` where layout direction matters
- Use `start` / `end` instead of `left` / `right` for positioning
- Icons that indicate direction (arrows, chevrons) must flip in RTL or use `rtl:rotate-180`
- Numbers must use `.ltr-nums` class to preserve LTR rendering in RTL context
- Text alignment: use `text-start` / `text-end` instead of `text-left` / `text-right`

### UX Patterns
- Loading states: show skeleton/spinner, never blank screen
- Empty states: use the `<EmptyState>` component with icon, title, description, and action
- Error states: toast for transient errors, inline message for form validation
- Optimistic updates where appropriate
- Confirm before destructive actions (delete, cancel)
- Form submission must disable the button and show spinner to prevent double-submit

---

## Mode 2: Component Scaffolding

When creating new components, follow these project conventions exactly:

### File Structure
```
src/components/<feature>/<component-name>.tsx
```

### Component Template

**Server Component (default):**
```tsx
import { getTranslations } from "next-intl/server";

interface ComponentNameProps {
  // typed props
}

export async function ComponentName({ ...props }: ComponentNameProps) {
  const t = await getTranslations("namespace");
  // ...
}
```

**Client Component (when state/effects/browser APIs needed):**
```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

interface ComponentNameProps {
  // typed props — use types from @/types/database
}

export function ComponentName({ ...props }: ComponentNameProps) {
  const t = useTranslations("namespace");
  const { toast } = useToast();
  // ...
}
```

### Rules
- Prefer Server Components unless you need `useState`, `useEffect`, event handlers, or browser APIs
- All user-facing strings must use `useTranslations()` / `getTranslations()` — never hardcode English
- Import types from `@/types/database` for database entities
- Use `cn()` from `@/lib/utils/cn` for conditional class merging
- Icons: import from `lucide-react` only — no other icon libraries
- Forms: use `react-hook-form` with `zod` validation for complex forms, plain `useState` for simple ones
- Data fetching: Server Components use `createClient()` from `@/lib/supabase/server`, Client Components from `@/lib/supabase/client`
- All amounts/currency must use `CURRENCY` from `@/lib/currency` and display with `.toLocaleString("en-OM", { minimumFractionDigits: 2 })`
- Dates: use `date-fns` for formatting/manipulation

### UI Primitives — Always reuse these:
| Need | Use |
|------|-----|
| Buttons | `<Button>` from `@/components/ui/button` with CVA variants: `default`, `secondary`, `destructive`, `outline`, `ghost` |
| Cards | `<Card>` compound: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` |
| Inputs | `<Input>` from `@/components/ui/input` (has built-in label, error, helperText) |
| Textareas | `<Textarea>` from `@/components/ui/textarea` |
| Selects | `<Select>` from `@/components/ui/select` |
| Modals | `<Dialog>` compound: `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogBody`, `DialogFooter` |
| Tables | `<Table>` compound: `TableHeader`, `TableBody`, `TableRow`, `TableCell` |
| Badges | `<Badge>` with variants: `default`, `secondary`, `warning`, `destructive`, `success`, `outline` |
| Empty | `<EmptyState>` with icon, title, description, action |
| Loading | `<Skeleton>` from `@/components/ui/skeleton` |
| Pagination | `<Pagination>` from `@/components/ui/pagination` |
| Toasts | `useToast()` hook — `toast({ title, description?, variant: "success" | "destructive" })` |

Do NOT create new UI primitives that duplicate existing ones.

---

## Mode 3: Frontend Cleanup & Performance

When auditing for performance and code quality:

### Performance Checks
- **Bundle size**: Client Components (`"use client"`) should be as small as possible. Move static content to Server Components
- **Images**: must use `next/image` with proper `width`/`height` or `fill` + `sizes`
- **Dynamic imports**: heavy components (charts, maps, rich editors) should use `next/dynamic` with loading fallback
- **Re-renders**: check for anonymous functions/objects created in render that cause child re-renders. Extract to `useCallback`/`useMemo` only when there's a measured problem
- **Data fetching**: avoid client-side fetching for data that could be fetched server-side
- **Unused imports**: flag and remove dead imports
- **Unused state**: flag `useState`/`useEffect` that can be removed or simplified
- **Console statements**: remove `console.log` in production code

### Code Quality
- No `any` types — use proper TypeScript types from `@/types/database`
- No inline styles — use Tailwind classes
- No magic numbers — extract to named constants or use design tokens
- No string concatenation for classes — use `cn()` utility
- Event handlers in forms must call `e.preventDefault()` on submit
- Async operations must have error handling with try/catch or `.catch()`
- Loading states must set `setLoading(false)` in finally/catch blocks (not just happy path)

---

## Mode 4: Design System Enforcement

When checking styling consistency, enforce these tokens:

### Color Tokens (NEVER use raw hex/rgb)
| Purpose | Token |
|---------|-------|
| Page background | `bg-background` |
| Card/section background | `bg-surface` |
| Elevated surface (inputs, dropdowns) | `bg-surface-elevated` or `bg-surface-elevated/50` |
| Hover background | `hover:bg-surface-hover` |
| Primary text | `text-text-primary` |
| Secondary/muted text | `text-text-secondary` |
| Primary action/accent | `bg-accent`, `text-accent`, `border-accent` |
| Accent hover | `hover:bg-accent-hover`, `hover:text-accent-hover` |
| Accent foreground (text on accent bg) | `text-accent-foreground` |
| Borders | `border-border` or `border-border/40` to `border-border/60` |
| Success | `text-success`, `bg-success/10` |
| Warning | `text-warning`, `bg-warning/10` |
| Destructive/error | `text-destructive`, `bg-destructive/10` |
| Info | `text-info`, `bg-info/10` |

### Typography
| Use | Classes |
|-----|---------|
| Page titles | `font-display text-2xl font-bold tracking-tight` |
| Section headers | `text-lg font-semibold` |
| Card titles | `text-sm font-semibold` |
| Body text | `text-sm text-text-primary` |
| Secondary/helper text | `text-xs text-text-secondary` |
| Monospace (amounts, codes) | `font-mono tabular-nums` |
| Labels | `text-xs font-semibold text-text-secondary uppercase tracking-wider` |

### Spacing & Layout
| Pattern | Classes |
|---------|---------|
| Card padding | `p-4` or `p-6` |
| Section gap | `space-y-4` or `space-y-6` |
| Grid gap | `gap-4` or `gap-6` |
| Input height | `h-10` |
| Button height | `h-10` (standard), `h-8` (compact) |
| Border radius | `rounded-xl` (cards, inputs, buttons), `rounded-lg` (smaller elements) |
| Shadows on accent | `shadow-sm shadow-accent/20` |

### Animation
| Use | Classes |
|-----|---------|
| State transitions | `transition-all duration-200` |
| Enter animations | `animate-fade-in-up`, `animate-fade-in`, `animate-scale-in` |
| Slide panels | `animate-slide-in-left`, `animate-slide-in-right` |
| Staggered children | Parent: `stagger-children` |
| Hover lift | `hover:shadow-md active:scale-[0.98]` |

### Status Badge Conventions
| Status | Badge variant |
|--------|--------------|
| Active / Paid / Cleared | `success` |
| Pending / Partial | `warning` |
| Overdue / Bounced / Cancelled | `destructive` |
| Draft / Inactive | `secondary` |

---

## Execution

1. Read all relevant files before making suggestions
2. List issues found grouped by severity: **Critical** (broken functionality, accessibility violations) > **Warning** (inconsistencies, missing patterns) > **Info** (minor improvements)
3. Fix issues directly — don't just list them
4. Run `npx tsc --noEmit` after changes to verify no type errors
5. Always check both `en.json` and `ar.json` when adding translation keys
