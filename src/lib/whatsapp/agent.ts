import Anthropic from "@anthropic-ai/sdk";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { getOwnerBalance, getDefaultOwnerBalance } from "@/lib/owners/balance";
import { getExpensesSummary } from "@/lib/expenses/summary";

const anthropic = new Anthropic({
  // callClaude() below owns retry logic, so disable the SDK's built-in retries
  // to avoid compounding backoff (SDK default is 2 → up to ~6 attempts when
  // stacked with ours). A per-request timeout keeps a hung Claude call from
  // stalling the WhatsApp webhook indefinitely.
  maxRetries: 0,
  timeout: 60_000,
});

const CLAUDE_MODEL = "claude-sonnet-4-6";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

// Use service role key for webhook context (no cookie-based auth)
function getAdminSupabase() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Retry wrapper for Claude API calls with exponential backoff. Retries on
// 429 (rate limit) and 5xx (overloaded / transient server error). Logs the
// underlying status + body on failure so production issues surface in logs
// instead of producing an opaque "something went wrong" reply.
async function callClaude(
  params: Anthropic.MessageCreateParamsNonStreaming
): Promise<Anthropic.Message> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await anthropic.messages.create(params);
    } catch (error: unknown) {
      const status =
        error instanceof Anthropic.APIError ? error.status : undefined;
      const isRateLimit = status === 429;
      const isTransientServerError =
        typeof status === "number" && status >= 500 && status < 600;
      // Network blips and our own 60s timeout surface as APIConnectionError
      // (APIConnectionTimeoutError is a subclass). The SDK won't retry these
      // anymore (maxRetries: 0), so we do.
      const isConnectionError = error instanceof Anthropic.APIConnectionError;
      const shouldRetry =
        (isRateLimit || isTransientServerError || isConnectionError) &&
        attempt < MAX_RETRIES - 1;

      if (shouldRetry) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(
          `[WhatsApp Agent] Claude API ${status} — retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      console.error("[WhatsApp Agent] Claude API call failed", {
        status,
        message: error instanceof Error ? error.message : String(error),
        model: params.model,
        message_count: params.messages.length,
      });
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

// ── Tool definitions for Claude ───────────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: "search_tenants",
    description:
      "Search for tenants by name (partial match). Returns tenant id, full name, phone, and their active lease/unit/property info including monthly rent.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Tenant name or partial name to search for",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "list_tenants",
    description:
      "List all active tenants with their lease and property details. Use when the user asks to see all tenants or wants an overview.",
    input_schema: {
      type: "object" as const,
      properties: {
        property_name: {
          type: "string",
          description: "Optional: filter by property name",
        },
      },
      required: [],
    },
  },
  {
    name: "get_tenant_invoices",
    description:
      "Get invoices for a tenant. Can filter by status and/or month. Returns invoice id, amount, due date, status, paid amount, period, unit/property info, and — for paid/partial invoices — the linked payments[] (each with payment_id, method, amount, payment_date) so you can answer 'how was X paid?'.",
    input_schema: {
      type: "object" as const,
      properties: {
        tenant_id: {
          type: "string",
          description: "The tenant UUID",
        },
        status_filter: {
          type: "string",
          enum: ["unpaid", "paid", "all"],
          description:
            "Filter: 'unpaid' = pending/overdue/partial (default), 'paid' = paid only, 'all' = everything",
        },
        month: {
          type: "string",
          description:
            "Optional: filter by month in YYYY-MM format (e.g. '2026-04' for April 2026). Filters on period_start.",
        },
        limit: {
          type: "number",
          description: "Max invoices to return. Default 10.",
        },
      },
      required: ["tenant_id"],
    },
  },
  {
    name: "get_tenant_balance",
    description:
      "Get a tenant's financial summary: total invoiced, total paid, outstanding balance, and overdue amount.",
    input_schema: {
      type: "object" as const,
      properties: {
        tenant_id: {
          type: "string",
          description: "The tenant UUID",
        },
      },
      required: ["tenant_id"],
    },
  },
  {
    name: "mark_invoice_paid",
    description:
      "Record a payment against an invoice. Updates the invoice status and creates a payment record. Can do full or partial payments. NOTE on method='cheque': use this when the tenant paid by cheque AND the cheque went directly to the owner — the rent doesn't increase the company-owes-owner balance, but commission is still owed. No cheque record is required (use this even if the tenant doesn't have a tracked cheque on file).",
    input_schema: {
      type: "object" as const,
      properties: {
        invoice_id: {
          type: "string",
          description: "The invoice UUID to record payment against",
        },
        amount: {
          type: "number",
          description:
            "Payment amount in OMR. If omitted, pays the full remaining balance.",
        },
        method: {
          type: "string",
          enum: ["cash", "bank_transfer", "cheque"],
          description:
            "Payment method. REQUIRED in practice — the owner ledger treats cheque payments differently (they go direct to the owner and don't enter the company account, while cash and bank_transfer do). NEVER guess; if the user didn't say cash / bank transfer / cheque, ask them before calling this tool. Only omit when the user has explicitly stated the method.",
        },
        payment_date: {
          type: "string",
          description:
            "Payment date in YYYY-MM-DD format. Defaults to today if not specified.",
        },
        notes: {
          type: "string",
          description: "Optional notes about the payment",
        },
      },
      required: ["invoice_id"],
    },
  },
  {
    name: "create_invoice",
    description:
      "Create a new invoice for a tenant. Use when the user wants to generate or add an invoice manually.",
    input_schema: {
      type: "object" as const,
      properties: {
        tenant_id: {
          type: "string",
          description: "The tenant UUID",
        },
        lease_id: {
          type: "string",
          description: "The lease UUID (get from tenant search results)",
        },
        unit_id: {
          type: "string",
          description: "The unit UUID (get from tenant search results)",
        },
        amount: {
          type: "number",
          description:
            "Invoice amount in OMR. If not specified, uses the lease monthly rent.",
        },
        due_date: {
          type: "string",
          description: "Due date in YYYY-MM-DD format",
        },
        period_start: {
          type: "string",
          description: "Billing period start date (YYYY-MM-DD), e.g. first of month",
        },
        period_end: {
          type: "string",
          description: "Billing period end date (YYYY-MM-DD), e.g. last of month",
        },
        notes: {
          type: "string",
          description: "Optional notes for the invoice",
        },
      },
      required: ["tenant_id", "lease_id", "unit_id", "due_date"],
    },
  },
  {
    name: "create_invoices_batch",
    description:
      "Create invoices for ALL occupied units in a property for one or more months. Use this instead of calling create_invoice repeatedly. Automatically resolves tenant, lease, and unit IDs. Skips units that already have invoices for the period. Returns a summary of created and skipped invoices.",
    input_schema: {
      type: "object" as const,
      properties: {
        property_id: {
          type: "string",
          description: "The property UUID",
        },
        months: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of months in YYYY-MM format, e.g. ['2026-05', '2026-06']. Invoices are created for each month.",
        },
      },
      required: ["property_id", "months"],
    },
  },
  {
    name: "search_properties",
    description:
      "Search for properties by name (partial match). Returns property id, name, location, and unit count.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Property name or partial name to search for",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "list_properties",
    description:
      "List all active properties with their names and locations.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_property_units",
    description:
      "Get all units for a property with their status, tenant info, and rent amount.",
    input_schema: {
      type: "object" as const,
      properties: {
        property_id: {
          type: "string",
          description: "The property UUID",
        },
      },
      required: ["property_id"],
    },
  },
  {
    name: "get_unit_by_number",
    description:
      "Look up a SPECIFIC unit by its unit number and return the EXACT current tenant, lease, and recent invoices. ALWAYS use this when the user mentions a unit number (e.g. 'unit 27', 'unit 66', 'unit 101 invoices', 'tenant in unit 5 paid'). NEVER guess or recall a tenant from memory — always call this tool to get authoritative data. If multiple properties have the same unit number, pass property_name to disambiguate.",
    input_schema: {
      type: "object" as const,
      properties: {
        unit_number: {
          type: "string",
          description:
            "The unit number EXACTLY as the user said it (e.g. '27', '66', 'A12'). Do not modify or normalize.",
        },
        property_name: {
          type: "string",
          description:
            "Optional: property name (or partial) to disambiguate when the same unit number exists in multiple properties.",
        },
      },
      required: ["unit_number"],
    },
  },
  {
    name: "add_expense",
    description:
      "Add a new expense. Most expenses for this owner are portfolio-wide (no specific property) — when the user just says 'add expense 50 OMR for X' without naming a building, omit property_id and the system attaches it to the owner. Pass property_id ONLY if the user explicitly tied the expense to a specific property.",
    input_schema: {
      type: "object" as const,
      properties: {
        property_id: {
          type: "string",
          description:
            "Optional: the property UUID. Omit when the expense isn't tied to a specific building.",
        },
        owner_id: {
          type: "string",
          description:
            "Optional: the owner UUID. Omit when only one owner exists — the system resolves it automatically.",
        },
        unit_id: {
          type: "string",
          description: "Optional: specific unit UUID if expense is unit-specific",
        },
        category: {
          type: "string",
          enum: [
            "maintenance",
            "insurance",
            "utilities",
            "cleaning",
            "legal",
            "taxes",
            "management_fees",
            "other",
          ],
          description: "Expense category. Pick the best match.",
        },
        description: {
          type: "string",
          description: "What the expense is for",
        },
        amount: {
          type: "number",
          description: "Expense amount in OMR",
        },
        expense_date: {
          type: "string",
          description: "Expense date in YYYY-MM-DD format. Defaults to today.",
        },
        vendor: {
          type: "string",
          description: "Vendor or service provider name",
        },
        attachment_token: {
          type: "string",
          description:
            "Optional: a receipt-attachment token from a prior image message in this conversation. The system surfaces these as 'PENDING_RECEIPT_TOKEN: <token>' in the user's message. Pass it here to attach the receipt photo to the new expense. If no such token was surfaced, omit this field.",
        },
        confirm_duplicate: {
          type: "boolean",
          description:
            "Set to true ONLY after the user has explicitly confirmed they want to record an expense that looks like a duplicate of an existing one. When omitted/false, the tool refuses to insert a near-identical expense (same owner/property, amount, category and date) and returns the existing match so you can ask the user to confirm first. Do NOT set this just because the same expense was mentioned again in the conversation — re-mentioning an already-recorded expense is the most common cause of accidental duplicates.",
        },
      },
      required: ["category", "amount"],
    },
  },
  {
    name: "delete_expense",
    description:
      "Delete (permanently remove) an expense that was recorded by mistake — e.g. a duplicate entry, or a wrong amount. This is a hard delete; the row is removed and the owner balance is recalculated. Prefer passing expense_id when you know it (get it from list_recent_owner_activity). Otherwise pass the matching criteria (amount + expense_date, optionally category) and the tool will locate it. If several identical expenses match (a duplicate), exactly ONE is removed per call so the legitimate entry is kept.",
    input_schema: {
      type: "object" as const,
      properties: {
        expense_id: {
          type: "string",
          description:
            "UUID of the specific expense to delete. Get this from list_recent_owner_activity. Preferred when known.",
        },
        owner_id: {
          type: "string",
          description:
            "Owner UUID. Omit when only one owner exists in the system.",
        },
        amount: {
          type: "number",
          description:
            "Amount of the expense to delete (OMR). Used to locate the row when expense_id is not given.",
        },
        expense_date: {
          type: "string",
          description:
            "Date (YYYY-MM-DD) of the expense to delete. Used to locate the row when expense_id is not given.",
        },
        category: {
          type: "string",
          description:
            "Optional category of the expense to delete. Helps disambiguate when amount/date are not unique.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_property_invoices",
    description:
      "Get all invoices for a specific property in ONE call. Can filter by status and date range. Returns tenant name, unit, amount, status, due date for each invoice. ALWAYS use this instead of looping through tenants individually.",
    input_schema: {
      type: "object" as const,
      properties: {
        property_id: {
          type: "string",
          description: "The property UUID",
        },
        status_filter: {
          type: "string",
          enum: ["unpaid", "paid", "all"],
          description:
            "Filter: 'unpaid' = pending/overdue/partial (default), 'paid' = paid only, 'all' = everything",
        },
        start_date: {
          type: "string",
          description:
            "Optional: start date in YYYY-MM-DD format (e.g. '2026-01-01'). Filters due_date >= start_date.",
        },
        end_date: {
          type: "string",
          description:
            "Optional: end date in YYYY-MM-DD format (e.g. '2026-04-30'). Filters due_date <= end_date.",
        },
      },
      required: ["property_id"],
    },
  },
  {
    name: "get_overdue_summary",
    description:
      "Get a summary of all unpaid invoices (pending, overdue, partial) across all properties. Can filter by month. Shows which tenants owe money and how much.",
    input_schema: {
      type: "object" as const,
      properties: {
        month: {
          type: "string",
          description:
            "Optional: filter by month in YYYY-MM format (e.g. '2026-04' for April). If omitted, shows all unpaid invoices.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_today_summary",
    description:
      "Get today's dashboard summary: invoices due today, overdue count, recent payments, and occupancy stats.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_expenses_summary",
    description:
      "Get total expenses for the PREVIOUS DAY, MONTH-TO-DATE (MTD) and YEAR-TO-DATE (YTD) in one call, each with a per-category breakdown. Use for 'what did we spend yesterday?', 'expenses this month', 'expenses YTD', or a general 'show me expenses'. IMPORTANT: business manager fees and commission are NOT expenses and are intentionally excluded — this reflects only the expenses ledger (maintenance, utilities, cleaning, etc.). Optionally scope to one building with property_id.",
    input_schema: {
      type: "object" as const,
      properties: {
        property_id: {
          type: "string",
          description:
            "Optional: a property UUID to scope expenses to a single building. Omit for company-wide expenses (all properties + owner-level).",
        },
      },
      required: [],
    },
  },
  {
    name: "update_lease_rent",
    description:
      "Update the monthly rent amount on a tenant's lease. Also updates the unit's rent_amount. Use when the user says rent changed, increased, decreased, or needs to be updated.",
    input_schema: {
      type: "object" as const,
      properties: {
        lease_id: {
          type: "string",
          description: "The lease UUID (get from tenant search results)",
        },
        new_rent: {
          type: "number",
          description: "New monthly rent amount in OMR",
        },
      },
      required: ["lease_id", "new_rent"],
    },
  },
  {
    name: "update_invoice",
    description:
      "Update an existing invoice's amount, due date, or notes. Use when the user wants to adjust/correct an invoice.",
    input_schema: {
      type: "object" as const,
      properties: {
        invoice_id: {
          type: "string",
          description: "The invoice UUID",
        },
        amount: {
          type: "number",
          description: "New invoice amount in OMR",
        },
        due_date: {
          type: "string",
          description: "New due date in YYYY-MM-DD format",
        },
        notes: {
          type: "string",
          description: "Updated notes",
        },
      },
      required: ["invoice_id"],
    },
  },
  {
    name: "cancel_invoice",
    description:
      "Cancel or write off an invoice. Use 'cancelled' when the invoice was created by mistake or is no longer needed. Use 'written_off' when the debt is uncollectable.",
    input_schema: {
      type: "object" as const,
      properties: {
        invoice_id: {
          type: "string",
          description: "The invoice UUID to cancel",
        },
        action: {
          type: "string",
          enum: ["cancelled", "written_off"],
          description: "Whether to cancel or write off the invoice",
        },
        reason: {
          type: "string",
          description: "Reason for cancellation/write-off",
        },
      },
      required: ["invoice_id", "action"],
    },
  },
  {
    name: "get_owner_balance",
    description:
      "Get the running balance for a property owner. Positive = company owes the owner (we are holding their money). Negative = owner owes the company (expenses + commissions exceeded rent received). Returns the balance plus a full breakdown (rent collected, commission earned, business manager fee, expenses, settlements). If owner_id is omitted and there is exactly one active owner, that owner's balance is returned.",
    input_schema: {
      type: "object" as const,
      properties: {
        owner_id: {
          type: "string",
          description:
            "Owner UUID. Omit when only one owner exists in the system.",
        },
      },
      required: [],
    },
  },
  {
    name: "record_owner_settlement",
    description:
      "Record a settlement payment between the company and the owner. Use 'company_to_owner' when WE paid the owner (decreases the running balance). Use 'owner_to_company' when the OWNER paid us (increases the running balance). Examples: 'I paid the owner 1500 cash' → company_to_owner 1500; 'owner gave me 200' → owner_to_company 200.",
    input_schema: {
      type: "object" as const,
      properties: {
        owner_id: {
          type: "string",
          description:
            "Owner UUID. Omit when only one owner exists in the system.",
        },
        direction: {
          type: "string",
          enum: ["company_to_owner", "owner_to_company"],
          description: "Direction of the settlement.",
        },
        amount: {
          type: "number",
          description: "Settlement amount in OMR (positive number).",
        },
        method: {
          type: "string",
          enum: ["cash", "bank_transfer", "cheque"],
          description: "Method used. Defaults to cash if omitted.",
        },
        settled_at: {
          type: "string",
          description: "Date of the settlement in YYYY-MM-DD. Defaults to today.",
        },
        reference_number: {
          type: "string",
          description: "Optional reference (cheque number, transfer reference, etc).",
        },
        notes: {
          type: "string",
          description: "Optional free-text notes.",
        },
        confirm_duplicate: {
          type: "boolean",
          description:
            "Set to true ONLY after the user has explicitly confirmed they want to record a settlement that looks like a duplicate of an existing one. When omitted/false, the tool refuses to insert a near-identical settlement and returns the existing match so you can ask the user to confirm first.",
        },
      },
      required: ["direction", "amount"],
    },
  },
  {
    name: "delete_owner_settlement",
    description:
      "Delete (permanently remove) an owner settlement that was recorded by mistake — e.g. a duplicate entry, or a wrong amount/direction. This is a hard delete; the row is removed from the ledger and the owner balance is recalculated. Prefer passing settlement_id when you know it (get it from list_recent_owner_activity). Otherwise pass the matching criteria (direction + amount + settled_at) and the tool will locate it. If several identical settlements match (a duplicate), exactly ONE is removed per call so the legitimate entry is kept.",
    input_schema: {
      type: "object" as const,
      properties: {
        settlement_id: {
          type: "string",
          description:
            "UUID of the specific settlement to delete. Get this from list_recent_owner_activity. Preferred when known.",
        },
        owner_id: {
          type: "string",
          description:
            "Owner UUID. Omit when only one owner exists in the system.",
        },
        direction: {
          type: "string",
          enum: ["company_to_owner", "owner_to_company"],
          description:
            "Direction of the settlement to delete. Used to locate the row when settlement_id is not given.",
        },
        amount: {
          type: "number",
          description:
            "Amount of the settlement to delete (OMR). Used to locate the row when settlement_id is not given.",
        },
        settled_at: {
          type: "string",
          description:
            "Date (YYYY-MM-DD) of the settlement to delete. Used to locate the row when settlement_id is not given.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_invoice_payments",
    description:
      "Get all payments recorded against a specific invoice — including the payment method (cash, bank transfer, cheque), amount, date, and reference number. Use this when the user asks 'how was X paid?', 'what method was used for the Feb invoice?', 'was this paid in cash?', or any question about HOW (not whether) an invoice was paid. Also returns any cheques explicitly linked to the invoice.",
    input_schema: {
      type: "object" as const,
      properties: {
        invoice_id: {
          type: "string",
          description: "The invoice UUID to look up payments for.",
        },
      },
      required: ["invoice_id"],
    },
  },
  {
    name: "update_payment_method",
    description:
      "Change the payment method (cash / bank_transfer / cheque) of a previously recorded payment. Use when the user says 'that was actually a cheque, not cash', 'change Feb payment to bank transfer', 'fix the method'. The owner ledger is computed on read, so this re-classification takes effect immediately — cheque payments do not feed into the company-owes-owner balance, while cash and bank transfers do. Requires payment_id (get it from get_invoice_payments or the payments[] array on get_tenant_invoices). When changing TO 'cheque', remind the user that the cheque record (number, bank, status) is tracked separately and must be added via the cheques screen if not already present.",
    input_schema: {
      type: "object" as const,
      properties: {
        payment_id: {
          type: "string",
          description:
            "The payment UUID to update. Look it up via get_invoice_payments or the payments[] array returned by get_tenant_invoices.",
        },
        new_method: {
          type: "string",
          enum: ["cash", "bank_transfer", "cheque"],
          description:
            "The corrected payment method. Must be exactly one of cash / bank_transfer / cheque.",
        },
      },
      required: ["payment_id", "new_method"],
    },
  },
  {
    name: "search_cheques_by_number",
    description:
      "Find cheques by cheque number (partial, case-insensitive match) and return the tenant they belong to. Use whenever the user asks 'whose cheque is X', 'find cheque 12345', 'who gave cheque CHQ-001', or wants to identify a cheque holder. Returns each match with the tenant's name and phone, the bank, cheque date, amount, status, and the linked invoice/property/unit when available.",
    input_schema: {
      type: "object" as const,
      properties: {
        cheque_number: {
          type: "string",
          description:
            "The cheque number (or a partial fragment) to search for. Matched case-insensitively against cheques.cheque_number.",
        },
        status_filter: {
          type: "string",
          enum: ["pending", "cleared", "bounced", "cancelled", "all"],
          description:
            "Optional status filter. Default 'all'. Use 'pending' when the user asks about uncleared/upcoming cheques.",
        },
        limit: {
          type: "number",
          description: "Max results to return. Default 10.",
        },
      },
      required: ["cheque_number"],
    },
  },
  {
    name: "list_recent_owner_activity",
    description:
      "List recent ledger activity for an owner — payments received, expenses logged, commissions, business fees, and settlements — within a window (default 14 days). Useful for sanity-checking the running balance.",
    input_schema: {
      type: "object" as const,
      properties: {
        owner_id: {
          type: "string",
          description:
            "Owner UUID. Omit when only one owner exists in the system.",
        },
        days: {
          type: "number",
          description: "How many days back to look. Default 14.",
        },
      },
      required: [],
    },
    // Cache breakpoint: marking the LAST tool caches the entire tool-definition
    // block (all 25 tools). They never change between calls, yet the agent loop
    // re-sends them on every Claude request — caching cuts that input cost to
    // ~10% on repeat reads within the 5-minute window.
    cache_control: { type: "ephemeral" },
  },
];

// ── Tool execution ────────────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  const supabase = getAdminSupabase();

  switch (toolName) {
    case "search_tenants": {
      const name = input.name as string;
      const { data: tenants, error } = await supabase
        .from("tenants")
        .select(
          `
          id, full_name, phone, status,
          leases(
            id, is_active, monthly_rent, start_date, end_date, payment_due_day,
            units(
              id, unit_number,
              properties(id, name)
            )
          )
        `
        )
        .ilike("full_name", `%${name}%`)
        .eq("status", "active")
        .limit(10);

      if (error) return JSON.stringify({ error: error.message });
      if (!tenants || tenants.length === 0)
        return JSON.stringify({
          message: `No active tenants found matching "${name}". Try a different name or use list_tenants to see all tenants.`,
        });

      return JSON.stringify(
        tenants.map((t: Record<string, unknown>) => ({
          id: t.id,
          full_name: t.full_name,
          phone: t.phone,
          leases: (t.leases as Record<string, unknown>[]).filter(
            (l: Record<string, unknown>) => l.is_active
          ),
        }))
      );
    }

    case "list_tenants": {
      const query = supabase
        .from("tenants")
        .select(
          `
          id, full_name, phone,
          leases(
            id, is_active, monthly_rent,
            units(
              id, unit_number,
              properties(id, name)
            )
          )
        `
        )
        .eq("status", "active")
        .order("full_name");

      const { data: tenants, error } = await query;
      if (error) return JSON.stringify({ error: error.message });

      const result = (tenants || [])
        .map((t: Record<string, unknown>) => {
          const activeLeases = (t.leases as Record<string, unknown>[]).filter(
            (l: Record<string, unknown>) => l.is_active
          );
          return {
            id: t.id,
            full_name: t.full_name,
            phone: t.phone,
            active_leases: activeLeases,
          };
        })
        .filter((t) => t.active_leases.length > 0);

      if (input.property_name) {
        const propName = (input.property_name as string).toLowerCase();
        const filtered = result.filter((t) =>
          t.active_leases.some((l: Record<string, unknown>) => {
            const unit = l.units as unknown as Record<string, unknown> | null;
            const prop = unit?.properties as unknown as Record<string, unknown> | null;
            return (prop?.name as string)?.toLowerCase().includes(propName);
          })
        );
        return JSON.stringify(filtered);
      }

      return JSON.stringify(result);
    }

    case "get_tenant_invoices": {
      const tenantId = input.tenant_id as string;
      const statusFilter = (input.status_filter as string) || "unpaid";
      const monthFilter = input.month as string | undefined;
      const limit = (input.limit as number) || 10;

      let query = supabase
        .from("invoices")
        .select(
          `
          id, amount, paid_amount, due_date, status, period_start, period_end, lease_id, notes, paid_date,
          units(unit_number, properties(name))
        `
        )
        .eq("tenant_id", tenantId)
        .order("due_date", { ascending: false })
        .limit(limit);

      if (statusFilter === "unpaid") {
        query = query.in("status", ["pending", "overdue", "partial"]);
      } else if (statusFilter === "paid") {
        query = query.eq("status", "paid");
      }

      // Filter by month (YYYY-MM) using period_start
      if (monthFilter && /^\d{4}-\d{2}$/.test(monthFilter)) {
        const monthStart = `${monthFilter}-01`;
        const [y, m] = monthFilter.split("-").map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        const monthEnd = `${monthFilter}-${String(lastDay).padStart(2, "0")}`;
        query = query.gte("period_start", monthStart).lte("period_start", monthEnd);
      }

      const { data: invoices, error } = await query;

      if (error) return JSON.stringify({ error: error.message });
      if (!invoices || invoices.length === 0)
        return JSON.stringify({
          message:
            statusFilter === "unpaid"
              ? "No unpaid invoices found for this tenant. All invoices are paid!"
              : "No invoices found for this tenant.",
        });

      const enriched = await attachPaymentsToInvoices(supabase, invoices);
      return JSON.stringify(enriched);
    }

    case "get_tenant_balance": {
      const tenantId = input.tenant_id as string;

      // Get tenant info
      const { data: tenant } = await supabase
        .from("tenants")
        .select("full_name")
        .eq("id", tenantId)
        .single();

      // Get all invoices
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select("amount, paid_amount, status, due_date")
        .eq("tenant_id", tenantId)
        .not("status", "in", '("cancelled","written_off")');

      if (error) return JSON.stringify({ error: error.message });

      const today = new Date().toISOString().split("T")[0];
      let totalInvoiced = 0;
      let totalPaid = 0;
      let overdueAmount = 0;
      let overdueCount = 0;

      for (const inv of invoices || []) {
        const amount = Number(inv.amount || 0);
        const paid = Number(inv.paid_amount || 0);
        totalInvoiced += amount;
        totalPaid += paid;
        if (
          inv.due_date < today &&
          ["pending", "overdue", "partial"].includes(inv.status)
        ) {
          overdueAmount += amount - paid;
          overdueCount++;
        }
      }

      return JSON.stringify({
        tenant_name: tenant?.full_name,
        total_invoiced: totalInvoiced,
        total_paid: totalPaid,
        outstanding_balance: totalInvoiced - totalPaid,
        overdue_amount: overdueAmount,
        overdue_invoice_count: overdueCount,
      });
    }

    case "mark_invoice_paid": {
      const invoiceId = input.invoice_id as string;
      const rawMethod = input.method as string | undefined;
      // The owner ledger treats cheque vs cash/transfer very differently
      // (cheques go direct to owner, cash/transfer enter the company
      // account). Don't silently default to cash — make the model ask.
      if (!rawMethod) {
        return JSON.stringify({
          error: "method_required",
          message:
            "Ask the user how the tenant paid before calling this tool. Reply with: 'How was the payment made — cash, bank transfer, or cheque?' Then re-call mark_invoice_paid with the chosen method.",
        });
      }
      const method = rawMethod;
      const notes = (input.notes as string) || "Paid via WhatsApp agent";
      const paidDate =
        (input.payment_date as string) ||
        new Date().toISOString().split("T")[0];

      // Fetch invoice details
      const { data: invoice, error: fetchError } = await supabase
        .from("invoices")
        .select(
          "id, lease_id, tenant_id, unit_id, amount, paid_amount, status, due_date, period_start"
        )
        .eq("id", invoiceId)
        .single();

      if (fetchError || !invoice)
        return JSON.stringify({ error: "Invoice not found" });

      if (invoice.status === "paid")
        return JSON.stringify({ error: "This invoice is already fully paid" });

      if (invoice.status === "cancelled" || invoice.status === "written_off")
        return JSON.stringify({
          error: `Cannot record payment — invoice is ${invoice.status}`,
        });

      const invoiceTotal = Number(invoice.amount);
      const currentPaid = Number(invoice.paid_amount || 0);
      const remaining = invoiceTotal - currentPaid;

      const paymentAmount = input.amount
        ? Math.min(Number(input.amount), remaining)
        : remaining;

      if (paymentAmount <= 0)
        return JSON.stringify({ error: "Invoice is already fully paid" });

      const newPaidAmount = currentPaid + paymentAmount;
      const isFullyPaid = newPaidAmount >= invoiceTotal;

      // Update invoice
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          status: isFullyPaid ? "paid" : "partial",
          paid_amount: newPaidAmount,
          paid_date: isFullyPaid ? paidDate : null,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);

      if (updateError)
        return JSON.stringify({ error: updateError.message });

      // Create payment record
      const { error: paymentError } = await supabase
        .from("payments")
        .insert({
          lease_id: invoice.lease_id,
          tenant_id: invoice.tenant_id,
          amount: paymentAmount,
          payment_date: paidDate,
          method,
          notes: `${notes} (via WhatsApp)`,
          created_by: userId,
        });

      if (paymentError)
        return JSON.stringify({
          warning:
            "Invoice updated but payment record failed: " +
            paymentError.message,
        });

      // Audit log
      await supabase.from("audit_log").insert({
        user_id: userId,
        action: isFullyPaid ? "mark_paid" : "partial_payment",
        entity_type: "invoice",
        entity_id: invoiceId,
        metadata: {
          amount: paymentAmount,
          method,
          source: "whatsapp_agent",
        },
      });

      // Get tenant name for confirmation
      const { data: tenant } = await supabase
        .from("tenants")
        .select("full_name")
        .eq("id", invoice.tenant_id)
        .single();

      return JSON.stringify({
        success: true,
        tenant_name: tenant?.full_name,
        invoice_id: invoiceId,
        payment_amount: paymentAmount,
        payment_method: method,
        payment_date: paidDate,
        new_status: isFullyPaid ? "paid" : "partial",
        remaining_balance: isFullyPaid ? 0 : invoiceTotal - newPaidAmount,
        invoice_total: invoiceTotal,
      });
    }

    case "create_invoice": {
      const tenantId = input.tenant_id as string;
      const leaseId = input.lease_id as string;
      const unitId = input.unit_id as string;
      const dueDate = input.due_date as string;

      // Get lease for default amount
      let amount = input.amount as number | undefined;
      if (!amount) {
        const { data: lease } = await supabase
          .from("leases")
          .select("monthly_rent")
          .eq("id", leaseId)
          .single();
        amount = Number(lease?.monthly_rent || 0);
      }

      if (!amount || amount <= 0)
        return JSON.stringify({
          error: "Could not determine invoice amount. Please specify the amount.",
        });

      // Calculate period dates if not provided
      const dueDateObj = new Date(dueDate);
      const periodStart =
        (input.period_start as string) ||
        new Date(dueDateObj.getFullYear(), dueDateObj.getMonth(), 1)
          .toISOString()
          .split("T")[0];
      const periodEnd =
        (input.period_end as string) ||
        new Date(dueDateObj.getFullYear(), dueDateObj.getMonth() + 1, 0)
          .toISOString()
          .split("T")[0];

      // Check for duplicate
      const { data: existing } = await supabase
        .from("invoices")
        .select("id, status")
        .eq("lease_id", leaseId)
        .eq("period_start", periodStart)
        .maybeSingle();

      if (existing)
        return JSON.stringify({
          error: `An invoice already exists for this period (status: ${existing.status}). Invoice ID: ${existing.id}`,
        });

      const { data: invoice, error } = await supabase
        .from("invoices")
        .insert({
          tenant_id: tenantId,
          lease_id: leaseId,
          unit_id: unitId,
          amount,
          due_date: dueDate,
          issued_date: new Date().toISOString().split("T")[0],
          period_start: periodStart,
          period_end: periodEnd,
          status: "pending",
          paid_amount: 0,
          notes: input.notes || null,
          created_by: userId,
        })
        .select("id")
        .single();

      if (error) return JSON.stringify({ error: error.message });

      await supabase.from("audit_log").insert({
        user_id: userId,
        action: "create",
        entity_type: "invoice",
        entity_id: invoice?.id,
        metadata: { amount, source: "whatsapp_agent" },
      });

      return JSON.stringify({
        success: true,
        invoice_id: invoice?.id,
        amount,
        due_date: dueDate,
        period: `${periodStart} to ${periodEnd}`,
      });
    }

    case "create_invoices_batch": {
      const propertyId = input.property_id as string;
      const months = input.months as string[];

      if (!months || months.length === 0)
        return JSON.stringify({ error: "Please specify at least one month in YYYY-MM format." });

      // Get all occupied units with active leases for this property
      const { data: units, error: unitsError } = await supabase
        .from("units")
        .select(
          `
          id, unit_number, rent_amount,
          leases(
            id, is_active, monthly_rent,
            tenants(id, full_name)
          )
        `
        )
        .eq("property_id", propertyId)
        .eq("status", "occupied")
        .order("unit_number");

      if (unitsError)
        return JSON.stringify({ error: unitsError.message });

      if (!units || units.length === 0)
        return JSON.stringify({ error: "No occupied units found for this property." });

      // Build list of units with active leases
      const activeUnits = (units as Record<string, unknown>[])
        .map((u) => {
          const leases = u.leases as Record<string, unknown>[];
          const activeLease = leases?.find((l) => l.is_active);
          if (!activeLease) return null;
          const tenant = activeLease.tenants as Record<string, unknown> | null;
          if (!tenant) return null;
          return {
            unit_id: u.id as string,
            unit_number: u.unit_number as string,
            lease_id: activeLease.id as string,
            tenant_id: tenant.id as string,
            tenant_name: tenant.full_name as string,
            monthly_rent: Number(activeLease.monthly_rent || u.rent_amount || 0),
          };
        })
        .filter(Boolean) as {
          unit_id: string;
          unit_number: string;
          lease_id: string;
          tenant_id: string;
          tenant_name: string;
          monthly_rent: number;
        }[];

      if (activeUnits.length === 0)
        return JSON.stringify({ error: "No active leases found for occupied units in this property." });

      const created: { unit: string; tenant: string; month: string; amount: number; invoice_id: string }[] = [];
      const skipped: { unit: string; tenant: string; month: string; reason: string }[] = [];
      const failed: { unit: string; tenant: string; month: string; error: string }[] = [];

      for (const month of months) {
        if (!/^\d{4}-\d{2}$/.test(month)) {
          failed.push({ unit: "N/A", tenant: "N/A", month, error: "Invalid month format" });
          continue;
        }

        const [y, m] = month.split("-").map(Number);
        const periodStart = `${month}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const periodEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
        const dueDate = periodStart; // Due on 1st of month

        for (const unit of activeUnits) {
          // Check for duplicate
          const { data: existing } = await supabase
            .from("invoices")
            .select("id, status")
            .eq("lease_id", unit.lease_id)
            .eq("period_start", periodStart)
            .maybeSingle();

          if (existing) {
            skipped.push({
              unit: unit.unit_number,
              tenant: unit.tenant_name,
              month,
              reason: `Invoice already exists (${existing.status})`,
            });
            continue;
          }

          if (unit.monthly_rent <= 0) {
            skipped.push({
              unit: unit.unit_number,
              tenant: unit.tenant_name,
              month,
              reason: "No rent amount on lease",
            });
            continue;
          }

          const { data: invoice, error: createError } = await supabase
            .from("invoices")
            .insert({
              tenant_id: unit.tenant_id,
              lease_id: unit.lease_id,
              unit_id: unit.unit_id,
              amount: unit.monthly_rent,
              due_date: dueDate,
              issued_date: new Date().toISOString().split("T")[0],
              period_start: periodStart,
              period_end: periodEnd,
              status: "pending",
              paid_amount: 0,
              notes: `Batch created via WhatsApp agent`,
              created_by: userId,
            })
            .select("id")
            .single();

          if (createError) {
            failed.push({
              unit: unit.unit_number,
              tenant: unit.tenant_name,
              month,
              error: createError.message,
            });
          } else {
            created.push({
              unit: unit.unit_number,
              tenant: unit.tenant_name,
              month,
              amount: unit.monthly_rent,
              invoice_id: invoice?.id,
            });

            // Audit log
            await supabase.from("audit_log").insert({
              user_id: userId,
              action: "create",
              entity_type: "invoice",
              entity_id: invoice?.id,
              metadata: { amount: unit.monthly_rent, source: "whatsapp_agent_batch" },
            });
          }
        }
      }

      const totalCreated = created.reduce((sum, c) => sum + c.amount, 0);

      return JSON.stringify({
        success: true,
        summary: {
          created_count: created.length,
          skipped_count: skipped.length,
          failed_count: failed.length,
          total_amount: totalCreated.toFixed(2),
        },
        created,
        skipped: skipped.length > 0 ? skipped : undefined,
        failed: failed.length > 0 ? failed : undefined,
      });
    }

    case "search_properties": {
      const name = input.name as string;
      const { data: properties, error } = await supabase
        .from("properties")
        .select("id, name, location, total_units")
        .ilike("name", `%${name}%`)
        .eq("is_archived", false)
        .limit(5);

      if (error) return JSON.stringify({ error: error.message });
      if (!properties || properties.length === 0)
        return JSON.stringify({
          message: `No properties found matching "${name}". Use list_properties to see all.`,
        });

      return JSON.stringify(properties);
    }

    case "list_properties": {
      const { data: properties, error } = await supabase
        .from("properties")
        .select("id, name, location, total_units")
        .eq("is_archived", false)
        .order("name");

      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify(properties || []);
    }

    case "get_property_units": {
      const propertyId = input.property_id as string;
      const { data: units, error } = await supabase
        .from("units")
        .select(
          `
          id, unit_number, unit_type, rent_amount, status,
          leases(
            id, is_active, monthly_rent,
            tenants(id, full_name, phone)
          )
        `
        )
        .eq("property_id", propertyId)
        .order("unit_number");

      if (error) return JSON.stringify({ error: error.message });

      const result = (units || []).map((u: Record<string, unknown>) => {
        const leases = u.leases as Record<string, unknown>[];
        const activeLease = leases?.find(
          (l: Record<string, unknown>) => l.is_active
        );
        return {
          id: u.id,
          unit_number: u.unit_number,
          type: u.unit_type,
          rent: u.rent_amount,
          status: u.status,
          lease_id: activeLease ? activeLease.id : null,
          monthly_rent: activeLease ? activeLease.monthly_rent : null,
          tenant: activeLease
            ? (activeLease.tenants as Record<string, unknown>)
            : null,
        };
      });

      return JSON.stringify(result);
    }

    case "get_unit_by_number": {
      const unitNumber = String(input.unit_number ?? "").trim();
      const propertyName = (input.property_name as string | undefined)?.trim();

      if (!unitNumber) {
        return JSON.stringify({ error: "unit_number is required" });
      }

      const { data: unitMatches, error: unitErr } = await supabase
        .from("units")
        .select(
          `
          id, unit_number, status, rent_amount, property_id,
          properties(id, name, location)
          `
        )
        .eq("unit_number", unitNumber);
      if (unitErr) return JSON.stringify({ error: unitErr.message });

      if (!unitMatches || unitMatches.length === 0) {
        return JSON.stringify({
          message: `No unit with number "${unitNumber}" exists. Do NOT invent a tenant. Tell the user the unit was not found.`,
        });
      }

      // If multiple matches and property_name provided, narrow it down
      let matched = unitMatches as Record<string, unknown>[];
      if (matched.length > 1 && propertyName) {
        const lower = propertyName.toLowerCase();
        const filtered = matched.filter((u) => {
          const prop = u.properties as unknown as Record<string, unknown> | null;
          const name = (prop?.name as string | undefined)?.toLowerCase() ?? "";
          return name.includes(lower);
        });
        if (filtered.length > 0) matched = filtered;
      }

      if (matched.length > 1) {
        return JSON.stringify({
          message: `Multiple units with number "${unitNumber}" exist across properties. Ask the user to specify the property.`,
          candidates: matched.map((u) => {
            const prop = u.properties as unknown as Record<string, unknown> | null;
            return {
              unit_id: u.id,
              unit_number: u.unit_number,
              property: prop?.name,
            };
          }),
        });
      }

      const unit = matched[0];
      const unitId = unit.id as string;
      const property = unit.properties as unknown as Record<string, unknown> | null;

      // Fetch active lease + tenant for this unit (single source of truth)
      const { data: lease } = await supabase
        .from("leases")
        .select(
          `
          id, monthly_rent, start_date, end_date, payment_due_day, is_active,
          tenants(id, full_name, phone)
          `
        )
        .eq("unit_id", unitId)
        .eq("is_active", true)
        .maybeSingle();

      const tenant = lease
        ? ((lease as Record<string, unknown>).tenants as
            | Record<string, unknown>
            | null)
        : null;

      // Recent invoices for this unit (newest first)
      const { data: invoices } = await supabase
        .from("invoices")
        .select(
          "id, amount, paid_amount, due_date, status, period_start, period_end, paid_date, tenant_id"
        )
        .eq("unit_id", unitId)
        .order("due_date", { ascending: false })
        .limit(12);

      const invoiceList = (invoices || []).map((inv) => ({
        invoice_id: inv.id,
        amount: Number(inv.amount || 0),
        paid_amount: Number(inv.paid_amount || 0),
        remaining:
          Number(inv.amount || 0) - Number(inv.paid_amount || 0),
        due_date: inv.due_date,
        status: inv.status,
        period_start: inv.period_start,
        period_end: inv.period_end,
        paid_date: inv.paid_date,
        belongs_to_current_tenant: tenant
          ? inv.tenant_id === (tenant.id as string)
          : false,
      }));

      const unpaid = invoiceList.filter((i) =>
        ["pending", "overdue", "partial"].includes(i.status as string)
      );

      return JSON.stringify({
        unit: {
          unit_id: unitId,
          unit_number: unit.unit_number,
          status: unit.status,
          rent_amount: unit.rent_amount,
          property: property
            ? {
                property_id: property.id,
                name: property.name,
                location: property.location,
              }
            : null,
        },
        tenant: tenant
          ? {
              tenant_id: tenant.id,
              full_name: tenant.full_name,
              phone: tenant.phone,
            }
          : null,
        lease: lease
          ? {
              lease_id: (lease as Record<string, unknown>).id,
              monthly_rent: (lease as Record<string, unknown>).monthly_rent,
              start_date: (lease as Record<string, unknown>).start_date,
              end_date: (lease as Record<string, unknown>).end_date,
              payment_due_day: (lease as Record<string, unknown>)
                .payment_due_day,
            }
          : null,
        invoices: invoiceList,
        unpaid_invoices: unpaid,
        instructions: tenant
          ? "Use ONLY the tenant.full_name and unit.unit_number values shown above. Do NOT invent or recall any other name. To record a payment, call mark_invoice_paid with one of the invoice_id values listed above (prefer an unpaid_invoices entry)."
          : "This unit has no active lease/tenant right now. Tell the user the unit appears vacant. Do NOT invent a tenant name.",
      });
    }

    case "add_expense": {
      const expenseDate =
        (input.expense_date as string) ||
        new Date().toISOString().split("T")[0];

      // Resolve owner: most expenses for the operator's portfolio are
      // owner-level (no property dimension). If the agent didn't pass a
      // property_id AND there's exactly one active owner, fall back to
      // attaching the expense to that owner. If the agent did pass a
      // property_id, we still try to resolve the owner from the property
      // so the expense shows up in the owner's ledger.
      const resolvedPropertyId = (input.property_id as string | undefined) || null;
      let resolvedOwnerId = (input.owner_id as string | undefined) || null;

      if (!resolvedPropertyId && !resolvedOwnerId) {
        const { data: owners } = await supabase
          .from("owners")
          .select("id")
          .eq("is_active", true)
          .limit(2);
        if (!owners || owners.length === 0) {
          return JSON.stringify({
            error:
              "No active owner is configured. Either create an owner first or pass property_id.",
          });
        }
        if (owners.length > 1) {
          return JSON.stringify({
            error:
              "Multiple owners exist — pass either owner_id or property_id so we know which ledger to charge.",
          });
        }
        resolvedOwnerId = owners[0].id as string;
      }

      // When a property_id IS provided, also attach owner_id (if we can
      // resolve it) so the expense flows into the right balance without an
      // extra hop at read time.
      if (resolvedPropertyId && !resolvedOwnerId) {
        const { data: prop } = await supabase
          .from("properties")
          .select("owner_id")
          .eq("id", resolvedPropertyId)
          .maybeSingle();
        if (prop?.owner_id) resolvedOwnerId = prop.owner_id as string;
      }

      // Duplicate guard: refuse to silently record an expense that looks
      // identical to an existing one (same owner/property, amount, category)
      // within a few days, unless the user has explicitly confirmed. This is
      // the root cause behind a "balance is off — expenses counted twice"
      // complaint: across turns the agent would re-record an expense it had
      // already saved (e.g. listing it again in a "both expenses are now
      // recorded" summary), inserting a second copy each time.
      const amountNum = Number(input.amount);
      const confirmDuplicateExpense = input.confirm_duplicate === true;
      if (!confirmDuplicateExpense && Number.isFinite(amountNum)) {
        const windowDays = 3;
        const lowerDate = new Date(
          new Date(expenseDate).getTime() - windowDays * 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .split("T")[0];
        const upperDate = new Date(
          new Date(expenseDate).getTime() + windowDays * 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .split("T")[0];

        let dupQuery = supabase
          .from("expenses")
          .select("id, amount, category, description, vendor, expense_date")
          .eq("amount", amountNum)
          .eq("category", input.category)
          .gte("expense_date", lowerDate)
          .lte("expense_date", upperDate);
        // Scope to the same ledger the new expense would land in so we don't
        // cross-match unrelated owners/properties.
        if (resolvedPropertyId) {
          dupQuery = dupQuery.eq("property_id", resolvedPropertyId);
        } else if (resolvedOwnerId) {
          dupQuery = dupQuery.eq("owner_id", resolvedOwnerId);
        }

        const { data: existingExpenses } = await dupQuery.order("expense_date", {
          ascending: false,
        });

        if (existingExpenses && existingExpenses.length > 0) {
          return JSON.stringify({
            requires_confirmation: true,
            reason: "possible_duplicate",
            message:
              "An expense with the same ledger, amount, category and a nearby date already exists. This may be a duplicate. Ask the user to confirm before recording another one — and if it IS a duplicate (e.g. an expense already recorded earlier in this conversation), do NOT record a new entry; offer to delete the extra instead using delete_expense.",
            existing_expenses: existingExpenses.map(
              (e: Record<string, unknown>) => ({
                expense_id: e.id,
                amount: Number(e.amount || 0),
                category: e.category,
                description: e.description ?? null,
                vendor: e.vendor ?? null,
                expense_date: e.expense_date,
              }),
            ),
            to_record_anyway:
              "Call add_expense again with confirm_duplicate=true once the user confirms it is a separate, legitimate expense.",
          });
        }
      }

      const payload: Record<string, unknown> = {
        category: input.category,
        amount: input.amount,
        expense_date: expenseDate,
        created_by: userId,
      };

      if (resolvedPropertyId) payload.property_id = resolvedPropertyId;
      if (resolvedOwnerId) payload.owner_id = resolvedOwnerId;
      if (input.unit_id) payload.unit_id = input.unit_id;
      if (input.description) payload.description = input.description;
      if (input.vendor) payload.vendor = input.vendor;

      const { data: expense, error } = await supabase
        .from("expenses")
        .insert(payload)
        .select("id")
        .single();

      if (error) return JSON.stringify({ error: error.message });

      await supabase.from("audit_log").insert({
        user_id: userId,
        action: "create",
        entity_type: "expense",
        entity_id: expense?.id,
        metadata: {
          amount: input.amount,
          category: input.category,
          source: "whatsapp_agent",
        },
      });

      // Optional receipt photo: the webhook stashes incoming images in
      // pending_receipt_attachments and surfaces a token in the user's
      // message; the agent passes that token here so we can move the file
      // from a temp area to a permanent one tied to this expense.
      let attachedReceipt: string | null = null;
      const attachmentToken = input.attachment_token as string | undefined;
      if (attachmentToken && expense?.id) {
        attachedReceipt = await attachReceiptToExpense(
          supabase,
          attachmentToken,
          expense.id as string,
          userId,
        );
      }

      return JSON.stringify({
        success: true,
        expense_id: expense?.id,
        amount: input.amount,
        category: input.category,
        description: input.description || null,
        date: expenseDate,
        receipt_attached: attachedReceipt ? true : false,
        receipt_path: attachedReceipt,
      });
    }

    case "delete_expense": {
      const expenseId = input.expense_id as string | undefined;
      let ownerId = input.owner_id as string | undefined;

      // Find the target row.
      let target:
        | { id: string; owner_id: string | null; property_id: string | null }
        | null = null;
      let remainingMatches = 0;

      if (expenseId) {
        const { data: row, error: findErr } = await supabase
          .from("expenses")
          .select("id, owner_id, property_id, amount, category, expense_date")
          .eq("id", expenseId)
          .maybeSingle();
        if (findErr) return JSON.stringify({ error: findErr.message });
        if (!row) {
          return JSON.stringify({
            error: `No expense found with id ${expenseId}.`,
          });
        }
        target = {
          id: row.id as string,
          owner_id: (row.owner_id as string | null) ?? null,
          property_id: (row.property_id as string | null) ?? null,
        };
      } else {
        // Criteria-based lookup. Require at least one distinguishing field so
        // we never delete an arbitrary expense.
        const amount =
          input.amount != null && Number.isFinite(Number(input.amount))
            ? Number(input.amount)
            : undefined;
        const expenseDate = input.expense_date as string | undefined;
        const category = input.category as string | undefined;

        if (amount == null && !expenseDate && !category) {
          return JSON.stringify({
            error:
              "Provide expense_id, or at least one of amount / expense_date / category to locate the expense to delete.",
          });
        }

        // Resolve owner if not provided so we can scope the search.
        if (!ownerId) {
          const { data: owners } = await supabase
            .from("owners")
            .select("id")
            .eq("is_active", true)
            .limit(2);
          if (!owners || owners.length === 0) {
            return JSON.stringify({ error: "No active owner exists." });
          }
          if (owners.length > 1) {
            return JSON.stringify({
              error:
                "Multiple owners exist. Pass owner_id (or expense_id) to delete the right expense.",
            });
          }
          ownerId = owners[0].id as string;
        }

        // Match either owner-level expenses or expenses on a property the
        // owner owns. Build the property id set for the OR branch.
        const { data: ownerProps } = await supabase
          .from("properties")
          .select("id")
          .eq("owner_id", ownerId);
        const ownerPropIds = (ownerProps || []).map((p) => p.id as string);
        const orClauses = [`owner_id.eq.${ownerId}`];
        if (ownerPropIds.length > 0) {
          orClauses.push(`property_id.in.(${ownerPropIds.join(",")})`);
        }

        let q = supabase
          .from("expenses")
          .select("id, owner_id, property_id, amount, category, expense_date")
          .or(orClauses.join(","))
          .order("created_at", { ascending: false });
        if (amount != null) q = q.eq("amount", amount);
        if (expenseDate) q = q.eq("expense_date", expenseDate);
        if (category) q = q.eq("category", category);

        const { data: matches, error: matchErr } = await q;
        if (matchErr) return JSON.stringify({ error: matchErr.message });
        if (!matches || matches.length === 0) {
          return JSON.stringify({
            error:
              "No expense matches those criteria. Use list_recent_owner_activity to find the right one.",
          });
        }
        // Delete exactly ONE row — the most recently created — so that when an
        // expense was recorded twice, the original legitimate entry stays.
        target = {
          id: matches[0].id as string,
          owner_id: (matches[0].owner_id as string | null) ?? null,
          property_id: (matches[0].property_id as string | null) ?? null,
        };
        remainingMatches = matches.length - 1;
      }

      const { error: delErr } = await supabase
        .from("expenses")
        .delete()
        .eq("id", target.id);
      if (delErr) return JSON.stringify({ error: delErr.message });

      await supabase.from("audit_log").insert({
        user_id: userId,
        action: "delete",
        entity_type: "expense",
        entity_id: target.id,
        metadata: {
          owner_id: target.owner_id,
          property_id: target.property_id,
          source: "whatsapp_agent",
        },
      });

      // Recalculate the balance for the affected owner so the agent can
      // confirm the impact. Resolve the owner from the property when the
      // expense was property-scoped without an owner_id.
      let balanceOwnerId = target.owner_id;
      if (!balanceOwnerId && target.property_id) {
        const { data: prop } = await supabase
          .from("properties")
          .select("owner_id")
          .eq("id", target.property_id)
          .maybeSingle();
        balanceOwnerId = (prop?.owner_id as string | null) ?? null;
      }
      const newBalance = balanceOwnerId
        ? await getOwnerBalance(supabase, balanceOwnerId)
        : null;

      return JSON.stringify({
        success: true,
        deleted_expense_id: target.id,
        owner_id: balanceOwnerId,
        remaining_identical_matches: remainingMatches,
        new_balance: newBalance?.balance ?? null,
        new_balance_side: newBalance?.side ?? null,
      });
    }

    case "get_property_invoices": {
      const propertyId = input.property_id as string;
      const statusFilter = (input.status_filter as string) || "unpaid";
      const startDate = input.start_date as string | undefined;
      const endDate = input.end_date as string | undefined;

      // Get units for this property
      const { data: propUnits } = await supabase
        .from("units")
        .select("id")
        .eq("property_id", propertyId);

      if (!propUnits || propUnits.length === 0) {
        return JSON.stringify({ invoices: [], message: "No units found for this property" });
      }

      const unitIds = propUnits.map((u) => u.id);

      let query = supabase
        .from("invoices")
        .select("id, amount, paid_amount, due_date, status, period_start, tenants(full_name), units(unit_number)")
        .in("unit_id", unitIds)
        .order("due_date", { ascending: true })
        .limit(200);

      if (statusFilter === "unpaid") {
        query = query.in("status", ["pending", "overdue", "partial"]);
      } else if (statusFilter === "paid") {
        query = query.eq("status", "paid");
      }

      if (startDate) {
        query = query.gte("due_date", startDate);
      }
      if (endDate) {
        query = query.lte("due_date", endDate);
      }

      const { data: invoices, error } = await query;
      if (error) return JSON.stringify({ error: error.message });

      // Supabase join can return either an object or a single-element array
      // depending on the FK relationship, so normalise both shapes.
      const pickJoined = (val: unknown): Record<string, unknown> | null => {
        if (!val) return null;
        if (Array.isArray(val)) return (val[0] as Record<string, unknown>) || null;
        return val as Record<string, unknown>;
      };

      const results = (invoices || []).map((inv: Record<string, unknown>) => {
        const tenant = pickJoined(inv.tenants);
        const unit = pickJoined(inv.units);
        return {
          id: inv.id,
          tenant_name: (tenant?.full_name as string) || "Unknown",
          unit_number: (unit?.unit_number as string) || "N/A",
          amount: Number(inv.amount || 0),
          paid_amount: Number(inv.paid_amount || 0),
          remaining: Number(inv.amount || 0) - Number(inv.paid_amount || 0),
          due_date: inv.due_date as string,
          status: inv.status as string,
        };
      });

      const totalAmount = results.reduce((s, r) => s + r.amount, 0);
      const totalPaid = results.reduce((s, r) => s + r.paid_amount, 0);
      const totalRemaining = results.reduce((s, r) => s + r.remaining, 0);

      // Pre-format a compact text list so the model echoes exact unit numbers
      // instead of hallucinating patterns from a large JSON payload.
      const formattedLines = results.map(
        (r) =>
          `- Unit ${r.unit_number} | ${r.tenant_name} | due ${r.due_date} | ${r.amount.toFixed(2)} OMR | paid ${r.paid_amount.toFixed(2)} | remaining ${r.remaining.toFixed(2)} | ${r.status}`
      );

      return JSON.stringify({
        property_id: propertyId,
        filter: statusFilter,
        date_range: startDate || endDate ? `${startDate || "start"} to ${endDate || "now"}` : "all",
        invoice_count: results.length,
        total_amount: totalAmount.toFixed(2),
        total_paid: totalPaid.toFixed(2),
        total_remaining: totalRemaining.toFixed(2),
        instructions:
          "Use ONLY the unit numbers and tenant names shown in formatted_list below. Do NOT invent or extrapolate unit numbers. Quote them exactly as written.",
        formatted_list: formattedLines.join("\n"),
      });
    }

    case "get_overdue_summary": {
      const monthFilter = input.month as string | undefined;

      let query = supabase
        .from("invoices")
        .select(
          `
          id, amount, paid_amount, due_date, status, period_start,
          tenants(full_name, phone),
          units(unit_number, properties(name))
        `
        )
        .in("status", ["pending", "overdue", "partial"])
        .order("due_date", { ascending: true });

      // Filter by month if provided
      if (monthFilter && /^\d{4}-\d{2}$/.test(monthFilter)) {
        const monthStart = `${monthFilter}-01`;
        const [y, m] = monthFilter.split("-").map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        const monthEnd = `${monthFilter}-${String(lastDay).padStart(2, "0")}`;
        query = query.gte("period_start", monthStart).lte("period_start", monthEnd);
      }

      const { data: overdueInvoices, error } = await query;

      if (error) return JSON.stringify({ error: error.message });
      if (!overdueInvoices || overdueInvoices.length === 0)
        return JSON.stringify({ message: monthFilter ? `No unpaid invoices for ${monthFilter}.` : "No unpaid invoices! Everything is up to date." });

      let totalOverdue = 0;
      const summary = overdueInvoices.map((inv: Record<string, unknown>) => {
        const amount = Number(inv.amount || 0);
        const paid = Number(inv.paid_amount || 0);
        const owing = amount - paid;
        totalOverdue += owing;
        const tenant = inv.tenants as unknown as Record<string, unknown> | null;
        const unit = inv.units as unknown as Record<string, unknown> | null;
        const prop = (unit as unknown as Record<string, unknown> | null)?.properties as unknown as Record<string, unknown> | null;
        return {
          tenant: tenant?.full_name,
          property: prop?.name,
          unit: unit?.unit_number,
          due_date: inv.due_date,
          amount_owed: owing,
          invoice_id: inv.id,
        };
      });

      return JSON.stringify({
        total_overdue: totalOverdue,
        overdue_count: overdueInvoices.length,
        invoices: summary,
      });
    }

    case "get_today_summary": {
      const today = new Date().toISOString().split("T")[0];

      // Invoices due today (include partial — those still have an
      // outstanding balance the tenant is expected to pay).
      const { data: dueToday } = await supabase
        .from("invoices")
        .select("id, amount, paid_amount, tenants(full_name)")
        .eq("due_date", today)
        .in("status", ["pending", "partial"]);

      // Overdue invoices — include partial and past-due pending so the count
      // matches the invoices page outstanding view.
      const { data: overdue } = await supabase
        .from("invoices")
        .select("id, amount, paid_amount, status, due_date")
        .or(
          `status.eq.overdue,status.eq.partial,and(status.eq.pending,due_date.lt.${today})`
        );

      // Payments received today
      const { data: todayPayments } = await supabase
        .from("payments")
        .select("amount, method, tenants(full_name)")
        .eq("payment_date", today);

      // Unit stats
      const { data: units } = await supabase
        .from("units")
        .select("status");

      const totalUnits = units?.length || 0;
      const occupied =
        units?.filter((u: Record<string, unknown>) => u.status === "occupied")
          .length || 0;

      let overdueTotal = 0;
      for (const inv of overdue || []) {
        overdueTotal +=
          Number(inv.amount || 0) - Number(inv.paid_amount || 0);
      }

      return JSON.stringify({
        date: today,
        invoices_due_today: (dueToday || []).length,
        invoices_due_today_details: dueToday || [],
        overdue_count: (overdue || []).length,
        overdue_total: overdueTotal,
        payments_today: (todayPayments || []).length,
        payments_today_total: (todayPayments || []).reduce(
          (sum: number, p: Record<string, unknown>) =>
            sum + Number(p.amount || 0),
          0
        ),
        payments_today_details: todayPayments || [],
        occupancy: {
          total_units: totalUnits,
          occupied,
          vacant: totalUnits - occupied,
          rate:
            totalUnits > 0
              ? `${Math.round((occupied / totalUnits) * 100)}%`
              : "N/A",
        },
      });
    }

    case "get_expenses_summary": {
      // Business manager fees (owner_business_fees) and commission live in
      // their own tables / are computed on the fly — they are NOT rows in the
      // expenses table, so getExpensesSummary (which queries expenses only)
      // naturally excludes them. Shared with the daily admin-summary cron so
      // both report identical numbers.
      const propertyId = input.property_id as string | undefined;

      let summary;
      try {
        summary = await getExpensesSummary(supabase, { propertyId });
      } catch (err) {
        return JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Resolve a friendly scope label for the reply.
      let scope = "all properties (company-wide)";
      if (propertyId) {
        const { data: prop } = await supabase
          .from("properties")
          .select("name")
          .eq("id", propertyId)
          .single();
        scope = (prop?.name as string) || "selected property";
      }

      const fmt = (p: { total: number; count: number; byCategory: Record<string, number> }) => ({
        total: p.total,
        count: p.count,
        by_category: p.byCategory,
      });
      return JSON.stringify({
        scope,
        excludes: "business manager fees and commission (not counted as expenses)",
        previous_day: { date: summary.previousDay.date, ...fmt(summary.previousDay) },
        month_to_date: {
          from: summary.monthToDate.from,
          to: summary.monthToDate.to,
          ...fmt(summary.monthToDate),
        },
        year_to_date: {
          from: summary.yearToDate.from,
          to: summary.yearToDate.to,
          ...fmt(summary.yearToDate),
        },
      });
    }

    case "update_lease_rent": {
      const leaseId = input.lease_id as string;
      const newRent = Number(input.new_rent);

      if (!newRent || newRent <= 0)
        return JSON.stringify({ error: "Invalid rent amount" });

      // Get current lease info
      const { data: lease, error: fetchError } = await supabase
        .from("leases")
        .select("id, monthly_rent, tenant_id, unit_id, tenants(full_name), units(unit_number)")
        .eq("id", leaseId)
        .single();

      if (fetchError || !lease)
        return JSON.stringify({ error: "Lease not found" });

      const oldRent = Number(lease.monthly_rent);

      // Update lease rent
      const { error: leaseError } = await supabase
        .from("leases")
        .update({
          monthly_rent: newRent,
          updated_at: new Date().toISOString(),
        })
        .eq("id", leaseId);

      if (leaseError)
        return JSON.stringify({ error: leaseError.message });

      // Also update the unit's rent_amount
      await supabase
        .from("units")
        .update({
          rent_amount: newRent,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lease.unit_id);

      // Audit log
      await supabase.from("audit_log").insert({
        user_id: userId,
        action: "update",
        entity_type: "lease",
        entity_id: leaseId,
        metadata: {
          old_rent: oldRent,
          new_rent: newRent,
          source: "whatsapp_agent",
        },
      });

      const tenant = lease.tenants as unknown as Record<string, unknown> | null;
      const unit = lease.units as unknown as Record<string, unknown> | null;

      return JSON.stringify({
        success: true,
        tenant_name: tenant?.full_name,
        unit_number: unit?.unit_number,
        old_rent: oldRent,
        new_rent: newRent,
      });
    }

    case "update_invoice": {
      const invoiceId = input.invoice_id as string;

      // Fetch current invoice
      const { data: invoice, error: fetchError } = await supabase
        .from("invoices")
        .select("id, amount, due_date, status, notes, tenant_id, tenants(full_name)")
        .eq("id", invoiceId)
        .single();

      if (fetchError || !invoice)
        return JSON.stringify({ error: "Invoice not found" });

      if (invoice.status === "paid")
        return JSON.stringify({
          error: "Cannot update a paid invoice. Cancel it first and create a new one if needed.",
        });

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (input.amount !== undefined) updates.amount = Number(input.amount);
      if (input.due_date) updates.due_date = input.due_date;
      if (input.notes !== undefined) updates.notes = input.notes;

      const { error: updateError } = await supabase
        .from("invoices")
        .update(updates)
        .eq("id", invoiceId);

      if (updateError)
        return JSON.stringify({ error: updateError.message });

      // Audit log
      await supabase.from("audit_log").insert({
        user_id: userId,
        action: "update",
        entity_type: "invoice",
        entity_id: invoiceId,
        metadata: {
          changes: updates,
          source: "whatsapp_agent",
        },
      });

      const tenant = invoice.tenants as unknown as Record<string, unknown> | null;

      return JSON.stringify({
        success: true,
        invoice_id: invoiceId,
        tenant_name: tenant?.full_name,
        new_amount: updates.amount || invoice.amount,
        new_due_date: updates.due_date || invoice.due_date,
      });
    }

    case "cancel_invoice": {
      const invoiceId = input.invoice_id as string;
      const action = input.action as string;
      const reason = (input.reason as string) || `${action} via WhatsApp agent`;

      // Fetch invoice
      const { data: invoice, error: fetchError } = await supabase
        .from("invoices")
        .select("id, amount, status, tenant_id, tenants(full_name), units(unit_number)")
        .eq("id", invoiceId)
        .single();

      if (fetchError || !invoice)
        return JSON.stringify({ error: "Invoice not found" });

      if (invoice.status === "paid")
        return JSON.stringify({
          error: "Cannot cancel a paid invoice. It has already been settled.",
        });

      if (invoice.status === "cancelled" || invoice.status === "written_off")
        return JSON.stringify({
          error: `Invoice is already ${invoice.status}`,
        });

      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          status: action,
          notes: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);

      if (updateError)
        return JSON.stringify({ error: updateError.message });

      // Audit log
      await supabase.from("audit_log").insert({
        user_id: userId,
        action: "status_update",
        entity_type: "invoice",
        entity_id: invoiceId,
        metadata: {
          new_status: action,
          reason,
          source: "whatsapp_agent",
        },
      });

      const tenant = invoice.tenants as unknown as Record<string, unknown> | null;
      const unit = invoice.units as unknown as Record<string, unknown> | null;

      return JSON.stringify({
        success: true,
        invoice_id: invoiceId,
        tenant_name: tenant?.full_name,
        unit_number: unit?.unit_number,
        amount: invoice.amount,
        new_status: action,
        reason,
      });
    }

    case "get_owner_balance": {
      const ownerId = input.owner_id as string | undefined;
      const result = ownerId
        ? await getOwnerBalance(supabase, ownerId)
        : await getDefaultOwnerBalance(supabase);

      if (!result) {
        return JSON.stringify({
          error:
            "Could not resolve owner. Either no owner is set up yet, or there are multiple owners and owner_id was not provided. Ask the user which owner they mean.",
        });
      }

      const sideText =
        result.side === "company_owes_owner"
          ? `Company owes ${result.ownerName} ${result.balance.toFixed(2)} OMR`
          : result.side === "owner_owes_company"
            ? `${result.ownerName} owes the company ${Math.abs(result.balance).toFixed(2)} OMR`
            : "Balance is settled (zero)";

      return JSON.stringify({
        owner_id: result.ownerId,
        owner_name: result.ownerName,
        as_of: result.asOf,
        balance: result.balance,
        side: result.side,
        summary: sideText,
        breakdown: result.breakdown,
      });
    }

    case "record_owner_settlement": {
      let ownerId = input.owner_id as string | undefined;
      const direction = input.direction as
        | "company_to_owner"
        | "owner_to_company";
      const amount = Number(input.amount);
      const method = (input.method as string) || "cash";
      const settledAt =
        (input.settled_at as string) || new Date().toISOString().split("T")[0];

      if (!direction || !["company_to_owner", "owner_to_company"].includes(direction)) {
        return JSON.stringify({
          error: "direction must be 'company_to_owner' or 'owner_to_company'.",
        });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return JSON.stringify({ error: "amount must be a positive number." });
      }

      // Resolve owner if not provided.
      if (!ownerId) {
        const { data: owners } = await supabase
          .from("owners")
          .select("id")
          .eq("is_active", true)
          .limit(2);
        if (!owners || owners.length === 0) {
          return JSON.stringify({
            error: "No active owner exists. Create an owner first.",
          });
        }
        if (owners.length > 1) {
          return JSON.stringify({
            error:
              "Multiple owners exist. Ask the user which owner this settlement is for and pass owner_id.",
          });
        }
        ownerId = owners[0].id as string;
      }

      // Duplicate guard: refuse to silently record a settlement that looks
      // identical to an existing one (same owner, direction, amount) within a
      // few days, unless the user has explicitly confirmed. This is the root
      // cause behind a "paid to owner expense recorded twice" complaint.
      const confirmDuplicate = input.confirm_duplicate === true;
      if (!confirmDuplicate) {
        const windowDays = 3;
        const lowerDate = new Date(
          new Date(settledAt).getTime() - windowDays * 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .split("T")[0];
        const upperDate = new Date(
          new Date(settledAt).getTime() + windowDays * 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .split("T")[0];
        const { data: existing } = await supabase
          .from("owner_settlements")
          .select("id, amount, direction, method, settled_at")
          .eq("owner_id", ownerId)
          .eq("direction", direction)
          .eq("amount", amount)
          .gte("settled_at", lowerDate)
          .lte("settled_at", upperDate)
          .order("settled_at", { ascending: false });

        if (existing && existing.length > 0) {
          return JSON.stringify({
            requires_confirmation: true,
            reason: "possible_duplicate",
            message:
              "A settlement with the same owner, direction and amount already exists near this date. This may be a duplicate. Ask the user to confirm before recording another one — and if it IS a duplicate, do NOT record a new entry; offer to delete the extra instead using delete_owner_settlement.",
            existing_settlements: existing.map((s: Record<string, unknown>) => ({
              settlement_id: s.id,
              direction: s.direction,
              amount: Number(s.amount || 0),
              method: s.method,
              settled_at: s.settled_at,
            })),
            to_record_anyway:
              "Call record_owner_settlement again with confirm_duplicate=true once the user confirms it is a separate, legitimate payment.",
          });
        }
      }

      const { data: settlement, error: insertErr } = await supabase
        .from("owner_settlements")
        .insert({
          owner_id: ownerId,
          direction,
          amount,
          method,
          settled_at: settledAt,
          reference_number: input.reference_number || null,
          notes: input.notes || null,
          recorded_by: userId,
        })
        .select("id")
        .single();

      if (insertErr) return JSON.stringify({ error: insertErr.message });

      await supabase.from("audit_log").insert({
        user_id: userId,
        action: "create",
        entity_type: "owner_settlement",
        entity_id: settlement?.id,
        metadata: {
          owner_id: ownerId,
          direction,
          amount,
          method,
          source: "whatsapp_agent",
        },
      });

      // Pull the new running balance so the agent can confirm the impact.
      const newBalance = await getOwnerBalance(supabase, ownerId);

      return JSON.stringify({
        success: true,
        settlement_id: settlement?.id,
        owner_id: ownerId,
        direction,
        amount,
        method,
        settled_at: settledAt,
        new_balance: newBalance?.balance ?? null,
        new_balance_side: newBalance?.side ?? null,
      });
    }

    case "delete_owner_settlement": {
      let ownerId = input.owner_id as string | undefined;
      const settlementId = input.settlement_id as string | undefined;

      // Resolve owner if not provided (needed for criteria-based lookups and
      // for recalculating the balance afterwards).
      if (!ownerId) {
        const { data: owners } = await supabase
          .from("owners")
          .select("id")
          .eq("is_active", true)
          .limit(2);
        if (!owners || owners.length === 0) {
          return JSON.stringify({ error: "No active owner exists." });
        }
        if (owners.length > 1 && !settlementId) {
          return JSON.stringify({
            error:
              "Multiple owners exist. Pass owner_id, or pass the settlement_id of the row to delete.",
          });
        }
        if (owners.length === 1) ownerId = owners[0].id as string;
      }

      // Find the target row(s).
      let target: { id: string; owner_id: string } | null = null;
      let remainingMatches = 0;

      if (settlementId) {
        const { data: row, error: findErr } = await supabase
          .from("owner_settlements")
          .select("id, owner_id, amount, direction, settled_at")
          .eq("id", settlementId)
          .maybeSingle();
        if (findErr) return JSON.stringify({ error: findErr.message });
        if (!row) {
          return JSON.stringify({
            error: `No settlement found with id ${settlementId}.`,
          });
        }
        target = { id: row.id as string, owner_id: row.owner_id as string };
      } else {
        // Criteria-based lookup. Require at least one distinguishing field so
        // we never delete an arbitrary settlement.
        const direction = input.direction as string | undefined;
        const amount =
          input.amount != null && Number.isFinite(Number(input.amount))
            ? Number(input.amount)
            : undefined;
        const settledAt = input.settled_at as string | undefined;

        if (!direction && amount == null && !settledAt) {
          return JSON.stringify({
            error:
              "Provide settlement_id, or at least one of direction / amount / settled_at to locate the settlement to delete.",
          });
        }
        if (!ownerId) {
          return JSON.stringify({
            error:
              "Multiple owners exist. Pass owner_id (or settlement_id) to delete the right settlement.",
          });
        }

        let q = supabase
          .from("owner_settlements")
          .select("id, owner_id, amount, direction, settled_at")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: false });
        if (direction) q = q.eq("direction", direction);
        if (amount != null) q = q.eq("amount", amount);
        if (settledAt) q = q.eq("settled_at", settledAt);

        const { data: matches, error: matchErr } = await q;
        if (matchErr) return JSON.stringify({ error: matchErr.message });
        if (!matches || matches.length === 0) {
          return JSON.stringify({
            error:
              "No settlement matches those criteria. Use list_recent_owner_activity to find the right one.",
          });
        }
        // Delete exactly ONE row — the most recently created — so that when a
        // settlement was recorded twice, the original legitimate entry stays.
        target = {
          id: matches[0].id as string,
          owner_id: matches[0].owner_id as string,
        };
        remainingMatches = matches.length - 1;
      }

      const { error: delErr } = await supabase
        .from("owner_settlements")
        .delete()
        .eq("id", target.id);
      if (delErr) return JSON.stringify({ error: delErr.message });

      await supabase.from("audit_log").insert({
        user_id: userId,
        action: "delete",
        entity_type: "owner_settlement",
        entity_id: target.id,
        metadata: {
          owner_id: target.owner_id,
          source: "whatsapp_agent",
        },
      });

      const newBalance = await getOwnerBalance(supabase, target.owner_id);

      return JSON.stringify({
        success: true,
        deleted_settlement_id: target.id,
        owner_id: target.owner_id,
        remaining_identical_matches: remainingMatches,
        new_balance: newBalance?.balance ?? null,
        new_balance_side: newBalance?.side ?? null,
      });
    }

    case "list_recent_owner_activity": {
      let ownerId = input.owner_id as string | undefined;
      const days = Number(input.days) > 0 ? Number(input.days) : 14;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      if (!ownerId) {
        const { data: owners } = await supabase
          .from("owners")
          .select("id, name")
          .eq("is_active", true)
          .limit(2);
        if (!owners || owners.length === 0) {
          return JSON.stringify({ error: "No active owner exists." });
        }
        if (owners.length > 1) {
          return JSON.stringify({
            error: "Multiple owners exist. Pass owner_id.",
          });
        }
        ownerId = owners[0].id as string;
      }

      const { data: properties } = await supabase
        .from("properties")
        .select("id, name")
        .eq("owner_id", ownerId);
      const propertyIds = (properties || []).map((p) => p.id as string);
      const propertyNameById = new Map(
        (properties || []).map((p) => [p.id as string, p.name as string]),
      );

      // Lease ids (for payments lookup) — same trick as in balance.ts.
      const { data: ownerUnits } = await supabase
        .from("units")
        .select("id")
        .in("property_id", propertyIds.length > 0 ? propertyIds : ["00000000-0000-0000-0000-000000000000"]);
      const ownerUnitIds = (ownerUnits || []).map((u) => u.id as string);
      const { data: ownerLeases } = await supabase
        .from("leases")
        .select("id, unit_id, units(property_id), tenants(full_name)")
        .in(
          "unit_id",
          ownerUnitIds.length > 0
            ? ownerUnitIds
            : ["00000000-0000-0000-0000-000000000000"],
        );
      const leaseIds = (ownerLeases || []).map((l) => l.id as string);
      const leaseInfo = new Map(
        (ownerLeases || []).map((l) => {
          const u = l.units as unknown as Record<string, unknown> | null;
          const t = l.tenants as unknown as Record<string, unknown> | null;
          return [
            l.id as string,
            {
              propertyName:
                propertyNameById.get((u?.property_id as string) || "") || "?",
              tenantName: (t?.full_name as string) || "?",
            },
          ];
        }),
      );

      const [paymentsRes, expensesRes, settlementsRes, feesRes] = await Promise.all([
        leaseIds.length > 0
          ? supabase
              .from("payments")
              .select("amount, method, payment_date, lease_id")
              .in("lease_id", leaseIds)
              .gte("payment_date", since)
              .order("payment_date", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        // Match both owner-level expenses (no property dimension — the common
        // case for this portfolio) AND expenses tied to a property the owner
        // owns. The previous version only queried property-scoped expenses, so
        // owner-level expenses (and any duplicates among them) never surfaced
        // here — which is exactly what the agent needs to see to delete a
        // duplicate.
        (() => {
          const orClauses = [`owner_id.eq.${ownerId}`];
          if (propertyIds.length > 0) {
            orClauses.push(`property_id.in.(${propertyIds.join(",")})`);
          }
          return supabase
            .from("expenses")
            .select(
              "id, amount, category, description, expense_date, property_id, vendor",
            )
            .or(orClauses.join(","))
            .gte("expense_date", since)
            .order("expense_date", { ascending: false });
        })(),
        supabase
          .from("owner_settlements")
          .select("id, amount, direction, method, settled_at")
          .eq("owner_id", ownerId)
          .gte("settled_at", since)
          .order("settled_at", { ascending: false }),
        supabase
          .from("owner_business_fees")
          .select("amount, period_month")
          .eq("owner_id", ownerId)
          .gte("period_month", since)
          .order("period_month", { ascending: false }),
      ]);

      const payments = (paymentsRes.data || []).map((p: Record<string, unknown>) => {
        const info = leaseInfo.get(p.lease_id as string);
        return {
          date: p.payment_date,
          tenant: info?.tenantName || "?",
          property: info?.propertyName || "?",
          amount: Number(p.amount || 0),
          method: p.method,
        };
      });
      const expenses = (expensesRes.data || []).map((e: Record<string, unknown>) => ({
        expense_id: e.id,
        date: e.expense_date,
        property: e.property_id
          ? propertyNameById.get(e.property_id as string) || "?"
          : "(owner-level)",
        category: e.category,
        amount: Number(e.amount || 0),
        vendor: e.vendor || null,
        description: e.description || null,
      }));
      const settlements = (settlementsRes.data || []).map(
        (s: Record<string, unknown>) => ({
          settlement_id: s.id,
          date: s.settled_at,
          direction: s.direction,
          amount: Number(s.amount || 0),
          method: s.method,
        }),
      );
      const fees = (feesRes.data || []).map((f: Record<string, unknown>) => ({
        period: f.period_month,
        amount: Number(f.amount || 0),
      }));

      return JSON.stringify({
        owner_id: ownerId,
        window_days: days,
        since,
        payments,
        expenses,
        settlements,
        business_fees: fees,
      });
    }

    case "get_invoice_payments": {
      const invoiceId = input.invoice_id as string;
      if (!invoiceId)
        return JSON.stringify({ error: "invoice_id is required" });

      const { data: invoice, error: invErr } = await supabase
        .from("invoices")
        .select(
          `
          id, lease_id, tenant_id, amount, paid_amount, status, due_date,
          period_start, period_end, paid_date,
          tenants(id, full_name),
          units(id, unit_number, properties(id, name))
        `,
        )
        .eq("id", invoiceId)
        .maybeSingle();

      if (invErr) return JSON.stringify({ error: invErr.message });
      if (!invoice)
        return JSON.stringify({ error: `Invoice ${invoiceId} not found` });

      const periodStart = invoice.period_start as string | null;
      const paidDate = invoice.paid_date as string | null;
      const lower = periodStart || (paidDate ? `${paidDate.slice(0, 4)}-01-01` : null);
      const upper =
        invoice.status === "paid" && paidDate
          ? paidDate
          : new Date().toISOString().slice(0, 10);

      let paymentsQuery = supabase
        .from("payments")
        .select("id, amount, method, payment_date, reference_number, notes, created_at")
        .eq("lease_id", invoice.lease_id as string)
        .order("payment_date", { ascending: false });
      if (lower) paymentsQuery = paymentsQuery.gte("payment_date", lower);
      if (upper) paymentsQuery = paymentsQuery.lte("payment_date", upper);

      const { data: payments, error: payErr } = await paymentsQuery;
      if (payErr) return JSON.stringify({ error: payErr.message });

      const { data: linkedCheques } = await supabase
        .from("cheques")
        .select("id, cheque_number, bank_name, cheque_date, amount, status, payment_id")
        .eq("invoice_id", invoiceId)
        .order("cheque_date", { ascending: false });

      const tenant = invoice.tenants as unknown as
        | Record<string, unknown>
        | null;
      const unit = invoice.units as unknown as
        | Record<string, unknown>
        | null;
      const property = unit?.properties as unknown as
        | Record<string, unknown>
        | null;

      return JSON.stringify({
        invoice: {
          id: invoice.id,
          status: invoice.status,
          amount: Number(invoice.amount || 0),
          paid_amount: Number(invoice.paid_amount || 0),
          due_date: invoice.due_date,
          period_start: invoice.period_start,
          period_end: invoice.period_end,
          paid_date: invoice.paid_date,
          tenant_name: tenant?.full_name || null,
          unit_number: unit?.unit_number || null,
          property_name: property?.name || null,
        },
        payments: (payments || []).map((p: Record<string, unknown>) => ({
          id: p.id,
          method: p.method,
          amount: Number(p.amount || 0),
          payment_date: p.payment_date,
          reference_number: p.reference_number || null,
          notes: p.notes || null,
        })),
        linked_cheques: (linkedCheques || []).map(
          (c: Record<string, unknown>) => ({
            id: c.id,
            cheque_number: c.cheque_number,
            bank_name: c.bank_name,
            cheque_date: c.cheque_date,
            amount: Number(c.amount || 0),
            status: c.status,
            payment_id: c.payment_id,
          }),
        ),
        note:
          invoice.status === "pending" || invoice.status === "overdue"
            ? "This invoice is unpaid — no payments recorded yet."
            : "Payments are matched by lease_id and date window (invoices have no direct payment_id FK). Confirm with the user if multiple payments are returned.",
      });
    }

    case "update_payment_method": {
      const paymentId = input.payment_id as string;
      const newMethod = input.new_method as string;
      const allowed = ["cash", "bank_transfer", "cheque"];

      if (!paymentId)
        return JSON.stringify({ error: "payment_id is required" });
      if (!allowed.includes(newMethod))
        return JSON.stringify({
          error: `new_method must be one of: ${allowed.join(", ")}`,
        });

      const { data: existing, error: fetchErr } = await supabase
        .from("payments")
        .select("id, method, amount, tenant_id, lease_id, payment_date")
        .eq("id", paymentId)
        .maybeSingle();

      if (fetchErr) return JSON.stringify({ error: fetchErr.message });
      if (!existing)
        return JSON.stringify({ error: `Payment ${paymentId} not found` });

      if (existing.method === newMethod) {
        return JSON.stringify({
          success: true,
          unchanged: true,
          payment_id: paymentId,
          method: newMethod,
          message: `Payment was already recorded as ${newMethod} — no change made.`,
        });
      }

      const previousMethod = existing.method as string;

      const { data: updated, error: updateErr } = await supabase
        .from("payments")
        .update({ method: newMethod })
        .eq("id", paymentId)
        .select("id");

      if (updateErr) return JSON.stringify({ error: updateErr.message });
      if (!updated || updated.length === 0)
        return JSON.stringify({
          error:
            "Update was silently rejected (no rows changed). Likely an RLS policy or the payment_id is wrong.",
        });

      await supabase.from("audit_log").insert({
        user_id: userId,
        action: "update",
        entity_type: "payment",
        entity_id: paymentId,
        metadata: {
          field: "method",
          previous_method: previousMethod,
          new_method: newMethod,
          amount: Number(existing.amount || 0),
          payment_date: existing.payment_date,
          source: "whatsapp_agent",
        },
      });

      const { data: tenant } = await supabase
        .from("tenants")
        .select("full_name")
        .eq("id", existing.tenant_id as string)
        .maybeSingle();

      const ledgerNote =
        previousMethod === "cheque" || newMethod === "cheque"
          ? "Owner balance affected: cheques bypass the company account, while cash/bank transfers feed into it. The owner balance is recalculated on read, so the change is live."
          : "No owner-balance impact (cash and bank transfer are equivalent for the ledger).";

      const chequeNote =
        newMethod === "cheque"
          ? "Heads up: the cheque details (number, bank, status) are tracked in the cheques table separately. If a cheque record doesn't already exist for this payment, add it via the cheques screen."
          : null;

      return JSON.stringify({
        success: true,
        payment_id: paymentId,
        previous_method: previousMethod,
        new_method: newMethod,
        amount: Number(existing.amount || 0),
        payment_date: existing.payment_date,
        tenant_name: tenant?.full_name || null,
        ledger_note: ledgerNote,
        cheque_note: chequeNote,
      });
    }

    case "search_cheques_by_number": {
      const chequeNumber = (input.cheque_number as string | undefined)?.trim();
      const statusFilter = (input.status_filter as string | undefined) || "all";
      const limit = Math.min(Number(input.limit) || 10, 25);

      if (!chequeNumber) {
        return JSON.stringify({
          error: "cheque_number is required",
        });
      }

      let query = supabase
        .from("cheques")
        .select(
          `
          id, cheque_number, bank_name, cheque_date, amount, status, notes,
          tenant_id, invoice_id, payment_id, created_at,
          tenants(id, full_name, phone),
          invoices(
            id, status, amount, due_date, period_start, period_end,
            units(id, unit_number, properties(id, name))
          )
        `
        )
        .ilike("cheque_number", `%${chequeNumber}%`)
        .order("cheque_date", { ascending: false })
        .limit(limit);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data: cheques, error } = await query;

      if (error) return JSON.stringify({ error: error.message });
      if (!cheques || cheques.length === 0) {
        return JSON.stringify({
          message: `No cheques found matching "${chequeNumber}"${
            statusFilter !== "all" ? ` with status ${statusFilter}` : ""
          }.`,
        });
      }

      const results = cheques.map((c: Record<string, unknown>) => {
        const tenant = c.tenants as Record<string, unknown> | null;
        const invoice = c.invoices as Record<string, unknown> | null;
        const unit = invoice?.units as Record<string, unknown> | null;
        const property = unit?.properties as Record<string, unknown> | null;

        return {
          cheque_id: c.id,
          cheque_number: c.cheque_number,
          bank_name: c.bank_name,
          cheque_date: c.cheque_date,
          amount: Number(c.amount || 0),
          status: c.status,
          notes: c.notes || null,
          tenant: tenant
            ? {
                id: tenant.id,
                full_name: tenant.full_name,
                phone: tenant.phone,
              }
            : null,
          invoice: invoice
            ? {
                id: invoice.id,
                status: invoice.status,
                amount: Number(invoice.amount || 0),
                due_date: invoice.due_date,
                period_start: invoice.period_start,
                period_end: invoice.period_end,
              }
            : null,
          unit: unit
            ? {
                id: unit.id,
                unit_number: unit.unit_number,
              }
            : null,
          property: property
            ? {
                id: property.id,
                name: property.name,
              }
            : null,
        };
      });

      return JSON.stringify({
        count: results.length,
        cheques: results,
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ── Payment lookup helpers ────────────────────────────────────────────────

// Fetch payments for a list of invoices and attach a `payments` array to each
// paid/partial invoice. Payments don't carry a direct invoice_id FK, so we
// match by lease_id + a date window covering the invoice period through the
// invoice's paid_date. This is a heuristic but is the same correlation the
// rest of the system uses (e.g. owner ledger).
async function attachPaymentsToInvoices(
  supabase: ReturnType<typeof getAdminSupabase>,
  invoices: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const needsPayments = invoices.filter(
    (i) => i.status === "paid" || i.status === "partial",
  );
  if (needsPayments.length === 0) return invoices;

  const leaseIds = Array.from(
    new Set(needsPayments.map((i) => i.lease_id as string).filter(Boolean)),
  );
  if (leaseIds.length === 0) return invoices;

  const { data: payments } = await supabase
    .from("payments")
    .select("id, lease_id, amount, method, payment_date, reference_number, notes")
    .in("lease_id", leaseIds)
    .order("payment_date", { ascending: false });

  const allPayments = (payments || []) as Record<string, unknown>[];

  return invoices.map((inv) => {
    if (inv.status !== "paid" && inv.status !== "partial") return inv;

    const leaseId = inv.lease_id as string;
    const periodStart = inv.period_start as string | null;
    const paidDate = inv.paid_date as string | null;
    // Lower bound: invoice period start (fall back to a year before paid_date
    // if period_start is missing). Upper bound: paid_date for fully-paid
    // invoices (the payment that completed it), otherwise today.
    const lower = periodStart || (paidDate ? `${paidDate.slice(0, 4)}-01-01` : "");
    const upper =
      inv.status === "paid" && paidDate
        ? paidDate
        : new Date().toISOString().slice(0, 10);

    const matched = allPayments
      .filter((p) => p.lease_id === leaseId)
      .filter((p) => {
        const d = p.payment_date as string;
        if (!d) return false;
        if (lower && d < lower) return false;
        if (upper && d > upper) return false;
        return true;
      })
      .map((p) => ({
        id: p.id,
        method: p.method,
        amount: Number(p.amount || 0),
        payment_date: p.payment_date,
        reference_number: p.reference_number || null,
        notes: p.notes || null,
      }));

    return { ...inv, payments: matched };
  });
}

// ── Receipt attachment helper ─────────────────────────────────────────────

// Pending receipts captured by the webhook live in pending_receipt_attachments.
// When the agent calls add_expense with the matching token, we move the file
// to a path under the new expense id and write an expense_attachments row.
async function attachReceiptToExpense(
  supabase: ReturnType<typeof getAdminSupabase>,
  token: string,
  expenseId: string,
  userId: string,
): Promise<string | null> {
  const { data: pending } = await supabase
    .from("pending_receipt_attachments")
    .select("id, storage_path, mime_type, file_size")
    .eq("token", token)
    .maybeSingle();

  if (!pending) return null;

  const oldPath = pending.storage_path as string;
  const ext = oldPath.split(".").pop() || "bin";
  const newPath = `receipts/${expenseId}/${Date.now()}.${ext}`;

  const { error: moveErr } = await supabase.storage
    .from("expense-receipts")
    .move(oldPath, newPath);
  // If move fails (e.g. file already moved), fall back to keeping the old
  // path so we don't silently lose the receipt — better a stale path than
  // nothing.
  const finalPath = moveErr ? oldPath : newPath;

  await supabase.from("expense_attachments").insert({
    expense_id: expenseId,
    storage_path: finalPath,
    mime_type: pending.mime_type || null,
    file_size: pending.file_size || null,
    uploaded_by: userId,
  });

  // Also stamp the expense's primary receipt_url for the legacy UI column.
  await supabase
    .from("expenses")
    .update({ receipt_url: finalPath })
    .eq("id", expenseId);

  // Mark the pending row consumed (or delete it).
  await supabase
    .from("pending_receipt_attachments")
    .delete()
    .eq("id", pending.id);

  return finalPath;
}

// ── Conversation history ──────────────────────────────────────────────────

const MAX_HISTORY_MESSAGES = 12; // Last 12 messages (~6 exchanges)
const HISTORY_WINDOW_MINUTES = 30; // Only load messages from last 30 min

// Skip these stale assistant replies when rebuilding context — they were
// emitted by an older buggy fallback and condition the model into repeating
// the same useless answer.
const STALE_ASSISTANT_PATTERNS = [
  /^done!?\s*$/i,
  /^sorry — i couldn't finish that request/i,
  /^sorry, something went wrong processing your request/i,
];

function isStaleAssistantReply(message: string): boolean {
  return STALE_ASSISTANT_PATTERNS.some((re) => re.test(message.trim()));
}

async function loadConversationHistory(
  phone: string
): Promise<Anthropic.MessageParam[]> {
  const supabase = getAdminSupabase();
  const cutoff = new Date(
    Date.now() - HISTORY_WINDOW_MINUTES * 60 * 1000
  ).toISOString();

  // Order DESC + limit so we always get the *newest* messages, then reverse
  // to chronological order before feeding to Claude. The previous ASC+limit
  // pattern silently dropped the newest messages once the window had >20
  // entries.
  const { data: history } = await supabase
    .from("whatsapp_conversations")
    .select("role, message, created_at")
    .eq("user_phone", phone)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);

  if (!history || history.length === 0) return [];

  const chronological = [...history].reverse();

  const messages: Anthropic.MessageParam[] = [];
  for (const entry of chronological) {
    const role = entry.role as "user" | "assistant";
    const raw = typeof entry.message === "string" ? entry.message : "";
    // Anthropic rejects empty content blocks and trailing whitespace on the
    // final assistant content block, so normalise both up front.
    const content = raw.trim();
    if (!content) continue;
    if (role === "assistant" && isStaleAssistantReply(content)) continue;

    if (messages.length > 0 && messages[messages.length - 1].role === role) {
      // Same role twice in a row — keep the newer one so the most recent
      // user message isn't dropped on retry attempts.
      messages[messages.length - 1] = { role, content };
      continue;
    }
    messages.push({ role, content });
  }

  // Ensure first message is from user (Claude requirement)
  while (messages.length > 0 && messages[0].role !== "user") {
    messages.shift();
  }

  return messages;
}

async function saveConversationMessage(
  phone: string,
  role: "user" | "assistant",
  message: string
): Promise<void> {
  const supabase = getAdminSupabase();
  await supabase
    .from("whatsapp_conversations")
    .insert({ user_phone: phone, role, message })
    .then(() => {}); // fire and forget
}

// ── Main agent function ───────────────────────────────────────────────────

// Image MIME types Anthropic's vision model accepts. HEIC/HEIF/PDF fall
// through to text-only mode — the receipt is still stashed via the token,
// the agent just has to ask the user for the amount instead of reading it.
const CLAUDE_VISION_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export type InlineImage = {
  mimeType: string;
  base64: string;
};

export async function processWhatsAppMessage(
  message: string,
  senderPhone: string,
  inlineImage?: InlineImage | null,
): Promise<string> {
  const supabase = getAdminSupabase();

  // 1. Verify sender is a registered admin
  const cleanPhone = senderPhone.replace(/[^\d]/g, "");
  const { data: user } = await supabase
    .from("users")
    .select("id, full_name, role, whatsapp_phone")
    .eq("whatsapp_phone", cleanPhone)
    .eq("is_active", true)
    .single();

  if (!user) {
    return "This is an automated number and does not receive messages. For inquiries, please contact us on WhatsApp at +968 7733 2220.\n\nهذا رقم آلي ولا يستقبل رسائل. للاستفسار، يرجى التواصل معنا عبر واتساب على الرقم 2220 7733 968+";
  }

  // 2. Save incoming message to conversation history
  await saveConversationMessage(cleanPhone, "user", message);

  // 3. Load conversation history for context
  const conversationHistory = await loadConversationHistory(cleanPhone);

  // 4. Run the Claude agent loop
  const today = new Date().toISOString().split("T")[0];
  const systemPrompt = `You are MPIRE Assistant, an intelligent WhatsApp property management agent for ${user.full_name}. You are helpful, proactive, and take action.

TODAY: ${today}
CURRENCY: OMR (Omani Rial)

YOU CAN:
1. Record payments — "Ahmad paid", "register payment for Fatma", "tenant in unit 101 paid 200 OMR"
2. Add expenses — "add expense 50 OMR plumbing at Sunset Tower", "electricity bill 30 OMR"
   - RECEIPT PHOTOS: When the user's message contains "PENDING_RECEIPT_TOKEN: <token>" it means they sent a photo of a receipt/invoice. You MUST treat this as a request to record an expense — that's the only thing receipt photos are used for here. Do not just acknowledge the photo; record it.
   - If a photo is attached to this turn, READ the receipt yourself: extract amount (total payable in OMR), vendor, date, and pick the best category. The caption text is supplementary — the image is the source of truth.
   - Call add_expense with category, amount, optional vendor/description/expense_date, AND attachment_token set to the token from the user message so the photo is saved with the expense.
   - If the amount is genuinely unreadable from BOTH the image and the caption, ask the user for the amount in one short message before calling add_expense — do not invent a number.
   - Default category to "other" only when no better match is obvious from the receipt (utility bill → utilities, plumber/AC/repair → maintenance, cleaning company → cleaning, etc.).
   - ONE expense per add_expense call. Each distinct expense the user mentions is recorded EXACTLY ONCE. Do NOT re-record an expense you already saved earlier in this conversation — when you summarise ("both expenses are now recorded", "I've logged the pending expenses"), that is just a recap of expenses already saved, NOT a cue to call add_expense again. Re-recording is the #1 cause of the owner balance being off (expenses counted twice).
   - Use delete_expense to remove an expense recorded by mistake (duplicate, wrong amount) — e.g. "you logged that expense twice", "delete the duplicate 300 expense". Pass expense_id when you have it (from list_recent_owner_activity); otherwise pass amount + expense_date (+ category). Calling it once removes ONE copy and keeps the legitimate one.
3. Create invoices — "create invoice for Ahmad for April", "generate rent invoice", "create May and June invoices for all tenants"
4. Check balances — "how much does Ahmad owe?", "check balance for unit 101"
5. View unpaid/overdue — "who hasn't paid?", "show overdue invoices", "pending invoices for April", "show me April invoices"
6. Today's summary — "what's happening today?", "daily summary"
7. List tenants — "show all tenants", "who lives in Sunset Tower?"
8. View property info — "show units in Tower A", "list properties"
9. Update rent — "change rent for unit 17 to 230 OMR", "increase Ahmad's rent to 300"
10. Update invoices — "change invoice amount to 230 OMR", "update due date"
11. Cancel invoices — "cancel invoice for Ahmad", "write off unit 5 invoice"
12. Owner ledger — "what's the owner balance?", "how much do I owe the owner?", "owner statement"
    - Use get_owner_balance for "what's the balance / how much do we owe / how much does owner owe".
    - Use record_owner_settlement when the user paid the owner ("I paid the owner 1500 cash" → company_to_owner) or the owner paid the company ("owner gave me 200" → owner_to_company).
    - Use list_recent_owner_activity when the user wants to see recent rent / expenses / settlements feeding the balance. It returns a settlement_id for each settlement — use that id to delete the right one.
    - Use delete_owner_settlement to remove a settlement recorded by mistake (duplicate, wrong amount, wrong direction) — e.g. "you recorded the payment to the owner twice", "delete that duplicate settlement", "remove the 1200 transfer I entered by accident". Pass settlement_id when you have it (from list_recent_owner_activity); otherwise pass direction + amount + settled_at and the tool will find it. If the same settlement was recorded twice, calling it once removes ONE copy and keeps the legitimate one.
13. Look up cheques — "whose cheque is 12345?", "find cheque CHQ-001", "who gave me this cheque?", "cheque 9087 belongs to which tenant?"
    - Use search_cheques_by_number with the cheque number (partial matches work). Reply with the tenant name, bank, amount, status, and (if known) the linked invoice/unit/property.
14. See HOW an invoice was paid — "how was Feb invoice paid?", "what method did Ahmad use?", "was unit 11 paid in cash or cheque?"
    - get_tenant_invoices already returns a payments[] array on each paid/partial invoice (with method). Read that first.
    - If the user asks about a single specific invoice or you need more detail, call get_invoice_payments with the invoice_id.
    - NEVER say "the method isn't shown" without first calling one of these tools.
15. Fix the payment method on a previous payment — "actually that was a cheque, not cash", "change Feb's payment to bank transfer", "fix the method"
    - First call get_invoice_payments (or rely on the payments[] from get_tenant_invoices) to find the payment_id.
    - Then call update_payment_method with payment_id and new_method.
    - If multiple payments exist for the invoice, ask the user WHICH one (show date + amount) before updating.
    - After a change involving 'cheque' (to or from), tell the user the owner balance was recalculated, and if changing TO cheque, remind them the cheque record (number, bank) is tracked separately on the cheques screen.
16. Expenses summary — "how much did we spend yesterday?", "expenses this month", "expenses MTD", "expenses year to date / YTD", "show me expenses"
    - Use get_expenses_summary. It returns totals + a per-category breakdown for the PREVIOUS DAY, MONTH-TO-DATE (MTD) and YEAR-TO-DATE (YTD) in a single call.
    - Report only the period(s) the user asked for; if they just say "expenses" with no period, give all three.
    - CRITICAL: business manager fees and commission are NOT expenses and are deliberately excluded from these figures — never add them into an expenses total, and if asked, clarify they are tracked separately on the owner ledger.
    - Pass property_id ONLY when the user scopes it to a specific building (search_properties first); otherwise omit it for company-wide totals.

BEHAVIOR RULES:
- ALWAYS take action. When the user says "register payment" or "add payment" or "tenant paid", search for the tenant and their unpaid invoices, then mark the invoice as paid. Do NOT say you can't do it.
- "Register payment", "add payment", "record payment", "tenant paid" ALL mean the same thing: mark their invoice as paid using mark_invoice_paid.
- When the user mentions a tenant name, ALWAYS search for them first using search_tenants.
- If a tenant has exactly ONE unpaid invoice, just pay it without asking.
- If a tenant has MULTIPLE unpaid invoices, ask which one (show the list with dates and amounts).
- If no unpaid invoices exist, tell the user and offer to create one.
- When adding expenses, search for the property first, then pick the best category from context.
- Be concise — this is WhatsApp. Use short confirmations with key details.
- Use bullet points and line breaks for readability.
- FORMATTING — WhatsApp uses SINGLE asterisks for bold (e.g. *Tenant:* Ammar). NEVER use double asterisks (**Tenant:**) — WhatsApp renders them as literal stars. Use single * for bold and _ for italic. No Markdown headings (#).
- Include amounts with "OMR" suffix.
- When updating rent, search for the tenant first, get their lease ID, then use update_lease_rent.
- When cancelling an invoice, search for the tenant and their invoices first, then cancel the right one.
- NEVER say "I don't have a function for that" — you have tools for everything listed above.
- CRITICAL — DUPLICATE EXPENSES: If add_expense returns { requires_confirmation: true, reason: "possible_duplicate" }, do NOT record anything yet. Tell the user a matching expense already exists (quote its amount/category/date from existing_expenses) and ask whether this is a genuinely separate expense or one you already recorded. If it is the SAME expense, do NOT re-record — and if a duplicate is already in the ledger, call delete_expense to remove the extra copy. Only call add_expense again with confirm_duplicate=true if the user confirms it is a separate, legitimate expense. NEVER set confirm_duplicate=true just to clear the warning.
- CRITICAL — DUPLICATE SETTLEMENTS: If record_owner_settlement returns { requires_confirmation: true, reason: "possible_duplicate" }, do NOT record anything yet. Tell the user a matching settlement already exists (quote its amount/date/direction from existing_settlements) and ask whether this is a genuinely separate payment or a duplicate. If they say it is the SAME payment recorded twice, do NOT re-record — instead call delete_owner_settlement to remove the extra copy. Only call record_owner_settlement again with confirm_duplicate=true if they confirm it is a separate, legitimate payment.
- When the user reports that a settlement / "paid to owner" entry was recorded twice or by mistake, you CAN fix it directly: find the settlement (list_recent_owner_activity gives settlement_id) and call delete_owner_settlement. Never tell the user you have no tool to delete or reverse a settlement, and never propose recording an opposite-direction settlement as a workaround — deleting the duplicate is the correct fix.
- NEVER say "there are no invoices" without first calling the tool with the right filters. If the user asks about a specific month (e.g. "April"), use the month parameter (e.g. "2026-04") in get_overdue_summary or get_tenant_invoices.
- When the user asks about invoices for a specific month, ALWAYS pass the month parameter in YYYY-MM format to filter results. Do NOT just scan through all results — use the filter.
- CRITICAL — UNIT NUMBER LOOKUPS: Whenever the user mentions a unit number (e.g. "unit 27", "unit 66", "send me unit 28 invoices", "tenant in unit 5 paid"), you MUST call get_unit_by_number FIRST. Do NOT use search_tenants, get_property_units, or any other tool to figure out who lives in a unit — only get_unit_by_number is authoritative. NEVER reuse a tenant name from earlier in the conversation for a different unit number; always re-look it up. After get_unit_by_number returns, copy the tenant.full_name and unit.unit_number EXACTLY from the tool response — never substitute, abbreviate, or invent.
- CRITICAL — RECORDING PAYMENT FOR A UNIT: When the user says "they paid", "tenant paid", "record payment" in the context of a unit number, you MUST: (1) call get_unit_by_number with that exact unit_number, (2) take an invoice_id from the unpaid_invoices array in the response, (3) call mark_invoice_paid with that invoice_id AND the payment method. Do NOT skip step 1. Do NOT make up a payment confirmation without actually calling mark_invoice_paid and seeing { success: true } in its response. If mark_invoice_paid returns an error or you skipped it, tell the user honestly that you could not record the payment.
- CRITICAL — PAYMENT METHOD: ALWAYS ask the user how the payment was made — cash, bank transfer, or cheque — UNLESS they already said it ("Ahmad paid 280 cash", "transfer for unit 27", "cheque from Fatma"). Cheque payments go direct to the owner (don't enter the company balance) while cash and bank transfer enter the company account, so misclassifying them corrupts the owner ledger. Never default to cash. If the method isn't clear, reply with a short question like: "How was the payment made — cash, bank transfer, or cheque?" and wait for the answer before calling mark_invoice_paid.
- CRITICAL: When the user asks about invoices for a PROPERTY or BUILDING (e.g. "invoices for Bousher Ameen Mosque"), first use search_properties to find the property_id, then call get_property_invoices ONCE with that property_id. NEVER loop through tenants individually with get_tenant_invoices — that will time out. get_property_invoices returns ALL invoices for the property in one call. For date ranges like "Jan to April", use start_date="2026-01-01" and end_date="2026-04-30".
- CRITICAL: When creating invoices for MULTIPLE tenants or a whole property (e.g. "create May invoices", "generate invoices for May and June for all tenants"), use create_invoices_batch with the property_id and the months array. NEVER call create_invoice individually for each tenant — use the batch tool. It handles lease/unit resolution automatically and skips duplicates.
- If genuinely unsure what the user wants, ask a SHORT clarifying question.
- You have CONVERSATION HISTORY. When the user says "yes", "ok", "do it", "go ahead", etc., refer back to what you previously offered or discussed and take that action.
- CRITICAL: NEVER guess or assume invoice statuses, amounts, or dates from conversation history. ALWAYS call the appropriate tool to get LIVE data from the database for ANY query about invoices, balances, or statuses. Conversation history is for understanding context only — actual data MUST come from tool calls.
- CRITICAL — NO HALLUCINATION: When listing invoices, tenants, or units from a tool result, you MUST copy unit numbers, tenant names, amounts and dates EXACTLY as they appear in the tool response. NEVER invent, guess, or extrapolate unit numbers (e.g. do not assume a sequence like 39, 49, 59). If a tool returns a "formatted_list" field, quote lines from it verbatim. If a value is missing in the tool response, say "N/A" — do NOT fill it in with a plausible number. NEVER carry a tenant name from a previous unit lookup over to a new unit number — every unit lookup is independent.
- CRITICAL — NEVER FABRICATE SUCCESS: Only claim a payment was "recorded", an invoice was "created", or rent was "updated" AFTER the corresponding mutation tool (mark_invoice_paid, create_invoice, update_lease_rent, etc.) returned { success: true } in its tool result. If you have not received that confirmation, do NOT post a "✅ Payment Recorded" style message.
- When checking a status, balance, or summary: ALWAYS call the tool first, then report what the tool returned. NEVER rely on what was said earlier in the conversation.
- CRITICAL — ALWAYS REPLY WITH TEXT: After your final tool call, you MUST emit a short text answer for the user (e.g. "Done — 280 OMR recorded for unit 34 (Moza)"). Never end the turn with only tool_use blocks and no text. The user is on WhatsApp and only sees text.`;

  // Prompt caching: the system prompt is large and stable for the duration of
  // a conversation, yet the agent loop re-sends it on every Claude call (up to
  // 25 per message). Wrapping it in a cached content block makes repeat reads
  // ~10% of the input cost. The cache lives ~5 min, so it also spans the
  // user's follow-up messages. (The dynamic name/date only change daily or
  // per-user, so the cache prefix stays stable in practice.)
  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: systemPrompt,
      cache_control: { type: "ephemeral" },
    },
  ];

  // Build messages: trimmed conversation history + the current user message
  // appended explicitly. We can't rely on the freshly-saved row showing up
  // in loadConversationHistory() because of read-after-write timing on
  // Supabase replicas, and because the alternation/limit logic could drop
  // it. Appending here also guarantees the last message is always the
  // current user prompt — required by the Anthropic API.
  const trimmedMessage = message.trim();
  const messages: Anthropic.MessageParam[] = conversationHistory.filter(
    (m, idx, arr) => {
      // Drop any trailing user echo that matches the current message; we'll
      // add it back explicitly below.
      if (idx === arr.length - 1 && m.role === "user") {
        const content =
          typeof m.content === "string" ? m.content.trim() : "";
        return content !== trimmedMessage;
      }
      return true;
    }
  );
  // When the inbound WhatsApp message included a photo and we got the bytes
  // back from the webhook, hand them to Claude as a vision block alongside
  // the caption text. That lets the model read the receipt itself (amount,
  // vendor, date) instead of having to guess from a vague caption like
  // "[image attached]".
  const includeImage =
    !!inlineImage && CLAUDE_VISION_MIME_TYPES.has(inlineImage.mimeType);
  const currentUserContent: Anthropic.MessageParam["content"] = includeImage
    ? [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: inlineImage!.mimeType as
              | "image/jpeg"
              | "image/png"
              | "image/gif"
              | "image/webp",
            data: inlineImage!.base64,
          },
        },
        { type: "text", text: trimmedMessage },
      ]
    : trimmedMessage;

  // If the last history entry is now an assistant turn (good), append current
  // user message. If the last is a user turn (someone else's message that
  // wasn't us), still append — Anthropic accepts adjacent same-role turns
  // by merging, but to be safe we replace it.
  if (
    messages.length > 0 &&
    messages[messages.length - 1].role === "user"
  ) {
    messages[messages.length - 1] = { role: "user", content: currentUserContent };
  } else {
    messages.push({ role: "user", content: currentUserContent });
  }

  let response: Anthropic.Message;
  let iterations = 0;
  const maxIterations = 25;

  try {
    response = await callClaude({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: systemBlocks,
      tools,
      messages,
    });

    // Agent loop — keep processing tool calls until we get a final text response
    while (
      response.stop_reason === "tool_use" &&
      iterations < maxIterations
    ) {
      iterations++;
      const assistantContent = response.content;
      messages.push({ role: "assistant", content: assistantContent });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of assistantContent) {
        if (block.type === "tool_use") {
          console.log(
            `[WhatsApp Agent] Tool call: ${block.name}`,
            JSON.stringify(block.input)
          );
          // Isolate each tool: a handled failure already comes back as error
          // JSON, but an UNEXPECTED throw (e.g. a Supabase outage) would
          // otherwise bubble up and abort the whole turn with a generic
          // fallback. Catching it here lets the model see the failure as a
          // tool_result and recover / explain instead.
          let result: string;
          try {
            result = await executeTool(
              block.name,
              block.input as Record<string, unknown>,
              user.id
            );
          } catch (toolErr) {
            console.error(
              `[WhatsApp Agent] Tool "${block.name}" threw`,
              toolErr instanceof Error ? toolErr.message : String(toolErr)
            );
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: JSON.stringify({
                error:
                  "That action failed unexpectedly. Tell the user briefly and suggest they try again in a moment.",
              }),
            });
            continue;
          }
          console.log(
            `[WhatsApp Agent] Tool result: ${result.substring(0, 200)}`
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });

      response = await callClaude({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        system: systemBlocks,
        tools,
        messages,
      });
    }
  } catch (err) {
    console.error("[WhatsApp Agent] Agent loop failed", {
      iterations,
      message_count: messages.length,
      error: err instanceof Error ? err.message : String(err),
    });
    const fallback =
      "Sorry — I hit a snag processing that. Please try again in a moment.";
    return fallback;
  }

  // Extract the final text response
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  let reply = textBlocks.map((block) => block.text).join("\n").trim();

  // If the model returned no text (e.g. ended with only tool_use blocks or
  // hit max_iterations), nudge it once for an explicit text answer instead of
  // silently replying "Done!". The previous fallback caused the model to
  // mimic that pattern in subsequent turns.
  if (!reply && response.stop_reason !== "tool_use") {
    console.warn(
      "[WhatsApp Agent] Empty final response from model — requesting explicit text reply",
      { stop_reason: response.stop_reason, iterations }
    );
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content:
        "Please reply to my last request in plain text. Summarise what you did or what you found. Do not call any more tools.",
    });
    try {
      const followUp = await callClaude({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: systemBlocks,
        // Disable tools on the retry so we are guaranteed a text answer.
        messages,
      });
      reply = followUp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    } catch (err) {
      console.error("[WhatsApp Agent] Follow-up text request failed", err);
    }
  }

  if (!reply) {
    reply =
      "Sorry — I couldn't finish that request. Please try again or rephrase it.";
  }

  // Convert any leftover Markdown-style bold (**text**) to WhatsApp's
  // single-asterisk bold so the user doesn't see literal stars around
  // labels. The system prompt forbids ** but defends against the model
  // slipping back into Markdown habits.
  reply = reply.replace(/\*\*([^*\n]+?)\*\*/g, "*$1*");

  // 5. Save agent reply to conversation history (skip generic fallbacks so
  // they don't pollute future context and condition the model into repeating
  // them).
  if (!isStaleAssistantReply(reply)) {
    await saveConversationMessage(cleanPhone, "assistant", reply);
  }

  return reply;
}
