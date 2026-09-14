import type { SupabaseClient } from "@supabase/supabase-js";
import type { TemplateComponent, TemplateCreateInput } from "./admin";

// Every Meta message template SAAS sends, in the exact shape the sending code
// expects. Templates belong to a WhatsApp Business Account and do not move
// between accounts, so after the September 2026 ban they all have to be
// recreated on the new account. This module is the single source of truth
// the setup page creates them from.
//
// Positional variables follow the parameter order in the senders:
//   rent upcoming / cheque due (client.ts buildRentReminderComponents):
//     {{1}} tenant name, {{2}} unit, {{3}} property, {{4}} amount, {{5}} due date
//   lease expiry (buildLeaseExpiryComponents):
//     {{1}} tenant name, {{2}} unit, {{3}} property, {{4}} lease end date
//   overdue (buildOverdueReminderComponents):
//     {{1}} tenant name, {{2}} unit, {{3}} property, {{4}} total overdue, {{5}} details
//   daily_briefs (admin-summary): 11 parameters, see below
//   owner_monthly_report (owner-reports): document header + 3 body parameters

export interface TemplateDefinition extends TemplateCreateInput {
  /** Where the body came from, for the setup page. */
  source: "notification_templates" | "built-in";
  /** True when the template needs a media header and must be created by hand. */
  manual?: string;
  /** Why this definition cannot be submitted as-is (missing placeholders, ...). */
  issues: string[];
}

const REMINDER_PLACEHOLDERS: Record<string, Record<string, number>> = {
  rent_upcoming: { tenant_name: 1, unit_number: 2, unit: 2, property_name: 3, property: 3, amount: 4, due_date: 5 },
  lease_expiry: { tenant_name: 1, unit_number: 2, unit: 2, property_name: 3, property: 3, due_date: 4 },
  cheque_due: { tenant_name: 1, unit_number: 2, unit: 2, property_name: 3, property: 3, amount: 4, due_date: 5 },
  rent_overdue: {
    tenant_name: 1,
    unit_number: 2,
    unit: 2,
    property_name: 3,
    property: 3,
    total_overdue: 4,
    amount: 4,
    overdue_details: 5,
  },
};

const REMINDER_EXAMPLES: Record<string, string[]> = {
  rent_upcoming: ["Ahmed Al Balushi", "12", "Bousher Ameen Mosque", "350.00", "01 Oct 2026"],
  lease_expiry: ["Ahmed Al Balushi", "12", "Bousher Ameen Mosque", "31 Dec 2026"],
  cheque_due: ["Ahmed Al Balushi", "12", "Bousher Ameen Mosque", "350.00", "15 Oct 2026"],
  rent_overdue: ["Ahmed Al Balushi", "12", "Bousher Ameen Mosque", "700.00", "• Aug 2026: 350.00 OMR • Sep 2026: 350.00 OMR"],
};

/** Convert a {{tenant_name}}-style body into Meta's positional {{n}} form. */
export function toPositionalBody(body: string, mapping: Record<string, number>): { text: string; issues: string[] } {
  const issues: string[] = [];
  const seen = new Set<number>();
  const text = body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) => {
    const idx = mapping[key.toLowerCase()];
    if (!idx) {
      issues.push(`unknown placeholder {{${key}}}`);
      return "";
    }
    seen.add(idx);
    return `{{${idx}}}`;
  });
  const expected = new Set(Object.values(mapping));
  for (const idx of expected) {
    if (!seen.has(idx)) issues.push(`missing variable {{${idx}}} (the sender always passes ${expected.size} parameters)`);
  }
  if (/^\s*\{\{\d+\}\}/.test(text) || /\{\{\d+\}\}\s*$/.test(text)) {
    issues.push("Meta rejects a body that starts or ends with a variable");
  }
  if (text.length > 1024) issues.push(`body is ${text.length} characters; Meta allows 1024`);
  return { text: text.trim(), issues };
}

function body(text: string, examples: string[]): TemplateComponent {
  return { type: "BODY", text, example: { body_text: [examples] } };
}

/** Templates that exist only in code (no notification_templates row). */
export function builtInTemplateDefinitions(): TemplateDefinition[] {
  return [
    {
      source: "built-in",
      name: "daily_briefs",
      language: "en",
      category: "UTILITY",
      issues: [],
      components: [
        { type: "HEADER", format: "TEXT", text: "MPIRE Daily Summary" },
        body(
          [
            "GOOD MORNING,",
            "📅 {{1}}",
            "",
            "📋 Invoices Due Today: {{2}} ({{3}} OMR)",
            "🔴 Overdue: {{4}} ({{5}} OMR)",
            "{{10}}",
            "{{11}}",
            "🏦 Cheques Due: {{6}} ({{7}} OMR)",
            "🔧 New Maintenance (24h): {{8}}",
            "📊 Open Maintenance: {{9}}",
            "",
            "ENJOY YOUR DAY",
          ].join("\n"),
          [
            "Thursday, 10 September 2026",
            "0",
            "0.00",
            "44",
            "17050.00",
            "1",
            "280.00",
            "0",
            "0",
            "• Bousher Ameen Mosque: 32 inv (9070.00 OMR) • Aljabal Shops: 9 inv (6600.00 OMR)",
            "💼 Owner balance: +71.34 OMR (company owes Ahmed Alnabhani) 🧾 Expenses: yesterday 0.00 | MTD 2915.55 | YTD 24973.71 OMR",
          ]
        ),
        { type: "FOOTER", text: "This is an automated message sent by MPIRE" },
      ],
    },
    {
      source: "built-in",
      name: "owner_monthly_report",
      language: "en",
      category: "UTILITY",
      issues: [],
      manual:
        "Needs a DOCUMENT header (the PDF statement). Create it in WhatsApp Manager: header = Document, body = the text below, then upload any sample PDF when asked.",
      components: [
        body(
          [
            "Dear {{1}},",
            "",
            "Please find attached your MPIRE monthly statement for {{2}}.",
            "",
            "{{3}}",
            "",
            "If you have any questions about this statement, simply reply to this message.",
          ].join("\n"),
          ["Ahmed Alnabhani", "August 2026", "Company owes Ahmed Alnabhani 71.34 OMR"]
        ),
        { type: "FOOTER", text: "MPIRE Property Management" },
      ],
    },
  ];
}

interface NotificationTemplateRow {
  reminder_type: string;
  language: string;
  body_template: string;
  whatsapp_template_name: string | null;
  is_active: boolean;
}

/**
 * Reminder templates, one per active WhatsApp row in notification_templates.
 * The Meta name is the row's whatsapp_template_name (or the default
 * mpire_<type>_<lang> the senders fall back to), the body is the row's text
 * with placeholders converted to positional variables.
 */
export async function reminderTemplateDefinitions(supabase: SupabaseClient): Promise<TemplateDefinition[]> {
  const { data, error } = await supabase
    .from("notification_templates")
    .select("reminder_type, language, body_template, whatsapp_template_name, is_active")
    .eq("channel", "whatsapp")
    .eq("is_active", true);
  if (error) {
    return [
      {
        source: "notification_templates",
        name: "notification_templates",
        language: "-",
        category: "UTILITY",
        components: [],
        issues: [`could not read notification_templates: ${error.message}`],
      },
    ];
  }
  const rows = (data ?? []) as NotificationTemplateRow[];
  const out: TemplateDefinition[] = [];
  for (const row of rows) {
    const mapping = REMINDER_PLACEHOLDERS[row.reminder_type];
    const lang = row.language === "ar" ? "ar" : "en";
    const name = row.whatsapp_template_name || `mpire_${row.reminder_type}_${lang}`;
    if (!mapping) {
      out.push({ source: "notification_templates", name, language: "en", category: "UTILITY", components: [], issues: [`no parameter mapping for ${row.reminder_type}`] });
      continue;
    }
    const converted = toPositionalBody(row.body_template, mapping);
    out.push({
      source: "notification_templates",
      name,
      // The senders always send language "en" (all templates were registered
      // as English in Meta, Arabic text included) — see cron/reminders.
      language: "en",
      category: "UTILITY",
      components: [body(converted.text, REMINDER_EXAMPLES[row.reminder_type] ?? [])],
      issues: converted.issues,
    });
  }
  return out;
}

export async function allTemplateDefinitions(supabase: SupabaseClient): Promise<TemplateDefinition[]> {
  const reminders = await reminderTemplateDefinitions(supabase);
  return [...reminders, ...builtInTemplateDefinitions()];
}
