# Bank e-mandates (direct debit)

Tenants authorise a standing direct debit at their bank; MPIRE pulls a fixed
rent amount on a fixed day each month and reconciles it against the rent
invoice. Bank Muscat API Banking is the first provider. Until their
documentation and sandbox arrive, a mock bank runs the same flow end to end.

## Flow

1. **Admin creates the mandate** on the tenant page (E-Mandate section): lease,
   monthly amount (defaults to the lease rent), collection day (1–28, defaults
   to the lease due day), tenant account number. The account number goes to
   the bank once; only the last four digits are stored.
2. **Bank sends the tenant an OTP** by SMS. The dashboard shows a portal link
   (`/{locale}/tenant-portal/e-mandate/{token}`) to copy or share on WhatsApp.
3. **Tenant opens the link and enters the OTP.** Five attempts, 15-minute
   window. On success the mandate becomes `active`.
4. **Daily cron** (`/api/cron/e-mandate-collections`, 06:00 UTC / 10:00 Muscat,
   after the invoice cron) pulls every active mandate whose collection day is
   today: it picks the oldest unpaid rent invoice for the lease, caps the
   amount at what is still owed, sends the debit, and records a collection.
5. **Settlement** (immediately, by webhook, or by the cron polling) inserts a
   `payments` row with method `direct_debit` and marks the invoice paid or
   partial. A returned debit deletes that payment and reopens the invoice.
   Three consecutive failures suspend the mandate.

"Collect now" on the tenant page runs step 4 for one mandate on demand.

## Code map

| Piece | Where |
|---|---|
| Schema (`e_mandates`, `e_mandate_collections`, `e_mandate_events`, `direct_debit` enum value) | `supabase/migrations/041_e_mandates.sql` |
| Provider interface | `src/lib/e-mandates/types.ts` |
| Provider selection + settings status | `src/lib/e-mandates/provider.ts` |
| Mock bank | `src/lib/e-mandates/providers/mock.ts` |
| Bank Muscat adapter (skeleton) | `src/lib/e-mandates/providers/bank-muscat.ts` |
| Business logic (create, OTP, collect, settle, return, webhook events) | `src/lib/e-mandates/service.ts` |
| Dashboard API | `src/app/api/e-mandates/route.ts`, `src/app/api/e-mandates/[id]/route.ts` |
| Tenant portal API + page | `src/app/api/tenant-portal/e-mandate/route.ts`, `src/app/[locale]/tenant-portal/e-mandate/[token]/page.tsx` |
| Bank webhook | `src/app/api/webhooks/bank-muscat/route.ts` |
| Cron | `src/app/api/cron/e-mandate-collections/route.ts` (registered in `vercel.json`) |
| UI | `src/components/tenants/e-mandate-panel.tsx`, `src/components/settings/e-mandate-provider-panel.tsx` |

## Environment variables

| Variable | Purpose |
|---|---|
| `E_MANDATE_PROVIDER` | `mock` or `bank_muscat`. Unset: Bank Muscat if fully configured, else mock. |
| `BANK_MUSCAT_API_BASE_URL` | Sandbox or production base URL from the bank. |
| `BANK_MUSCAT_CLIENT_ID` / `BANK_MUSCAT_CLIENT_SECRET` | API credentials. |
| `BANK_MUSCAT_CREDITOR_ID` | MPIRE's creditor / merchant id on the direct-debit agreement. |
| `BANK_MUSCAT_CREDITOR_ACCOUNT` | MPIRE's collection account. |
| `BANK_MUSCAT_WEBHOOK_SECRET` | Secret the bank signs callbacks with. |
| `E_MANDATE_MOCK_OTP` | Mock only. OTP the portal accepts (default `123456`). |
| `E_MANDATE_MOCK_COLLECT_RESULT` | Mock only. `settled` (default), `submitted`, or `failed`. |
| `E_MANDATE_MOCK_WEBHOOK_SECRET` | Mock only. Value of the `x-mock-signature` header the webhook accepts. |

Set them in Vercel (Production and Preview as needed) and redeploy. The
Settings page (super admin) shows which Bank Muscat variables are still
missing without revealing values.

## Testing with the mock bank

1. Apply migration 041.
2. On a tenant with an active lease, open the E-Mandate section and create a
   mandate with any 8+ character account number.
3. Open the portal link and enter `123456`. The mandate becomes active.
4. Press "Collect now". With the default mock result the invoice is marked
   paid and a `direct_debit` payment appears in the Payments section.
5. To simulate a bank callback (set `E_MANDATE_MOCK_WEBHOOK_SECRET` first):

```bash
curl -X POST https://<host>/api/webhooks/bank-muscat \
  -H 'content-type: application/json' \
  -H 'x-mock-signature: <E_MANDATE_MOCK_WEBHOOK_SECRET>' \
  -d '{"events":[{"kind":"collection","providerEventId":"evt-1","providerCollectionId":"<provider_collection_id>","status":"returned","reason":"Insufficient funds"}]}'
```

6. Run the cron by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/e-mandate-collections
```

## Finishing the Bank Muscat adapter

Everything marked `ASSUMPTION` in `providers/bank-muscat.ts` is a placeholder:

1. Endpoint paths in `ENDPOINTS`.
2. Authentication (`accessToken()`): currently OAuth2 client-credentials with
   HTTP Basic. Replace if the bank uses API keys, mutual TLS, or request signing.
3. Request and response field names in `createMandate`, `confirmMandate`,
   `resendOtp`, `cancelMandate`, `collect`, `getCollectionStatus`.
4. Status code tables in `mapMandateStatus()` and `mapCollectionStatus()`.
5. Webhook verification (`verifyWebhook`) and payload shape (`parseWebhook`).

No other file needs to change. Set `E_MANDATE_PROVIDER=bank_muscat` (or just
fill in the variables) once done. Mandates created with the mock keep using
the mock; create new ones for real tenants.

## Questions to put to Bank Muscat

- Which product is this: direct-debit mandates on the CBO mandate system, or a
  gateway with tokenised recurring payments?
- Authentication method and token lifetime. Is mutual TLS or request signing
  required? Are there IP allow-lists for the sandbox and production?
- Mandate creation request: required tenant fields (civil ID, mobile, account
  or IBAN, bank code for other banks), amount type (fixed vs maximum),
  frequency and day-of-month rules, start and end date rules.
- OTP: who sends it (bank or us), length, validity, resend and retry limits,
  and whether confirmation is an API call or happens on a bank-hosted page.
- Collection request: can we choose the execution date, what is the cut-off
  time, how many days until settlement, and can the amount be lower than
  the mandate amount for a partially paid invoice.
- Status model and return-reason codes for mandates and collections.
- Webhooks: URL registration, signing scheme and header names, retry policy,
  and event ids for idempotency. If none, the polling endpoint and rate limits.
- Sandbox: how to simulate OTP success, a bounced collection, and a returned
  (reversed) settlement.
- Fees per collection and per mandate, and the reconciliation report format.
