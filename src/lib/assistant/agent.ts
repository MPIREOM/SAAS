import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import {
  tools as whatsappTools,
  executeTool as executeWhatsAppTool,
} from "@/lib/whatsapp/agent";

// Dashboard AI assistant (super_admin only). Reuses the WhatsApp agent's
// tools and their execution so both surfaces act on the data identically,
// adds generic read-only lookups across the system, and pauses for the
// user's explicit confirmation before any destructive tool runs.

const anthropic = new Anthropic({ maxRetries: 2, timeout: 120_000 });

const CLAUDE_MODEL = "claude-opus-5";
const MAX_TOKENS = 16000;
const MAX_ITERATIONS = 20;
const MAX_HISTORY_ROWS = 60;
const MAX_TOOL_RESULT_CHARS = 40_000;

function getAdminSupabase() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Tools ─────────────────────────────────────────────────────────────────

/**
 * Tools that change or remove existing records. The agent loop stops before
 * running these and waits for the user to approve them in the chat panel.
 */
export const CONFIRM_REQUIRED_TOOLS = new Set([
  "delete_expense",
  "delete_owner_settlement",
  "cancel_invoice",
  "revert_invoice_to_unpaid",
  "move_out_tenant",
  "renew_lease",
  "update_lease",
  "update_lease_rent",
  "update_invoice",
  "update_tenant",
  "update_payment_method",
]);

// WhatsApp-only tools that depend on a photo sent through WhatsApp.
const EXCLUDED_WHATSAPP_TOOLS = new Set(["attach_tenant_document"]);

/** Tables the generic read tools may query. Token/secret tables are excluded. */
const READABLE_TABLES = new Set([
  "tenants",
  "leases",
  "units",
  "properties",
  "invoices",
  "invoice_items",
  "payments",
  "cheques",
  "expenses",
  "expense_attachments",
  "maintenance_requests",
  "maintenance_notes",
  "maintenance_attachments",
  "documents",
  "owners",
  "owner_settlements",
  "owner_business_fees",
  "reminder_logs",
  "reminder_settings",
  "notification_templates",
  "invoice_settings",
  "e_mandates",
  "e_mandate_collections",
  "users",
  "user_property_assignments",
  "audit_log",
  "cron_run_logs",
]);

const FILTER_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
] as const;
type FilterOperator = (typeof FILTER_OPERATORS)[number];

const dashboardOnlyTools: Anthropic.Tool[] = [
  {
    name: "describe_table",
    description:
      "Return the column names of a table (read from a sample row). Call this before query_records when you are not sure of a table's columns.",
    input_schema: {
      type: "object" as const,
      properties: {
        table: {
          type: "string",
          enum: [...READABLE_TABLES],
          description: "Table name.",
        },
      },
      required: ["table"],
    },
  },
  {
    name: "query_records",
    description:
      "Read-only search over any table in the system (tenants, leases, units, properties, invoices, payments, cheques, expenses, maintenance requests, documents, owners, reminders, e-mandates, users, audit log…). Supports filters, related-table embedding via PostgREST select syntax (e.g. \"id, full_name, leases(id, monthly_rent, units(unit_number))\"), ordering and counts. Use it for any question the specialised tools don't cover. It never modifies data.",
    input_schema: {
      type: "object" as const,
      properties: {
        table: {
          type: "string",
          enum: [...READABLE_TABLES],
          description: "Table to query.",
        },
        select: {
          type: "string",
          description:
            "PostgREST select list. Defaults to \"*\". Embedded tables must also be readable tables.",
        },
        filters: {
          type: "array",
          description: "Filters combined with AND.",
          items: {
            type: "object",
            properties: {
              column: {
                type: "string",
                description:
                  "Column name; use table.column to filter on an embedded table.",
              },
              operator: { type: "string", enum: [...FILTER_OPERATORS] },
              value: {
                description:
                  "Value to compare. For 'in' pass an array; for 'is' pass null, true or false; for like/ilike use % wildcards.",
              },
            },
            required: ["column", "operator", "value"],
          },
        },
        order_by: { type: "string", description: "Column to sort by." },
        ascending: {
          type: "boolean",
          description: "Sort direction. Default false (newest/highest first).",
        },
        limit: {
          type: "number",
          description: "Max rows to return (default 25, max 100).",
        },
        count_only: {
          type: "boolean",
          description: "Return only the number of matching rows.",
        },
      },
      required: ["table"],
    },
  },
];

function buildTools(): Anthropic.Tool[] {
  const reused: Anthropic.Tool[] = whatsappTools
    .filter((t) => !EXCLUDED_WHATSAPP_TOOLS.has(t.name))
    .map((t) => {
      // Drop the WhatsApp agent's cache breakpoint; ours goes on the last tool.
      const { cache_control: _unused, ...rest } = t;
      void _unused;
      return rest;
    });
  const all = [...reused, ...dashboardOnlyTools];
  all[all.length - 1] = {
    ...all[all.length - 1],
    cache_control: { type: "ephemeral" },
  };
  return all;
}

const TOOLS = buildTools();

function checkIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(value);
}

/** Every table referenced as an embed in a select list must be readable. */
function checkSelect(select: string): string | null {
  const embedded = select.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:![A-Za-z0-9_]+)?\s*\(/g);
  for (const match of embedded) {
    if (!READABLE_TABLES.has(match[1])) {
      return `Table "${match[1]}" cannot be embedded.`;
    }
  }
  return null;
}

async function queryRecords(input: Record<string, unknown>): Promise<string> {
  const table = String(input.table ?? "");
  if (!READABLE_TABLES.has(table)) {
    return JSON.stringify({ error: `Table "${table}" is not readable.` });
  }
  const select = typeof input.select === "string" && input.select.trim()
    ? input.select
    : "*";
  const selectError = checkSelect(select);
  if (selectError) return JSON.stringify({ error: selectError });

  const countOnly = input.count_only === true;
  const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 100);

  const supabase = getAdminSupabase();
  let query = supabase
    .from(table)
    .select(select, { count: "exact", head: countOnly });

  const filters = Array.isArray(input.filters) ? input.filters : [];
  for (const raw of filters) {
    const f = raw as { column?: unknown; operator?: unknown; value?: unknown };
    const column = String(f.column ?? "");
    const operator = String(f.operator ?? "") as FilterOperator;
    if (!checkIdentifier(column)) {
      return JSON.stringify({ error: `Invalid column "${column}".` });
    }
    if (!FILTER_OPERATORS.includes(operator)) {
      return JSON.stringify({ error: `Invalid operator "${operator}".` });
    }
    if (operator === "in") {
      if (!Array.isArray(f.value)) {
        return JSON.stringify({ error: "'in' needs an array value." });
      }
      query = query.in(column, f.value);
    } else if (operator === "is") {
      query = query.is(column, f.value as boolean | null);
    } else {
      query = query.filter(column, operator, f.value as string);
    }
  }

  if (typeof input.order_by === "string" && input.order_by) {
    if (!checkIdentifier(input.order_by)) {
      return JSON.stringify({ error: `Invalid order column "${input.order_by}".` });
    }
    query = query.order(input.order_by, { ascending: input.ascending === true });
  }

  const { data, error, count } = countOnly
    ? await query
    : await query.limit(limit);
  if (error) return JSON.stringify({ error: error.message });
  if (countOnly) return JSON.stringify({ count });
  return JSON.stringify({
    total_matching: count,
    returned: data?.length ?? 0,
    rows: data,
  });
}

async function describeTable(input: Record<string, unknown>): Promise<string> {
  const table = String(input.table ?? "");
  if (!READABLE_TABLES.has(table)) {
    return JSON.stringify({ error: `Table "${table}" is not readable.` });
  }
  const { data, error } = await getAdminSupabase()
    .from(table)
    .select("*")
    .limit(1);
  if (error) return JSON.stringify({ error: error.message });
  if (!data || data.length === 0) {
    return JSON.stringify({ table, columns: [], note: "Table is empty." });
  }
  return JSON.stringify({ table, columns: Object.keys(data[0]) });
}

async function runTool(
  name: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  if (name === "query_records") return queryRecords(input);
  if (name === "describe_table") return describeTable(input);
  if (EXCLUDED_WHATSAPP_TOOLS.has(name)) {
    return JSON.stringify({ error: `Tool "${name}" is not available here.` });
  }
  return executeWhatsAppTool(name, input, userId);
}

async function executeToolUse(
  block: Anthropic.ToolUseBlock,
  userId: string
): Promise<Anthropic.ToolResultBlockParam> {
  try {
    let result = await runTool(
      block.name,
      block.input as Record<string, unknown>,
      userId
    );
    if (result.length > MAX_TOOL_RESULT_CHARS) {
      result =
        result.slice(0, MAX_TOOL_RESULT_CHARS) +
        "\n…[truncated — narrow the query with filters or a smaller limit]";
    }
    return { type: "tool_result", tool_use_id: block.id, content: result };
  } catch (err) {
    console.error(
      `[Dashboard Assistant] Tool "${block.name}" threw`,
      err instanceof Error ? err.message : String(err)
    );
    return {
      type: "tool_result",
      tool_use_id: block.id,
      is_error: true,
      content: "That action failed unexpectedly. Tell the user briefly.",
    };
  }
}

// ── System prompt ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are MPIRE Assistant, the AI helper inside the MPIRE property-management dashboard. You are talking to a super admin who has full access to every property, tenant, lease, invoice, payment, cheque, expense, owner ledger, maintenance request, reminder and e-mandate in the system. Currency is OMR (Omani Rial).

WHAT YOU DO
- Answer questions about the business by looking up live data with your tools. Use the specialised tools (search_tenants, get_unit_by_number, get_tenant_invoices, get_property_invoices, get_overdue_summary, get_owner_balance, get_expenses_summary, …) when they fit; use query_records (with describe_table if unsure of columns) for anything else.
- Carry out changes the user asks for: record payments, create invoices, add expenses, register tenants, record owner settlements, update leases/tenants/invoices, renew leases, move tenants out, cancel or revert invoices, delete mistaken expenses or settlements.

RULES
- Never guess data. Every number, name, date and status you state must come from a tool result in this turn. Copy values exactly; say "N/A" when a value is missing.
- When a user mentions a unit number, call get_unit_by_number first. When they mention a tenant by name, call search_tenants first.
- Before recording a payment, know the payment method (cash, bank transfer or cheque). If the user didn't say, ask — never default to cash; cheques go directly to the owner and change the owner ledger.
- For invoices of a whole property or several tenants, use get_property_invoices / create_invoices_batch rather than looping per tenant.
- Some actions (deleting, cancelling, reverting, moving out, renewing, and updating existing records) require the user's confirmation. The dashboard shows them a Confirm / Cancel card automatically when you call those tools. Before calling one, write one short sentence saying exactly what you are about to change. If a tool result says the user declined, acknowledge it and do not retry unless they ask again.
- If a tool returns requires_confirmation / needs_confirmation (possible duplicate, several candidate payments), explain the situation and ask the user before retrying.
- Only claim something was done after its tool returned success.
- Photo uploads are not available in this chat; don't pass attachment or document tokens.
- If the request is ambiguous, ask one short clarifying question.

STYLE
- Reply in the language the user writes in (Arabic or English).
- Be concise. Use short paragraphs and "- " bullet lists; **bold** is allowed. No tables, no headings.
- Always finish with a text reply summarising what you found or did.`;

function omanToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Muscat",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function systemBlocks(ctx: TurnContext): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: `TODAY: ${omanToday()}\nUSER: ${ctx.userName ?? "Admin"}\nDASHBOARD LANGUAGE: ${ctx.locale === "ar" ? "Arabic" : "English"}`,
    },
  ];
}

// ── Persistence ───────────────────────────────────────────────────────────

export interface PendingToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
  requiresConfirmation: boolean;
}

export interface PendingAction {
  toolUses: PendingToolUse[];
}

export interface TurnContext {
  supabase: SupabaseClient;
  conversationId: string;
  userId: string;
  userName: string | null;
  locale: string;
}

interface MessageRow {
  id: number;
  role: "user" | "assistant";
  content: Anthropic.MessageParam["content"];
}

async function saveMessage(
  ctx: TurnContext,
  role: "user" | "assistant",
  content: Anthropic.MessageParam["content"]
) {
  const { error } = await ctx.supabase
    .from("assistant_messages")
    .insert({ conversation_id: ctx.conversationId, role, content });
  if (error) throw new Error(`Failed to save message: ${error.message}`);
}

async function touchConversation(
  ctx: TurnContext,
  fields: Record<string, unknown> = {}
) {
  await ctx.supabase
    .from("assistant_conversations")
    .update({ updated_at: new Date().toISOString(), ...fields })
    .eq("id", ctx.conversationId);
}

export async function loadMessageRows(
  supabase: SupabaseClient,
  conversationId: string
): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("assistant_messages")
    .select("id, role, content")
    .eq("conversation_id", conversationId)
    .order("id", { ascending: true });
  if (error) throw new Error(`Failed to load messages: ${error.message}`);
  return (data ?? []) as MessageRow[];
}

function isPlainUserMessage(row: MessageRow): boolean {
  return row.role === "user" && typeof row.content === "string";
}

/**
 * Most recent part of the transcript, starting on a plain user message so
 * no tool_result is sent without its matching tool_use.
 */
async function loadApiHistory(ctx: TurnContext): Promise<Anthropic.MessageParam[]> {
  const rows = await loadMessageRows(ctx.supabase, ctx.conversationId);
  let start = Math.max(0, rows.length - MAX_HISTORY_ROWS);
  while (start < rows.length && !isPlainUserMessage(rows[start])) start++;

  // Every tool_use must be answered by the next message. If a turn crashed
  // after saving a tool call but before its result, answer it with an error
  // so the conversation doesn't stay broken.
  const messages: Anthropic.MessageParam[] = [];
  const slice = rows.slice(start);
  slice.forEach((row, i) => {
    messages.push({ role: row.role, content: row.content });
    if (row.role !== "assistant" || !Array.isArray(row.content)) return;
    const next = slice[i + 1];
    const answered = new Set(
      next?.role === "user" && Array.isArray(next.content)
        ? next.content
            .filter((b): b is Anthropic.ToolResultBlockParam => b.type === "tool_result")
            .map((b) => b.tool_use_id)
        : []
    );
    const orphans = row.content.filter(
      (b): b is Anthropic.ToolUseBlockParam =>
        b.type === "tool_use" && !answered.has(b.id)
    );
    if (orphans.length > 0 && next) {
      messages.push({
        role: "user",
        content: orphans.map((b) => ({
          type: "tool_result" as const,
          tool_use_id: b.id,
          is_error: true,
          content: "This call was interrupted and did not run.",
        })),
      });
    }
  });
  return messages;
}

// ── Agent loop ────────────────────────────────────────────────────────────

/**
 * Runs Claude until it gives a final answer or asks to run a tool that
 * needs confirmation (then stores the pending calls on the conversation).
 */
async function runLoop(ctx: TurnContext): Promise<void> {
  const messages = await loadApiHistory(ctx);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: systemBlocks(ctx),
      tools: TOOLS,
      messages,
    });

    if (response.content.length > 0) {
      messages.push({ role: "assistant", content: response.content });
      await saveMessage(ctx, "assistant", response.content);
    }

    if (response.stop_reason !== "tool_use") return;

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUses.some((b) => CONFIRM_REQUIRED_TOOLS.has(b.name))) {
      const pending: PendingAction = {
        toolUses: toolUses.map((b) => ({
          id: b.id,
          name: b.name,
          input: b.input as Record<string, unknown>,
          requiresConfirmation: CONFIRM_REQUIRED_TOOLS.has(b.name),
        })),
      };
      await touchConversation(ctx, { pending_action: pending });
      return;
    }

    const results = await Promise.all(
      toolUses.map((b) => executeToolUse(b, ctx.userId))
    );
    messages.push({ role: "user", content: results });
    await saveMessage(ctx, "user", results);
  }

  // Iteration cap reached with tool calls still outstanding: close them out
  // so the stored transcript stays valid for the next turn.
  const last = messages[messages.length - 1];
  if (last?.role === "assistant" && Array.isArray(last.content)) {
    const open = last.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (open.length > 0) {
      await saveMessage(
        ctx,
        "user",
        open.map((b) => ({
          type: "tool_result" as const,
          tool_use_id: b.id,
          is_error: true,
          content: "Step limit reached; this call was not run.",
        }))
      );
    }
  }
}

/**
 * Claims the pending action atomically (so a double click can't run it
 * twice) and returns it, or null when nothing was pending.
 */
async function takePendingAction(ctx: TurnContext): Promise<PendingAction | null> {
  const { data: row } = await ctx.supabase
    .from("assistant_conversations")
    .select("pending_action, updated_at")
    .eq("id", ctx.conversationId)
    .single();
  if (!row?.pending_action) return null;

  // Only the request whose update matches the snapshot it read wins.
  const { data: claimed } = await ctx.supabase
    .from("assistant_conversations")
    .update({ pending_action: null, updated_at: new Date().toISOString() })
    .eq("id", ctx.conversationId)
    .eq("updated_at", row.updated_at)
    .not("pending_action", "is", null)
    .select("id");
  if (!claimed || claimed.length === 0) return null;
  return row.pending_action as PendingAction;
}

async function resolvePending(
  ctx: TurnContext,
  pending: PendingAction,
  approved: boolean,
  declineReason: string
) {
  const results = await Promise.all(
    pending.toolUses.map((t) => {
      if (t.requiresConfirmation && !approved) {
        return Promise.resolve<Anthropic.ToolResultBlockParam>({
          type: "tool_result",
          tool_use_id: t.id,
          is_error: true,
          content: declineReason,
        });
      }
      return executeToolUse(
        { type: "tool_use", id: t.id, name: t.name, input: t.input } as Anthropic.ToolUseBlock,
        ctx.userId
      );
    })
  );
  await saveMessage(ctx, "user", results);
}

/** Handles a new message typed by the user. */
export async function sendUserMessage(ctx: TurnContext, text: string) {
  const pending = await takePendingAction(ctx);
  if (pending) {
    await resolvePending(
      ctx,
      pending,
      false,
      "Not run: the user sent a new message instead of confirming. Do not retry unless they ask."
    );
  }
  await saveMessage(ctx, "user", text);
  await touchConversation(ctx);
  await runLoop(ctx);
}

/** Handles the user approving or declining the pending action. */
export async function confirmPendingAction(ctx: TurnContext, approved: boolean) {
  const pending = await takePendingAction(ctx);
  if (!pending) return false;
  await resolvePending(
    ctx,
    pending,
    approved,
    "The user declined this action; it was not run. Acknowledge and do not retry unless they ask."
  );
  await runLoop(ctx);
  return true;
}
