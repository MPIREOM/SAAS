# MPIRE Design — Teal & Sand

Source design (Claude Design): https://claude.ai/artifact/4qBc8Ej5ppw5263RSDNGqt
Rules for day-to-day work: `.claude/skills/mpire-ui/SKILL.md`. Tokens: `src/app/globals.css`.

## Character

A tool staff use all day, in Arabic and English, on phones and desktops. It should feel trustworthy, calm and fast to scan. Warm sand ground, white cards, one deep teal accent. Flat: depth comes from borders and one soft shadow, never gradients, glow or glass.

## Theme

Light and dark are equal. With no saved choice the app follows the device (`prefers-color-scheme`); the top-bar toggle saves `light` or `dark` in `localStorage.theme` and sets `data-theme` on `<html>` before first paint.

## Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | #F5F2EC | #0E1413 | Page ground |
| `surface` | #FFFFFF | #151D1B | Cards, inputs, sidebar, top bar |
| `surface-elevated` | #FAF8F4 | #19221F | Table heads, dialog footers, hover |
| `sunken` | #EFEBE3 | #111816 | Tracks, disabled fields, empty-state icon tile |
| `border` / `border-strong` | #E2DCD1 / #C9C1B3 | #283330 / #3A4743 | Dividers / inputs and secondary buttons |
| `text-primary` / `secondary` / `tertiary` | #18211F / #45514D / #5F6965 | #ECF0EE / #BAC4C0 / #97A29E | Body / supporting / placeholder |
| `accent` (+ hover, press) | #0F6B66 | #4FC2B6 | Primary actions, links, focus |
| `accent-tint` / `-foreground` | #E2EFEC / #0A514D | #173A36 / #8FDDD4 | Selected nav, chosen options |
| `destructive` / `-tint` / `-text` | #B42318 / #FCEBE8 / #9E1F15 | #F2877C / #3A1C19 / #F6A39A | Overdue, bounced, delete, errors |
| `warning` / `-tint` | #8A5300 / #FBF0DA | #E8B04E / #3A2C12 | Pending, due soon |
| `success` / `-tint` | #1A6E3E / #E3F2E8 | #64CC8F / #15321F | Paid, active |
| `info` / `-tint` | #1D5A9E / #E6EEF8 | #7FB2EC / #16263A | Vacant, informational |
| `chart-1…6` | teal, amber, blue, violet, rose, grey | lighter steps | Data series only |

Every text pair meets WCAG AA. Status never relies on colour alone: badges carry a dot and a word.

## Type

Thmanyah Sans (Regular 400, Medium 500, Bold 700; self-hosted in `src/app/fonts/`) for both scripts. Hierarchy comes from size and weight.

- Page title 24px bold (22px on phone)
- Card title 15px semibold; dialog title 17px bold
- Body 14px; labels 13px semibold; help and meta 12.5px
- Table headers 12px semibold uppercase (English only)
- Money: tabular numerals, three decimals, unit in a smaller secondary span (`220.000 OMR`)

## Shape and space

Radii: 8px controls, 12px cards, 14px dialogs, full for badges and pills. Card padding 16px. Page gutter 24px desktop, 12–16px phone. Controls: buttons 40px (34px small, 48px large), inputs 42px, table rows 48px.

## Components

All in `src/components/ui/`:

- **Button**: primary (teal fill), secondary (white with strong border), destructive (red fill), ghost (teal text, tint on hover; grey for icon-only). Disabled = neutral tint; loading keeps its colour with a spinner. Focus = 2px teal outline, 2px offset.
- **Badge**: pill with leading dot; success, warning, destructive, info, secondary (neutral), default (teal).
- **Input / Select / Textarea**: white field, strong border, 13px semibold label, error = red border plus icon and message.
- **Card**: white, 1px border, soft shadow, 12px radius.
- **Table**: tinted header row, 48px rows, hover tint, amounts end-aligned. On phones, lists become cards.
- **Dialog**: 14px radius, overlay shadow, scrim without blur, footer on a tinted strip with a top border.
- **Alert**: tinted panel, body in normal text colour, icon and title in the status colour.
- **EmptyState**: icon on a sunken tile, short title, one-line explanation, optional action.

## Phone

Sidebar becomes a menu button; tables become cards; page actions wrap under the title; tenant-facing pages use full-width 48px buttons.
