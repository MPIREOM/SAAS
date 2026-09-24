import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendUserMessage } from "@/lib/assistant/agent";
import {
  agentErrorResponse,
  buildTurnContext,
  loadConversationView,
  requireSuperAdmin,
} from "../_shared";

// A turn can chain many tool calls.
export const maxDuration = 300;

const MAX_MESSAGE_CHARS = 8000;

/** Sends a message to the assistant, starting a conversation if needed. */
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ error: "invalid_message" }, { status: 400 });
  }

  let conversationId =
    typeof body?.conversationId === "string" ? body.conversationId : null;
  if (!conversationId) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("assistant_conversations")
      .insert({ user_id: auth.ctx.userId, title: message.slice(0, 80) })
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "failed" }, { status: 500 });
    }
    conversationId = data.id as string;
  }

  const turn = await buildTurnContext(auth.ctx, conversationId, body?.locale);
  if (!(await loadConversationView(turn))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    await sendUserMessage(turn, message);
  } catch (err) {
    return agentErrorResponse(err);
  }
  return NextResponse.json(await loadConversationView(turn));
}
