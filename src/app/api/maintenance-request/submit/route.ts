import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const maxDuration = 60;

const submitSchema = z.object({
  token: z.string().min(1),
  unit_number: z.string().min(1, "Unit number is required"),
  category: z.enum(["plumbing", "electrical", "ac", "structural", "painting", "cleaning", "pest", "other"]),
  description: z.string().min(10, "Description must be at least 10 characters"),
  urgency: z.enum(["low", "medium", "high", "emergency"]),
});

export async function POST(request: NextRequest) {
  const formData = await request.formData();

  const parsed = submitSchema.safeParse({
    token: formData.get("token"),
    unit_number: formData.get("unit_number"),
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

  const { token, unit_number, category, description, urgency } = parsed.data;
  const trimmedUnitNumber = unit_number.trim();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Validate token — must be active, property-scoped, not expired.
  const { data: tokenData, error: tokenError } = await supabase
    .from("maintenance_tokens")
    .select("property_id, expires_at, is_active")
    .eq("token", token)
    .eq("is_active", true)
    .not("property_id", "is", null)
    .single();

  if (tokenError || !tokenData || !tokenData.property_id) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
  }

  if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  // Resolve the unit by (property_id, unit_number). Unit numbers are unique
  // per property, so this is deterministic. Unit must exist — we reject
  // the request with a clear error if not.
  const { data: unit } = await supabase
    .from("units")
    .select("id, unit_number, properties:property_id(name)")
    .eq("property_id", tokenData.property_id)
    .ilike("unit_number", trimmedUnitNumber)
    .maybeSingle();

  if (!unit) {
    return NextResponse.json(
      { error: `Unit "${trimmedUnitNumber}" not found in this property. Please double-check the unit number.` },
      { status: 404 }
    );
  }

  // Look up the current active lease to attribute the request to a tenant.
  // If the unit is vacant, tenant_id stays null — the request is still
  // created so maintenance staff can act on it.
  const { data: activeLease } = await supabase
    .from("leases")
    .select("tenant_id")
    .eq("unit_id", unit.id)
    .eq("is_active", true)
    .order("lease_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const tenantId = (activeLease?.tenant_id as string | undefined) || null;

  // Create maintenance request
  const { data: maintenanceRequest, error: insertError } = await supabase
    .from("maintenance_requests")
    .insert({
      tenant_id: tenantId,
      unit_id: unit.id,
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

  // Upload files. Paths are namespaced by property now (since tenant_id
  // may be null for vacant-unit submissions).
  const files = formData.getAll("files") as File[];
  const attachments: { file_url: string; file_name: string; file_type: string; file_size: number }[] = [];

  for (const file of files) {
    if (!file || file.size === 0) continue;

    const ext = file.name.split(".").pop() || "bin";
    const isVideo = file.type.startsWith("video/");
    const filePath = `${tokenData.property_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

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

  // Notify admin recipients on every submission (non-blocking — the
  // request row is already created, so any failure here is logged and
  // ignored rather than failing the tenant's submit). Urgency drives the
  // emoji in the subject/WhatsApp so high/emergency alerts still stand
  // out in a crowded inbox.
  try {
    const tenantRes = tenantId
      ? await supabase
          .from("tenants")
          .select("full_name, phone")
          .eq("id", tenantId)
          .single()
      : { data: null };

    const tenantName = tenantRes.data?.full_name || "Unknown (vacant unit)";
    const tenantPhone = tenantRes.data?.phone || null;
    const propertyName =
      (unit.properties as unknown as Record<string, unknown>)?.name || "Unknown";
    const unitNumber = unit.unit_number || trimmedUnitNumber;

    const { data: recipients } = await supabase
      .from("admin_notification_recipients")
      .select("name, email, phone, notify_email, notify_whatsapp")
      .eq("is_active", true);

    if (recipients && recipients.length > 0) {
      const { notifyAdmins, buildAdminEmailHtml } = await import(
        "@/lib/notifications/admin-notify"
      );

      const urgencyEmoji =
        urgency === "emergency"
          ? "🚨"
          : urgency === "high"
          ? "🔴"
          : urgency === "medium"
          ? "🟡"
          : "🟢";
      const subjectPrefix =
        urgency === "high" || urgency === "emergency"
          ? `${urgencyEmoji} ${urgency.toUpperCase()} Maintenance`
          : "🔧 New Maintenance Request";
      const alertTitle = `${urgencyEmoji} New Maintenance Request`;

      const origin = request.headers.get("origin") || request.nextUrl.origin;
      const dashboardLink = `${origin}/en/maintenance/${maintenanceRequest.id}`;

      const submittedAt = new Date().toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const attachmentSummary =
        attachments.length > 0
          ? `${attachments.length} file${attachments.length !== 1 ? "s" : ""} (${attachments.filter((a) => a.file_type === "photo").length} photo, ${attachments.filter((a) => a.file_type === "video").length} video)`
          : "None";

      // Email: full, untruncated description + inline photo previews so the
      // admin can see the issue without leaving their inbox. Videos are
      // linked (most email clients won't render <video>) with a thumbnail
      // placeholder.
      const emailItems = [
        `<strong>Property:</strong> ${propertyName} — Unit ${unitNumber}`,
        `<strong>Tenant:</strong> ${tenantName}${tenantPhone ? ` (${tenantPhone})` : ""}`,
        `<strong>Category:</strong> ${category}`,
        `<strong>Urgency:</strong> ${urgency.toUpperCase()}`,
        `<strong>Submitted:</strong> ${submittedAt}`,
        `<strong>Attachments:</strong> ${attachmentSummary}`,
        `<strong>Description:</strong><br>${description.replace(/\n/g, "<br>")}`,
      ];
      if (attachments.length > 0) {
        const photoThumbs = attachments
          .filter((a) => a.file_type === "photo")
          .map(
            (a) =>
              `<a href="${a.file_url}" style="display:inline-block;margin:4px;"><img src="${a.file_url}" alt="${a.file_name}" style="max-width:180px;max-height:180px;border-radius:8px;border:1px solid #2A293A;display:block;" /></a>`
          )
          .join("");
        const videoLinks = attachments
          .filter((a) => a.file_type === "video")
          .map(
            (a) =>
              `<div style="margin:4px 0;"><a href="${a.file_url}" style="color:#C9A84C;">▶ ${a.file_name}</a></div>`
          )
          .join("");
        if (photoThumbs) emailItems.push(`<strong>Photos:</strong><br>${photoThumbs}`);
        if (videoLinks) emailItems.push(`<strong>Videos:</strong>${videoLinks}`);
      }
      emailItems.push(
        `<a href="${dashboardLink}" style="color:#C9A84C;">Open in dashboard →</a>`
      );

      // WhatsApp: trim description to keep the message compact but
      // readable; full text + attachments are on the dashboard.
      const waDescription =
        description.length > 400
          ? `${description.slice(0, 400)}…`
          : description;

      const whatsappText = [
        `${urgencyEmoji} *New Maintenance Request*`,
        ``,
        `📍 *Property:* ${propertyName}`,
        `🏠 *Unit:* ${unitNumber}`,
        `👤 *Tenant:* ${tenantName}${tenantPhone ? ` (${tenantPhone})` : ""}`,
        `🔧 *Category:* ${category}`,
        `⚡ *Urgency:* ${urgency.toUpperCase()}`,
        `📎 *Attachments:* ${attachmentSummary}`,
        `🕒 *Submitted:* ${submittedAt}`,
        ``,
        `📝 *Description:*`,
        waDescription,
        ``,
        `🔗 ${dashboardLink}`,
      ].join("\n");

      await notifyAdmins(recipients, {
        subject: `${subjectPrefix} — ${propertyName} Unit ${unitNumber}`,
        emailHtml: buildAdminEmailHtml({
          title: alertTitle,
          sections: [{ heading: "Request Details", items: emailItems }],
          footer: "This is an automatic alert from MPIRE Property Management.",
        }),
        whatsappText,
      });
    }
  } catch (err) {
    console.error(
      "Admin notification failed:",
      err instanceof Error ? err.message : err
    );
    // Don't block the request — maintenance was already created
  }

  return NextResponse.json({
    success: true,
    request_id: maintenanceRequest.id,
    ...(attachmentWarning && { warning: attachmentWarning }),
  });
}
