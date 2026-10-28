# Design skills

This repo has two design skills under `.claude/skills/`:

- `mpire-ui` holds the MPIRE design-system rules ("Teal & Sand": sand ground, teal accent, light and dark, English/Arabic RTL). `DESIGN.md` is the full reference.
- `impeccable` (third-party, from https://github.com/pbakaus/impeccable) provides general design commands (`/impeccable audit`, `critique`, `polish`, ...) and detector hooks configured in `.claude/settings.json`.

When they disagree on fonts, colors, spacing, components or any other visual rule, `mpire-ui` wins.

A visual revamp to Teal & Sand is under way in phases: (1) tokens, font and `src/components/ui/` primitives, (2) app shell, (3) staff pages, (4) tenant-facing pages, (5) audit. Restyles change presentation only, never data, handlers or behaviour. Treat MPIRE's existing tokens and components as the incumbent design authority. Use Impeccable for review, hardening and refinement within that system, not to redesign it.
