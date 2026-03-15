import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const { token } = await request.json();

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("maintenance_tokens")
    .select(`
      id,
      tenant_id,
      unit_id,
      expires_at,
      is_active,
      tenants:tenant_id(full_name, phone, language_preference),
      units:unit_id(unit_number, property_id, properties:property_id(name))
    `)
    .eq("token", token)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  const tenant = data.tenants as unknown as Record<string, unknown> | null;
  const unit = data.units as unknown as Record<string, unknown> | null;
  const property = unit?.properties as unknown as Record<string, unknown> | null;

  return NextResponse.json({
    tenant_id: data.tenant_id,
    unit_id: data.unit_id,
    tenant_name: tenant?.full_name || "",
    tenant_language: tenant?.language_preference || "en",
    unit_number: unit?.unit_number || "",
    property_name: property?.name || "",
  });
}
