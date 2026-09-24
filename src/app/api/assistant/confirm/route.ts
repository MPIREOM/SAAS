import { NextRequest, NextResponse } from "next/server";
import { confirmPendingAction } from "@/lib/assistant/agent";
import {
  agentErrorResponse,
  buildTurnContext,
  loadConversationView,
  requireSuperAdmin,
} from "../_shared";

export const maxDuration = 300;

/** Approves or declines the action the assistant is waiting on. */
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  if (typeof body?.conversationId !== "string" || typeof body?.approve !== "boolean") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const turn = await buildTurnContext(auth.ctx, body.conversationId, body.locale);
  if (!(await loadConversationView(turn))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    await confirmPendingAction(turn, body.approve);
  } catch (err) {
    return agentErrorResponse(err);
  }
  return NextResponse.json(await loadConversationView(turn));
}
