import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
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
      { error: "Only admins can resend invites" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { user_id } = body;

  if (!user_id) {
    return NextResponse.json(
      { error: "user_id is required" },
      { status: 400 }
    );
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Refuse to resend for users who already accepted the invite —
  // `inviteUserByEmail` would error, but checking up front gives a
  // clearer message to the admin.
  const { data: targetAuth, error: targetErr } =
    await adminClient.auth.admin.getUserById(user_id);

  if (targetErr || !targetAuth?.user) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404 }
    );
  }

  if (targetAuth.user.last_sign_in_at) {
    return NextResponse.json(
      { error: "User has already accepted the invite" },
      { status: 400 }
    );
  }

  const email = targetAuth.user.email;
  if (!email) {
    return NextResponse.json(
      { error: "User has no email on file" },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // For an existing unconfirmed user, `inviteUserByEmail` returns
  // "User already registered". `generateLink` with type='invite' works
  // for both new and already-invited emails and returns the link we'd
  // otherwise email — Supabase will also email it when SMTP is set.
  const { error: linkError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: appUrl ? `${appUrl}/auth/update-password` : undefined,
      data: targetAuth.user.user_metadata,
    },
  });

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 400 });
  }

  logAudit(supabase, {
    action: "resend_invite",
    entity_type: "user",
    entity_id: user_id,
    metadata: { email },
  });

  return NextResponse.json({ success: true });
}
