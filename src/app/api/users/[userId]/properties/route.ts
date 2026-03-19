import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only super_admin can view other users' property assignments
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: assignments, error } = await supabase
    .from("user_property_access")
    .select("property_id")
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    propertyIds: (assignments || []).map((a) => a.property_id),
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { propertyIds } = body as { propertyIds: string[] };

  if (!Array.isArray(propertyIds)) {
    return NextResponse.json(
      { error: "propertyIds must be an array" },
      { status: 400 }
    );
  }

  // Verify the target user exists
  const { data: targetUser } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", userId)
    .single();

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Super admins don't need property assignments (they see everything)
  if (targetUser.role === "super_admin") {
    return NextResponse.json({ error: "Super admins have access to all properties" }, { status: 400 });
  }

  // Delete existing assignments and insert new ones
  const { error: deleteError } = await supabase
    .from("user_property_access")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (propertyIds.length > 0) {
    const rows = propertyIds.map((propertyId) => ({
      user_id: userId,
      property_id: propertyId,
      assigned_by: user.id,
    }));

    const { error: insertError } = await supabase
      .from("user_property_access")
      .insert(rows);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  logAudit(supabase, {
    action: "update",
    entity_type: "user",
    entity_id: userId,
    metadata: { property_ids: propertyIds, action: "assign_properties" },
  });

  return NextResponse.json({ success: true, propertyIds });
}
