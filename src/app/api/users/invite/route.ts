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
  const { email, full_name, role } = body;

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

  // Create auth user with invite
  const { data: authData, error: authError } =
    await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name, role },
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
    await adminClient.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  logAudit(supabase, {
    action: "invite_user",
    entity_type: "user",
    entity_id: authData.user.id,
    metadata: { email, role: role || "property_manager" },
  });

  return NextResponse.json({ success: true, user_id: authData.user.id });
}
