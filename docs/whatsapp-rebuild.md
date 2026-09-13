# Connecting a new WhatsApp number to SAAS

Runbook for moving SAAS to a fresh WhatsApp Business number (Cloud API).
Written after the September 2026 ban of the original number, when the whole
Mpire business portfolio was disabled permanently. Use it for any future move.

## Before you start (Meta side)

1. A **new business portfolio** for the correct legal entity, business
   verification completed. Never reuse a disabled portfolio.
2. A **new WhatsApp Business Account (WABA)** in that portfolio, with the new
   number added, verified and registered for Cloud API. Display name approved.
3. A **new Meta app** in the same portfolio with the WhatsApp product added.
   Do not reuse "Mpire Notifications": it belongs to the disabled portfolio.
4. A **system user** in the portfolio with access to the WABA and the app.
   Generate a permanent token with `whatsapp_business_management` and
   `whatsapp_business_messaging`.
5. **One business per number.** The old account was most likely disabled for
   sending Sama Hotel messages from the MPIRE number. Sama gets its own
   portfolio, WABA, number and app.

## Vercel variables (project `saas` only)

Set these on the `saas` project, **not** as team-shared variables: SAMA-CRM
reads the same names and must not pick them up.

| Variable | Value |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | the system-user token. Copy it from Meta straight into Vercel; a token pasted into a chat, ticket or email is compromised — invalidate it (developers.facebook.com/tools/debug/accesstoken → Invalidate) and generate a new one |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID from WhatsApp Manager / App dashboard |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | the new WABA ID (optional but recommended) |
| `WHATSAPP_APP_SECRET` | App dashboard → App settings → Basic → App secret |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | any random string; you never type it into Meta yourself |
| `NEXT_PUBLIC_APP_URL` | `https://saas-rho-kohl.vercel.app` (no trailing slash) |

Redeploy after changing them.

## In SAAS

Settings → **WhatsApp Setup** (super admin only), or `/settings/whatsapp-setup`.

1. **Environment**: every required variable shows "Set".
2. **Access token**: valid, never expires, the App ID is the new app.
3. **Phone number**: status `CONNECTED`, platform `CLOUD_API`. A number that
   was only added in WhatsApp Manager shows `PENDING`: enter a 6-digit PIN in
   the **Register number** form and submit. That call registers the number for
   the Cloud API and sets its two-step verification PIN (keep the PIN; Meta
   asks for it when the number is ever moved or deleted).
4. **Connect webhooks**: registers the app's `whatsapp_business_account`
   webhook at this deployment (Meta verifies the URL with the verify token on
   the spot) with the fields `messages`, `account_update`, `account_alerts`,
   `phone_number_quality_update`, and subscribes the app to the WABA. The
   page then reads "Meta sends this number's events to this deployment".
5. **Create missing templates**: submits every template the code sends,
   built from the WhatsApp rows in `notification_templates` plus the built-in
   `daily_briefs`. Templates start as `PENDING`; Meta usually approves utility
   templates within minutes to hours. `owner_monthly_report` needs a document
   header and must be created by hand in WhatsApp Manager with the body shown
   on the page.
6. Register the admin number again under Settings → WhatsApp AI Agent if it
   was removed, then send "Hello" to the new number.

## Rules that keep the new number alive

- Reminder cadence is capped in code: at most 3 overdue notices per newly
  overdue invoice, never more often than every 3 days (Reminders → rules).
- Only tenants who agreed to WhatsApp reminders should be messaged. Keep the
  consent record.
- Account events (bans, restrictions, quality drops) are logged at error
  level and emailed to the admin recipients the moment Meta reports them.
- Delivery receipts are tracked per reminder; the Reminders page lists
  tenants whose messages are not getting through. Stop chasing anyone on
  that list.
