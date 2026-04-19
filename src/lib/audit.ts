import { SupabaseClient } from "@supabase/supabase-js";

type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "logout"
  | "invite_user"
  | "resend_invite"
  | "move_out"
  | "mark_paid"
  | "partial_payment"
  | "advance_payment"
  | "status_update"
  | "export_report"
  | "cancel_invoice";

type EntityType =
  | "tenant"
  | "property"
  | "unit"
  | "lease"
  | "invoice"
  | "payment"
  | "cheque"
  | "expense"
  | "maintenance_request"
  | "document"
  | "notification_template"
  | "user";

interface AuditLogEntry {
  action: AuditAction;
  entity_type: EntityType;
  entity_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit event. Fire-and-forget — errors are silently ignored.
 */
export async function logAudit(
  supabase: SupabaseClient,
  entry: AuditLogEntry
) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("audit_log").insert({
      user_id: user?.id ?? null,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (error) {
    console.warn("Audit log failed:", error instanceof Error ? error.message : error);
  }
}
