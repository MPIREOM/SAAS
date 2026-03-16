import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const submitSchema = z.object({
  token: z.string().min(1),
  category: z.enum(["plumbing", "electrical", "ac", "structural", "painting", "cleaning", "pest", "other"]),
  description: z.string().min(10, "Description must be at least 10 characters"),
  urgency: z.enum(["low", "medium", "high", "emergency"]),
});

export async function POST(request: NextRequest) {
  const formData = await request.formData();

  const parsed = submitSchema.safeParse({
    token: formData.get("token"),
    category: formData.get("category"),
    description: formData.get("description"),
    urgency: formData.get("urgency"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { token, category, description, urgency } = parsed.data;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Validate token
  const { data: tokenData, error: tokenError } = await supabase
    .from("maintenance_tokens")
    .select("tenant_id, unit_id, expires_at, is_active")
    .eq("token", token)
    .eq("is_active", true)
    .single();

  if (tokenError || !tokenData) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
  }

  if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  // Create maintenance request
  const { data: maintenanceRequest, error: insertError } = await supabase
    .from("maintenance_requests")
    .insert({
      tenant_id: tokenData.tenant_id,
      unit_id: tokenData.unit_id,
      category,
      description,
      urgency,
      status: "open",
    })
    .select("id")
    .single();

  if (insertError || !maintenanceRequest) {
    return NextResponse.json(
      { error: insertError?.message || "Failed to create request" },
      { status: 500 }
    );
  }

  // Send instant alert for high/emergency maintenance
  if (urgency === "high" || urgency === "emergency") {
    // Fetch unit and tenant info for the alert
    const [unitRes, tenantRes] = await Promise.all([
      supabase.from("units").select("unit_number, properties:property_id(name)").eq("id", tokenData.unit_id).single(),
      tokenData.tenant_id
        ? supabase.from("tenants").select("full_name").eq("id", tokenData.tenant_id).single()
        : Promise.resolve({ data: null }),
    ]);

    const unitInfo = unitRes.data;
    const tenantName = tenantRes.data?.full_name || "Unknown";
    const propertyName = (unitInfo?.properties as unknown as Record<string, unknown>)?.name || "Unknown";
    const unitNumber = unitInfo?.unit_number || "Unknown";

    // Fetch admin recipients
    const { data: recipients } = await supabase
      .from("admin_notification_recipients")
      .select("name, email, phone, notify_email, notify_whatsapp")
      .eq("is_active", true);

    if (recipients && recipients.length > 0) {
      const { notifyAdmins, buildAdminEmailHtml } = await import("@/lib/notifications/admin-notify");

      const alertTitle = `🔴 ${urgency.toUpperCase()} Maintenance Request`;
      const details = `${tenantName} reported a ${category} issue in ${propertyName} - Unit ${unitNumber}: "${description.slice(0, 100)}${description.length > 100 ? "..." : ""}"`;

      await notifyAdmins(recipients, {
        subject: `${alertTitle} - ${propertyName} Unit ${unitNumber}`,
        emailHtml: buildAdminEmailHtml({
          title: alertTitle,
          sections: [{
            heading: "Request Details",
            items: [
              `<strong>Property:</strong> ${propertyName} — Unit ${unitNumber}`,
              `<strong>Tenant:</strong> ${tenantName}`,
              `<strong>Category:</strong> ${category}`,
              `<strong>Urgency:</strong> ${urgency.toUpperCase()}`,
              `<strong>Description:</strong> ${description.slice(0, 200)}`,
            ],
          }],
          footer: "This is an automatic alert from MPIRE Property Management.",
        }),
        whatsappText: `⚠️ *${alertTitle}*\n\n📍 ${propertyName} — Unit ${unitNumber}\n👤 ${tenantName}\n🔧 ${category}\n📝 ${description.slice(0, 150)}\n\nPlease review this request in the dashboard.`,
      });
    }
  }

  // Upload files
  const files = formData.getAll("files") as File[];
  const attachments: { file_url: string; file_name: string; file_type: string; file_size: number }[] = [];

  for (const file of files) {
    if (!file || file.size === 0) continue;

    const ext = file.name.split(".").pop() || "bin";
    const isVideo = file.type.startsWith("video/");
    const filePath = `${tokenData.tenant_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("maintenance-media")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (!uploadError) {
      const { data: urlData } = supabase.storage
        .from("maintenance-media")
        .getPublicUrl(filePath);

      attachments.push({
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_type: isVideo ? "video" : "photo",
        file_size: file.size,
      });
    }
  }

  // Insert attachments
  let attachmentWarning: string | null = null;
  if (attachments.length > 0) {
    const { error: attachError } = await supabase.from("maintenance_attachments").insert(
      attachments.map((a) => ({
        request_id: maintenanceRequest.id,
        ...a,
      }))
    );
    if (attachError) {
      attachmentWarning = "Request created but some attachments failed to save";
    }
  }

  return NextResponse.json({
    success: true,
    request_id: maintenanceRequest.id,
    ...(attachmentWarning && { warning: attachmentWarning }),
  });
}
