import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/access-control";
import { logAudit } from "@/lib/audit";
import {
  STATUS_TRANSITIONS,
  loadRequest,
  notifyTechnician,
  notifyTenantOfStatus,
  syncMaintenanceExpense,
  type NotificationSummary,
} from "@/lib/maintenance/workflow";

// Staff-side updates to a maintenance request: status transitions (with the
// resolve -> expense sync and tenant WhatsApp update) and assignment/cost
// edits (with the technician job message). Runs server-side so the expense
// write is idempotent and notifications can use the WhatsApp credentials.

const optionalText = z
  .string()
  .trim()
  .max(200)
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));

const optionalAmount = z.number().min(0).nullable().optional();

const patchSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  actual_cost: optionalAmount,
  estimated_cost: optionalAmount,
  assigned_to_name: optionalText,
  assigned_to_phone: optionalText,
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const supabase = await createClient();
  const current = await loadRequest(supabase, id);
  if (
    !current ||
    (auth.propertyIds !== null &&
      (!current.propertyId || !auth.propertyIds.includes(current.propertyId)))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = { updated_by: auth.userId };
  const statusChanged = input.status !== undefined && input.status !== current.status;

  if (statusChanged) {
    if (!STATUS_TRANSITIONS[current.status].includes(input.status!)) {
      return NextResponse.json(
        { error: `Cannot move a request from ${current.status} to ${input.status}` },
        { status: 409 }
      );
    }
    update.status = input.status;
    if (input.status === "resolved") {
      update.resolved_at = new Date().toISOString();
    } else if (input.status === "open" || input.status === "in_progress") {
      // Reopened: no longer resolved.
      update.resolved_at = null;
    }
  }

  if (input.actual_cost !== undefined) update.actual_cost = input.actual_cost;
  if (input.estimated_cost !== undefined) update.estimated_cost = input.estimated_cost;
  if (input.assigned_to_name !== undefined) update.assigned_to_name = input.assigned_to_name;
  if (input.assigned_to_phone !== undefined) update.assigned_to_phone = input.assigned_to_phone;

  const phoneChanged =
    input.assigned_to_phone !== undefined &&
    !!input.assigned_to_phone &&
    input.assigned_to_phone !== current.assignedToPhone;

  const { error: updateError } = await supabase
    .from("maintenance_requests")
    .update(update)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const updated = (await loadRequest(supabase, id)) ?? current;

  let warning: string | undefined;
  if (updated.status === "resolved" && updated.actualCost && updated.actualCost > 0) {
    const expenseError = await syncMaintenanceExpense(
      supabase,
      updated,
      updated.actualCost,
      auth.userId
    );
    if (expenseError) warning = `Request updated but the expense could not be saved: ${expenseError}`;
  }

  await logAudit(supabase, {
    action: statusChanged ? "status_update" : "update",
    entity_type: "maintenance_request",
    entity_id: id,
    metadata: statusChanged
      ? { from: current.status, to: input.status }
      : { fields: Object.keys(update).filter((k) => k !== "updated_by") },
  });

  const notifications: NotificationSummary = {};
  if (statusChanged) {
    notifications.tenant = await notifyTenantOfStatus(updated, updated.status);
  }
  if (phoneChanged) {
    notifications.technician = await notifyTechnician(updated);
  }

  return NextResponse.json({ success: true, notifications, ...(warning && { warning }) });
}
