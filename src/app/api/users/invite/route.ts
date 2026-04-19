import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  // Verify the requesting user is authenticated and is an admin
  const supabase = await createServerClient();
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
    return NextResponse.json(
      { error: "Only admins can invite users" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { email, full_name, role, property_ids } = body;

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  // Validate role
  const validRoles = ["super_admin", "property_manager", "accountant"];
  if (role && !validRoles.includes(role)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${validRoles.join(", ")}` },
      { status: 400 }
    );
  }

  // Use service role client to create the user
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Create auth user via invite — sends a magic-link email. `createUser`
  // with email_confirm:true (the previous approach) doesn't email anyone;
  // it just marks the user as pre-confirmed, which is why invitees were
  // never receiving anything.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const { data: authData, error: authError } =
    await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role },
      redirectTo: appUrl ? `${appUrl}/auth/update-password` : undefined,
    });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Insert into users table — rollback auth user if this fails
  const { error: insertError } = await adminClient.from("users").upsert({
    id: authData.user.id,
    email,
    full_name: full_name || null,
    role: role || "property_manager",
    is_active: true,
  });

  if (insertError) {
    // Rollback: delete the auth user to avoid orphan state
    try {
      await adminClient.auth.admin.deleteUser(authData.user.id);
    } catch (rollbackError) {
      console.error("Failed to rollback auth user:", authData.user.id, rollbackError);
    }
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  // Assign properties if provided (only for non-super_admin)
  if (
    Array.isArray(property_ids) &&
    property_ids.length > 0 &&
    (role || "property_manager") !== "super_admin"
  ) {
    const rows = property_ids.map((propertyId: string) => ({
      user_id: authData.user.id,
      property_id: propertyId,
      assigned_by: user.id,
    }));

    const { error: assignError } = await adminClient
      .from("user_property_assignments")
      .insert(rows);

    if (assignError) {
      console.error("Failed to assign properties to new user:", assignError.message);
    }
  }

  logAudit(supabase, {
    action: "invite_user",
    entity_type: "user",
    entity_id: authData.user.id,
    metadata: { email, role: role || "property_manager", property_ids: property_ids || [] },
  });

  return NextResponse.json({ success: true, user_id: authData.user.id });
}
