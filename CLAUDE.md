# Design skills

This repo has two design skills under `.claude/skills/`:

- `mpire-ui` holds the MPIRE design-system rules ("Architectural Gold": dark-first, gold accent, English/Arabic RTL).
- `impeccable` (third-party, from https://github.com/pbakaus/impeccable) provides general design commands (`/impeccable audit`, `critique`, `polish`, ...) and detector hooks configured in `.claude/settings.json`.

When they disagree on fonts, colors, spacing, components or any other visual rule, `mpire-ui` wins. Treat MPIRE's existing tokens and components as the incumbent design authority. Use Impeccable for review, hardening and refinement within that system, not to redesign it.
