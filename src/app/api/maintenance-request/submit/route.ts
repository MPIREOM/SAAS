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
  if (attachments.length > 0) {
    await supabase.from("maintenance_attachments").insert(
      attachments.map((a) => ({
        request_id: maintenanceRequest.id,
        ...a,
      }))
    );
  }

  return NextResponse.json({
    success: true,
    request_id: maintenanceRequest.id,
  });
}
