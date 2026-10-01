// Client-safe view of visit_message_logs (047): one WhatsApp message to a
// unit's tenant and how far it got.

export type VisitMessageKind = "invite" | "confirmation" | "reminder";

/** Where a message ended up, most useful first for staff. */
export type VisitMessageState = "read" | "delivered" | "sent" | "failed" | "skipped";

export interface VisitMessage {
  kind: VisitMessageKind;
  send_status: "sent" | "failed" | "skipped";
  via: "template" | "text" | null;
  delivery_status: "sent" | "delivered" | "read" | "failed" | null;
  error: string | null;
  template_error: string | null;
  delivery_error: string | null;
  created_at: string;
}

export const VISIT_MESSAGE_COLUMNS =
  "unit_id, kind, send_status, via, delivery_status, error, template_error, delivery_error, created_at";

export function messageState(m: VisitMessage): VisitMessageState {
  if (m.send_status === "skipped") return "skipped";
  if (m.send_status === "failed" || m.delivery_status === "failed") return "failed";
  if (m.delivery_status === "read") return "read";
  if (m.delivery_status === "delivered") return "delivered";
  return "sent";
}

/** The reason to show for a failed or skipped message. */
export function messageProblem(m: VisitMessage): string | null {
  const state = messageState(m);
  if (state === "failed") return m.delivery_error || m.error || null;
  if (state === "skipped") return m.error;
  return null;
}

/** Meta's 24-hour re-engagement error: free-form text to someone who hasn't messaged recently. */
export function isOutsideWindowError(text: string | null): boolean {
  return !!text && (/131047/.test(text) || /re-?engagement/i.test(text));
}
