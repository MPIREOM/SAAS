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

// ── Types ─────────────────────────────────────────────────────────────────

interface AgentAction {
  type: "mark_invoice_paid" | "add_expense" | "unknown";
  data: Record<string, unknown>;
  confirmation: string;
}

// ── Tool definitions for Claude ───────────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: "search_tenants",
    description:
      "Search for tenants by name (partial match). Returns tenant id, full name, phone, and their active lease/unit/property info.",
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
    name: "get_tenant_pending_invoices",
    description:
      "Get all pending/overdue invoices for a tenant. Returns invoice id, amount, due date, status, paid amount, and unit/property info.",
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
      "Mark an invoice as paid. Creates a payment record and updates the invoice status. Use 'full' for full payment or provide a specific amount for partial.",
    input_schema: {
      type: "object" as const,
      properties: {
        invoice_id: {
          type: "string",
          description: "The invoice UUID to mark as paid",
        },
        amount: {
          type: "number",
          description:
            "Payment amount. If omitted or equal to remaining, marks as fully paid.",
        },
        method: {
          type: "string",
          enum: ["cash", "bank_transfer", "cheque"],
          description: "Payment method. Defaults to cash.",
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
    name: "search_properties",
    description:
      "Search for properties by name (partial match). Returns property id, name, and location.",
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
    name: "add_expense",
    description:
      "Add a new expense to the system. Requires property_id, category, amount, and expense_date.",
    input_schema: {
      type: "object" as const,
      properties: {
        property_id: {
          type: "string",
          description: "The property UUID",
        },
        unit_id: {
          type: "string",
          description: "Optional unit UUID",
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
          description: "Expense category",
        },
        description: {
          type: "string",
          description: "Description of the expense",
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
          description: "Vendor name",
        },
      },
      required: ["property_id", "category", "amount"],
    },
  },
  {
    name: "list_properties",
    description:
      "List all properties the user has access to. Use this when the user mentions a property but you need to find it.",
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
          leases!inner(
            id, is_active, monthly_rent,
            units!inner(
              id, unit_number,
              properties!inner(id, name)
            )
          )
        `
        )
        .ilike("full_name", `%${name}%`)
        .eq("status", "active")
        .limit(5);

      if (error) return JSON.stringify({ error: error.message });
      if (!tenants || tenants.length === 0)
        return JSON.stringify({
          message: `No active tenants found matching "${name}"`,
        });

      return JSON.stringify(
        tenants.map((t) => ({
          id: t.id,
          full_name: t.full_name,
          phone: t.phone,
          leases: (t.leases as Record<string, unknown>[]).filter(
            (l: Record<string, unknown>) => l.is_active
          ),
        }))
      );
    }

    case "get_tenant_pending_invoices": {
      const tenantId = input.tenant_id as string;
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select(
          `
          id, amount, paid_amount, due_date, status, period_start, period_end, lease_id,
          units!inner(unit_number, properties!inner(name))
        `
        )
        .eq("tenant_id", tenantId)
        .in("status", ["pending", "overdue", "partial"])
        .order("due_date", { ascending: true });

      if (error) return JSON.stringify({ error: error.message });
      if (!invoices || invoices.length === 0)
        return JSON.stringify({
          message: "No pending or overdue invoices found for this tenant",
        });

      return JSON.stringify(invoices);
    }

    case "mark_invoice_paid": {
      const invoiceId = input.invoice_id as string;
      const method = (input.method as string) || "cash";
      const notes = (input.notes as string) || "Paid via WhatsApp agent";

      // Fetch invoice details
      const { data: invoice, error: fetchError } = await supabase
        .from("invoices")
        .select("id, lease_id, tenant_id, unit_id, amount, paid_amount, status")
        .eq("id", invoiceId)
        .single();

      if (fetchError || !invoice)
        return JSON.stringify({ error: "Invoice not found" });

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
      const paidDate = new Date().toISOString().split("T")[0];

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
          warning: "Invoice updated but payment record failed: " + paymentError.message,
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

      return JSON.stringify({
        success: true,
        invoice_id: invoiceId,
        payment_amount: paymentAmount,
        new_status: isFullyPaid ? "paid" : "partial",
        remaining: isFullyPaid ? 0 : invoiceTotal - newPaidAmount,
      });
    }

    case "search_properties": {
      const name = input.name as string;
      const { data: properties, error } = await supabase
        .from("properties")
        .select("id, name, location")
        .ilike("name", `%${name}%`)
        .eq("is_archived", false)
        .limit(5);

      if (error) return JSON.stringify({ error: error.message });
      if (!properties || properties.length === 0)
        return JSON.stringify({
          message: `No properties found matching "${name}"`,
        });

      return JSON.stringify(properties);
    }

    case "list_properties": {
      const { data: properties, error } = await supabase
        .from("properties")
        .select("id, name, location")
        .eq("is_archived", false)
        .order("name");

      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify(properties || []);
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

      // Audit log
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
        date: expenseDate,
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
  const systemPrompt = `You are MPIRE Assistant, a WhatsApp-based property management agent. You help property managers manage their system via WhatsApp messages.

You can perform these actions:
1. **Mark invoices as paid** — When the user says a tenant has paid, search for the tenant, find their pending invoices, and mark them as paid.
2. **Add expenses** — When the user wants to record an expense, search for the property and create the expense.

Important rules:
- Today's date is ${today}. Use this for default dates.
- Currency is OMR (Omani Rial).
- Always search for tenants/properties first before taking action.
- If multiple matches are found, ask the user to clarify.
- If the tenant has multiple pending invoices, ask which one to mark as paid (unless the user specifies).
- Be concise — this is WhatsApp, keep replies short and clear.
- Always confirm what you did after completing an action.
- If you can't understand the request, politely ask for clarification.
- Never make up data. Only use data from tool results.
- The user's name is ${user.full_name}.`;

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
  while (response.stop_reason === "tool_use") {
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of assistantContent) {
      if (block.type === "tool_use") {
        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          user.id
        );
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
    (block) => block.type === "text"
  );
  return textBlocks.map((block) => {
    if (block.type === "text") return block.text;
    return "";
  }).join("\n") || "Done! Action completed.";
}
