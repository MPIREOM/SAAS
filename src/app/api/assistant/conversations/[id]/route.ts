import { NextRequest, NextResponse } from "next/server";
import { buildTurnContext, loadConversationView, requireSuperAdmin } from "../../_shared";

type Params = { params: Promise<{ id: string }> };

/** Loads one conversation for the chat panel. */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;

  const turn = await buildTurnContext(auth.ctx, id, null);
  const view = await loadConversationView(turn);
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(view);
}

/** Deletes a conversation and its messages. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;

  const turn = await buildTurnContext(auth.ctx, id, null);
  const { error } = await turn.supabase
    .from("assistant_conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.ctx.userId);
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
