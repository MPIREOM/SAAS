import Anthropic from "@anthropic-ai/sdk";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

const anthropic = new Anthropic();

// Use service role key for webhook context (no cookie-based auth)
function getAdminSupabase() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
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
      "Get invoices for a tenant. Can filter by status. Returns invoice id, amount, due date, status, paid amount, period, and unit/property info.",
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
      "Add a new expense record to a property. For tracking costs like maintenance, utilities, insurance, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        property_id: {
          type: "string",
          description: "The property UUID",
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
      },
      required: ["property_id", "category", "amount"],
    },
  },
  {
    name: "get_overdue_summary",
    description:
      "Get a summary of all overdue invoices across all properties. Shows which tenants owe money and how much.",
    input_schema: {
      type: "object" as const,
      properties: {},
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
      let query = supabase
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
            const unit = l.units as Record<string, unknown> | null;
            const prop = unit?.properties as Record<string, unknown> | null;
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
      const limit = (input.limit as number) || 10;

      let query = supabase
        .from("invoices")
        .select(
          `
          id, amount, paid_amount, due_date, status, period_start, period_end, lease_id, notes,
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
            is_active,
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

      const payload: Record<string, unknown> = {
        property_id: input.property_id,
        category: input.category,
        amount: input.amount,
        expense_date: expenseDate,
        created_by: userId,
      };

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

      return JSON.stringify({
        success: true,
        expense_id: expense?.id,
        amount: input.amount,
        category: input.category,
        description: input.description || null,
        date: expenseDate,
      });
    }

    case "get_overdue_summary": {
      const { data: overdueInvoices, error } = await supabase
        .from("invoices")
        .select(
          `
          id, amount, paid_amount, due_date, status,
          tenants(full_name, phone),
          units(unit_number, properties(name))
        `
        )
        .in("status", ["overdue", "partial"])
        .order("due_date", { ascending: true });

      if (error) return JSON.stringify({ error: error.message });
      if (!overdueInvoices || overdueInvoices.length === 0)
        return JSON.stringify({ message: "No overdue invoices! Everything is up to date." });

      let totalOverdue = 0;
      const summary = overdueInvoices.map((inv: Record<string, unknown>) => {
        const amount = Number(inv.amount || 0);
        const paid = Number(inv.paid_amount || 0);
        const owing = amount - paid;
        totalOverdue += owing;
        const tenant = inv.tenants as Record<string, unknown> | null;
        const unit = inv.units as Record<string, unknown> | null;
        const prop = (unit as Record<string, unknown> | null)?.properties as Record<string, unknown> | null;
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

      // Invoices due today
      const { data: dueToday } = await supabase
        .from("invoices")
        .select("id, amount, tenants(full_name)")
        .eq("due_date", today)
        .in("status", ["pending"]);

      // Overdue invoices
      const { data: overdue } = await supabase
        .from("invoices")
        .select("id, amount, paid_amount")
        .in("status", ["overdue"]);

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

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
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
    return "Sorry, your phone number is not registered as an admin. Please register your WhatsApp number in the system settings first.";
  }

  // 2. Run the Claude agent loop
  const today = new Date().toISOString().split("T")[0];
  const systemPrompt = `You are MPIRE Assistant, an intelligent WhatsApp property management agent for ${user.full_name}. You are helpful, proactive, and take action.

TODAY: ${today}
CURRENCY: OMR (Omani Rial)

YOU CAN:
1. Record payments — "Ahmad paid", "register payment for Fatma", "tenant in unit 101 paid 200 OMR"
2. Add expenses — "add expense 50 OMR plumbing at Sunset Tower", "electricity bill 30 OMR"
3. Create invoices — "create invoice for Ahmad for April", "generate rent invoice"
4. Check balances — "how much does Ahmad owe?", "check balance for unit 101"
5. View overdue — "who hasn't paid?", "show overdue invoices"
6. Today's summary — "what's happening today?", "daily summary"
7. List tenants — "show all tenants", "who lives in Sunset Tower?"
8. View property info — "show units in Tower A", "list properties"

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
- NEVER say "I don't have a function for that" — you have tools for everything listed above.
- If genuinely unsure what the user wants, ask a SHORT clarifying question.`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: message },
  ];

  let response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    tools,
    messages,
  });

  // Agent loop — keep processing tool calls until we get a final text response
  let iterations = 0;
  const maxIterations = 10;
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

    response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    });
  }

  // Extract the final text response
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  return textBlocks.map((block) => block.text).join("\n") || "Done!";
}
