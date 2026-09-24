import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthContext, type AuthContext } from "@/lib/access-control";
import { createClient } from "@/lib/supabase/server";
import { loadMessageRows, type PendingAction, type TurnContext } from "@/lib/assistant/agent";
import {
  toDisplayMessages,
  toDisplayPending,
  type ConversationView,
} from "@/lib/assistant/display";

/** The dashboard assistant is available to super admins only. */
export async function requireSuperAdmin(): Promise<
  { ctx: AuthContext; error?: never } | { ctx?: never; error: NextResponse }
> {
  const ctx = await getAuthContext();
  if (!ctx) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (ctx.role !== "super_admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ctx };
}

export async function buildTurnContext(
  auth: AuthContext,
  conversationId: string,
  locale: unknown
): Promise<TurnContext> {
  return {
    supabase: await createClient(),
    conversationId,
    userId: auth.userId,
    userName: auth.fullName,
    locale: locale === "ar" ? "ar" : "en",
  };
}

export async function loadConversationView(
  turn: TurnContext
): Promise<ConversationView | null> {
  const { data: convo } = await turn.supabase
    .from("assistant_conversations")
    .select("id, title, pending_action")
    .eq("id", turn.conversationId)
    .eq("user_id", turn.userId)
    .maybeSingle();
  if (!convo) return null;
  const rows = await loadMessageRows(turn.supabase, turn.conversationId);
  return {
    conversationId: convo.id,
    title: convo.title,
    messages: toDisplayMessages(rows),
    pending: toDisplayPending(convo.pending_action as PendingAction | null),
  };
}

/** Maps agent failures to a response the chat panel can show. */
export function agentErrorResponse(err: unknown): NextResponse {
  console.error(
    "[Dashboard Assistant] Turn failed",
    err instanceof Error ? err.message : String(err)
  );
  const code =
    err instanceof Anthropic.RateLimitError
      ? "rate_limited"
      : err instanceof Anthropic.APIError
        ? "ai_unavailable"
        : "failed";
  return NextResponse.json({ error: code }, { status: 502 });
}
