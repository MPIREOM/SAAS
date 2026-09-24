import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "../_shared";

/** Lists the current user's recent assistant conversations. */
export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assistant_conversations")
    .select("id, title, updated_at")
    .eq("user_id", auth.ctx.userId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  return NextResponse.json({ conversations: data ?? [] });
}
