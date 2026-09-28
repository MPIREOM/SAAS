import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/access-control";
import { logAudit } from "@/lib/audit";
import { defaultTechnician } from "@/lib/maintenance/whatsapp";
import {
  loadRequest,
  notifyTechnician,
  notifyTenantOfStatus,
  type NotificationSummary,
} from "@/lib/maintenance/workflow";

// Staff-created maintenance request. The unit's active tenant is attached
// when none is picked, the fixed technician is assigned when no one else is,
// and both get a WhatsApp (tenant: "received", technician: job details).

const createSchema = z.object({
  unit_id: z.string().uuid("Please select a unit."),
  tenant_id: z.string().uuid().nullable().optional(),
  category: z.enum(["plumbing", "electrical", "ac", "structural", "painting", "cleaning", "pest", "other"]),
  description: z.string().trim().min(1, "Description is required"),
  urgency: z.enum(["low", "medium", "high", "emergency"]),
  assigned_to_name: z.string().trim().max(200).nullable().optional(),
  assigned_to_phone: z.string().trim().max(50).nullable().optional(),
  estimated_cost: z.number().min(0).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }
  const input = parsed.data;
  const supabase = await createClient();

  const { data: unit } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("id", input.unit_id)
    .maybeSingle();
  if (!unit || (auth.propertyIds !== null && !auth.propertyIds.includes(unit.property_id))) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  let tenantId = input.tenant_id || null;
  if (!tenantId) {
    const { data: lease } = await supabase
      .from("leases")
      .select("tenant_id")
      .eq("unit_id", unit.id)
      .eq("is_active", true)
      .order("lease_start", { ascending: false })
      .limit(1)
      .maybeSingle();
    tenantId = (lease?.tenant_id as string | undefined) ?? null;
  }

  let assignedName = input.assigned_to_name || null;
  let assignedPhone = input.assigned_to_phone || null;
  const technician = defaultTechnician();
  if (!assignedName && !assignedPhone && technician) {
    assignedName = technician.name;
    assignedPhone = technician.phone;
  }

  const { data: created, error } = await supabase
    .from("maintenance_requests")
    .insert({
      unit_id: unit.id,
      tenant_id: tenantId,
      category: input.category,
      description: input.description,
      urgency: input.urgency,
      status: "open",
      assigned_to_name: assignedName,
      assigned_to_phone: assignedPhone,
      estimated_cost: input.estimated_cost ?? null,
      created_by: auth.userId,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: error?.message || "Failed to create request" }, { status: 500 });
  }

  await logAudit(supabase, {
    action: "create",
    entity_type: "maintenance_request",
    entity_id: created.id,
  });

  const notifications: NotificationSummary = {};
  const loaded = await loadRequest(supabase, created.id);
  if (loaded) {
    notifications.tenant = await notifyTenantOfStatus(loaded, "open");
    notifications.technician = await notifyTechnician(loaded);
  }

  return NextResponse.json({ success: true, id: created.id, notifications });
}
