import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

// Property-scoped maintenance link generator.
//
// Tokens are idempotent per property: if an active token already exists,
// it's returned instead of creating a new one. The DB has a partial unique
// index enforcing this at the data layer as well.

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { property_id } = await request.json();

  if (!property_id) {
    return NextResponse.json(
      { error: "property_id is required" },
      { status: 400 }
    );
  }

  // Authorization: the caller must have access to this property. properties
  // RLS scopes SELECT to assigned properties (super_admin sees all), so an
  // unassigned property returns nothing here.
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", property_id)
    .maybeSingle();

  if (!property) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Return existing active token if there is one
  const { data: existing } = await supabase
    .from("maintenance_tokens")
    .select("id, token")
    .eq("property_id", property_id)
    .eq("is_active", true)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ token: existing.token, id: existing.id });
  }

  const token = randomBytes(16).toString("base64url");

  const { data, error } = await supabase
    .from("maintenance_tokens")
    .insert({
      token,
      property_id,
      tenant_id: null,
      unit_id: null,
      created_by: user.id,
      expires_at: null,
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

// GET: List active property tokens (optionally filtered by property_id).
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const propertyId = request.nextUrl.searchParams.get("property_id");

  let query = supabase
    .from("maintenance_tokens")
    .select("id, token, property_id, is_active, created_at, properties:property_id(name)")
    .eq("is_active", true)
    .not("property_id", "is", null)
    .order("created_at", { ascending: false });

  if (propertyId) {
    query = query.eq("property_id", propertyId);
  }

  const { data: tokens } = await query;

  return NextResponse.json({ tokens: tokens || [] });
}

// DELETE: Revoke a token (same as before).
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
