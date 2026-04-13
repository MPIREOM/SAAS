import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Validates a maintenance link token and returns the property context
// the tenant-facing form needs. Property-scoped tokens are the current
// flow — the tenant then types their unit number into the form.

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
      property_id,
      expires_at,
      is_active,
      properties:property_id(name)
    `)
    .eq("token", token)
    .eq("is_active", true)
    .not("property_id", "is", null)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  const property = data.properties as unknown as Record<string, unknown> | null;

  return NextResponse.json({
    property_id: data.property_id,
    property_name: property?.name || "",
  });
}
