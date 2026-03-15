import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenant_id, unit_id } = await request.json();

  if (!tenant_id || !unit_id) {
    return NextResponse.json(
      { error: "tenant_id and unit_id are required" },
      { status: 400 }
    );
  }

  // Generate a short URL-safe token
  const token = randomBytes(16).toString("base64url");

  const { data, error } = await supabase
    .from("maintenance_tokens")
    .insert({
      token,
      tenant_id,
      unit_id,
      created_by: user.id,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id, token")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    token: data.token,
    id: data.id,
  });
}

// GET: List active tokens for a tenant
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = request.nextUrl.searchParams.get("tenant_id");
  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
  }

  const { data: tokens } = await supabase
    .from("maintenance_tokens")
    .select("id, token, unit_id, is_active, expires_at, created_at, units:unit_id(unit_number)")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  return NextResponse.json({ tokens: tokens || [] });
}

// DELETE: Revoke a token
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token_id } = await request.json();

  await supabase
    .from("maintenance_tokens")
    .update({ is_active: false })
    .eq("id", token_id);

  return NextResponse.json({ success: true });
}
