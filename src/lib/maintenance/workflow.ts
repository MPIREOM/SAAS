import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_ALERT_TEMPLATE,
  adminAlertParams,
  sendTechnicianJob,
  sendTenantStatusUpdate,
  type MaintenanceMessageContext,
  type SendResult,
  type TenantNotifiableStatus,
  type TenantRecipient,
} from "./whatsapp";

export const MAINTENANCE_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

// Allowed status moves. Forward is the normal path; the backward moves let
// staff reopen a request that was resolved/closed too early, and an open
// request can be resolved directly when the fix was immediate.
export const STATUS_TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  open: ["in_progress", "resolved"],
  in_progress: ["resolved", "open"],
  resolved: ["closed", "in_progress"],
  closed: ["in_progress"],
};

export function isMaintenanceStatus(value: unknown): value is MaintenanceStatus {
  return typeof value === "string" && (MAINTENANCE_STATUSES as readonly string[]).includes(value);
}

export interface LoadedRequest {
  id: string;
  status: MaintenanceStatus;
  unitId: string;
  propertyId: string | null;
  actualCost: number | null;
  assignedToName: string | null;
  assignedToPhone: string | null;
  tenant: TenantRecipient | null;
  ctx: MaintenanceMessageContext;
}

export async function loadRequest(
  supabase: SupabaseClient,
  id: string
): Promise<LoadedRequest | null> {
  const { data } = await supabase
    .from("maintenance_requests")
    .select(
      `id, status, unit_id, category, urgency, description, actual_cost,
       assigned_to_name, assigned_to_phone,
       units:unit_id(unit_number, property_id, properties:property_id(name)),
       tenants:tenant_id(full_name, phone, language_preference, notifications_enabled)`
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const unit = data.units as unknown as {
    unit_number: string;
    property_id: string;
    properties: { name: string } | null;
  } | null;
  const tenant = (data.tenants as unknown as TenantRecipient | null) ?? null;

  return {
    id: data.id as string,
    status: data.status as MaintenanceStatus,
    unitId: data.unit_id as string,
    propertyId: unit?.property_id ?? null,
    actualCost: data.actual_cost != null ? Number(data.actual_cost) : null,
    assignedToName: (data.assigned_to_name as string | null) ?? null,
    assignedToPhone: (data.assigned_to_phone as string | null) ?? null,
    tenant,
    ctx: {
      requestId: data.id as string,
      propertyName: unit?.properties?.name || "Unknown",
      unitNumber: unit?.unit_number || "—",
      category: (data.category as string | null) ?? null,
      urgency: (data.urgency as string) || "medium",
      description: (data.description as string) || "",
      tenantName: tenant?.full_name ?? null,
      tenantPhone: tenant?.phone ?? null,
    },
  };
}

export interface NotificationSummary {
  tenant?: SendResult;
  technician?: SendResult;
}

/** Tenant update for a status the tenant is told about; no-op otherwise. */
export async function notifyTenantOfStatus(
  request: LoadedRequest,
  status: MaintenanceStatus
): Promise<SendResult | undefined> {
  if (!request.tenant) return undefined;
  if (status === "closed") return undefined;
  return sendTenantStatusUpdate(request.tenant, status as TenantNotifiableStatus, request.ctx);
}

export async function notifyTechnician(request: LoadedRequest): Promise<SendResult | undefined> {
  if (!request.assignedToPhone) return undefined;
  return sendTechnicianJob(request.assignedToPhone, request.ctx);
}

/**
 * Admin alert for a new request, sent as the maintenance_admin_alert
 * template (falls back to the rich free-form text when the template isn't
 * available). Email is built by the caller since it differs per source.
 */
export function adminWhatsAppTemplate(ctx: MaintenanceMessageContext, dashboardLink: string) {
  return {
    name: ADMIN_ALERT_TEMPLATE.name,
    languageCode: ADMIN_ALERT_TEMPLATE.language,
    parameters: adminAlertParams(ctx, dashboardLink),
    fallbackToText: true,
  };
}

/**
 * Create or update the single expense linked to a resolved request. Keyed on
 * expenses.maintenance_request_id (unique), so repeating it never duplicates.
 */
export async function syncMaintenanceExpense(
  supabase: SupabaseClient,
  request: LoadedRequest,
  amount: number,
  userId: string
): Promise<string | null> {
  if (!(amount > 0) || !request.propertyId) return null;

  const description = `Maintenance: ${request.ctx.category ?? "other"} - ${request.ctx.description.slice(0, 100)}`;
  const { data: existing } = await supabase
    .from("expenses")
    .select("id")
    .eq("maintenance_request_id", request.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("expenses")
      .update({ amount, description })
      .eq("id", existing.id);
    return error ? error.message : null;
  }

  const { error } = await supabase.from("expenses").insert({
    property_id: request.propertyId,
    unit_id: request.unitId,
    maintenance_request_id: request.id,
    category: "maintenance",
    description,
    amount,
    vendor: request.assignedToName,
    expense_date: new Date().toISOString().split("T")[0],
    created_by: userId,
  });
  // 23505: a concurrent resolve inserted it first — the expense exists, fine.
  if (error && error.code !== "23505") return error.message;
  return null;
}
