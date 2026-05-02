import Anthropic from "@anthropic-ai/sdk";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { getOwnerBalance, getDefaultOwnerBalance } from "@/lib/owners/balance";

const anthropic = new Anthropic();

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

// Use service role key for webhook context (no cookie-based auth)
function getAdminSupabase() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Retry wrapper for Claude API calls with exponential backoff
async function callClaude(
  params: Anthropic.MessageCreateParamsNonStreaming
): Promise<Anthropic.Message> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await anthropic.messages.create(params);
    } catch (error: unknown) {
      const isRateLimit =
        error instanceof Error &&
        (error.message.includes("429") || error.message.includes("rate_limit"));
      if (isRateLimit && attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(
          `[WhatsApp Agent] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
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
      "Get invoices for a tenant. Can filter by status and/or month. Returns invoice id, amount, due date, status, paid amount, period, and unit/property info.",
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
      "Record a payment against an invoice. Updates the invoice status and creates a payment record. Can do full or partial payments.",
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
          description: "Payment method. Defaults to cash if not specified.",
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
      },
      required: ["category", "amount"],
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
      },
      required: ["direction", "amount"],
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

      return JSON.stringify(invoices);
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
      const method = (input.method as string) || "cash";
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
        propertyIds.length > 0
          ? supabase
              .from("expenses")
              .select("amount, category, description, expense_date, property_id, vendor")
              .in("property_id", propertyIds)
              .gte("expense_date", since)
              .order("expense_date", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("owner_settlements")
          .select("amount, direction, method, settled_at")
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
        date: e.expense_date,
        property: propertyNameById.get(e.property_id as string) || "?",
        category: e.category,
        amount: Number(e.amount || 0),
        vendor: e.vendor || null,
        description: e.description || null,
      }));
      const settlements = (settlementsRes.data || []).map(
        (s: Record<string, unknown>) => ({
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

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
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

const MAX_HISTORY_MESSAGES = 20; // Last 20 messages (10 exchanges)
const HISTORY_WINDOW_MINUTES = 60; // Only load messages from last hour

async function loadConversationHistory(
  phone: string
): Promise<Anthropic.MessageParam[]> {
  const supabase = getAdminSupabase();
  const cutoff = new Date(Date.now() - HISTORY_WINDOW_MINUTES * 60 * 1000).toISOString();

  const { data: history } = await supabase
    .from("whatsapp_conversations")
    .select("role, message")
    .eq("user_phone", phone)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(MAX_HISTORY_MESSAGES);

  if (!history || history.length === 0) return [];

  // Convert to Claude message format, ensuring alternating user/assistant
  const messages: Anthropic.MessageParam[] = [];
  for (const entry of history) {
    const role = entry.role as "user" | "assistant";
    // Ensure messages alternate properly
    if (messages.length > 0 && messages[messages.length - 1].role === role) {
      // Same role twice — skip to maintain alternation
      continue;
    }
    messages.push({ role, content: entry.message });
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

export async function processWhatsAppMessage(
  message: string,
  senderPhone: string
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
   - If the user attached a photo (look for "PENDING_RECEIPT_TOKEN: <token>" in their message), pass that token as attachment_token to add_expense so the receipt is saved with the expense.
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
    - Use list_recent_owner_activity when the user wants to see recent rent / expenses / settlements feeding the balance.

BEHAVIOR RULES:
- ALWAYS take action. When the user says "register payment" or "add payment" or "tenant paid", search for the tenant and their unpaid invoices, then mark the invoice as paid. Do NOT say you can't do it.
- "Register payment", "add payment", "record payment", "tenant paid" ALL mean the same thing: mark their invoice as paid using mark_invoice_paid.
- When the user mentions a tenant name, ALWAYS search for them first.
- If a tenant has exactly ONE unpaid invoice, just pay it without asking.
- If a tenant has MULTIPLE unpaid invoices, ask which one (show the list with dates and amounts).
- If no unpaid invoices exist, tell the user and offer to create one.
- When adding expenses, search for the property first, then pick the best category from context.
- Be concise — this is WhatsApp. Use short confirmations with key details.
- Use bullet points and line breaks for readability.
- Include amounts with "OMR" suffix.
- When updating rent, search for the tenant first, get their lease ID, then use update_lease_rent.
- When cancelling an invoice, search for the tenant and their invoices first, then cancel the right one.
- NEVER say "I don't have a function for that" — you have tools for everything listed above.
- NEVER say "there are no invoices" without first calling the tool with the right filters. If the user asks about a specific month (e.g. "April"), use the month parameter (e.g. "2026-04") in get_overdue_summary or get_tenant_invoices.
- When the user asks about invoices for a specific month, ALWAYS pass the month parameter in YYYY-MM format to filter results. Do NOT just scan through all results — use the filter.
- CRITICAL: When the user asks about invoices for a PROPERTY or BUILDING (e.g. "invoices for Bousher Ameen Mosque"), first use search_properties to find the property_id, then call get_property_invoices ONCE with that property_id. NEVER loop through tenants individually with get_tenant_invoices — that will time out. get_property_invoices returns ALL invoices for the property in one call. For date ranges like "Jan to April", use start_date="2026-01-01" and end_date="2026-04-30".
- CRITICAL: When creating invoices for MULTIPLE tenants or a whole property (e.g. "create May invoices", "generate invoices for May and June for all tenants"), use create_invoices_batch with the property_id and the months array. NEVER call create_invoice individually for each tenant — use the batch tool. It handles lease/unit resolution automatically and skips duplicates.
- If genuinely unsure what the user wants, ask a SHORT clarifying question.
- You have CONVERSATION HISTORY. When the user says "yes", "ok", "do it", "go ahead", etc., refer back to what you previously offered or discussed and take that action.
- CRITICAL: NEVER guess or assume invoice statuses, amounts, or dates from conversation history. ALWAYS call the appropriate tool to get LIVE data from the database for ANY query about invoices, balances, or statuses. Conversation history is for understanding context only — actual data MUST come from tool calls.
- CRITICAL — NO HALLUCINATION: When listing invoices, tenants, or units from a tool result, you MUST copy unit numbers, tenant names, amounts and dates EXACTLY as they appear in the tool response. NEVER invent, guess, or extrapolate unit numbers (e.g. do not assume a sequence like 39, 49, 59). If a tool returns a "formatted_list" field, quote lines from it verbatim. If a value is missing in the tool response, say "N/A" — do NOT fill it in with a plausible number.
- When checking a status, balance, or summary: ALWAYS call the tool first, then report what the tool returned. NEVER rely on what was said earlier in the conversation.`;

  // Build messages: conversation history + current message
  // The current message is already the last entry in history, so use history directly
  const messages: Anthropic.MessageParam[] = [...conversationHistory];

  // If history is empty or doesn't end with current message, add it
  if (messages.length === 0) {
    messages.push({ role: "user", content: message });
  }

  let response = await callClaude({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    tools,
    messages,
  });

  // Agent loop — keep processing tool calls until we get a final text response
  let iterations = 0;
  const maxIterations = 25;
  while (response.stop_reason === "tool_use" && iterations < maxIterations) {
    iterations++;
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of assistantContent) {
      if (block.type === "tool_use") {
        console.log(`[WhatsApp Agent] Tool call: ${block.name}`, JSON.stringify(block.input));
        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          user.id
        );
        console.log(`[WhatsApp Agent] Tool result: ${result.substring(0, 200)}`);
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
      system: systemPrompt,
      tools,
      messages,
    });
  }

  // Extract the final text response
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  const reply = textBlocks.map((block) => block.text).join("\n") || "Done!";

  // 5. Save agent reply to conversation history
  await saveConversationMessage(cleanPhone, "assistant", reply);

  return reply;
}
