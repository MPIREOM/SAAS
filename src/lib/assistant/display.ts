import type Anthropic from "@anthropic-ai/sdk";
import type { PendingAction } from "./agent";

/** Chat-panel view of a stored transcript. Shared by the API and the UI. */
export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Tool names the assistant used while producing this reply. */
  tools: string[];
}

export interface DisplayPendingAction {
  name: string;
  input: Record<string, unknown>;
}

export interface ConversationView {
  conversationId: string;
  title: string;
  messages: DisplayMessage[];
  pending: DisplayPendingAction[];
}

interface Row {
  id: number;
  role: "user" | "assistant";
  content: Anthropic.MessageParam["content"];
}

/**
 * Collapses the raw transcript into chat bubbles: typed user messages, and
 * one assistant bubble per reply (merging the text of every tool round).
 * Tool results and thinking blocks are hidden.
 */
export function toDisplayMessages(rows: Row[]): DisplayMessage[] {
  const out: DisplayMessage[] = [];
  for (const row of rows) {
    if (row.role === "user") {
      if (typeof row.content === "string") {
        out.push({ id: String(row.id), role: "user", text: row.content, tools: [] });
      }
      continue;
    }
    const blocks = Array.isArray(row.content) ? row.content : [];
    const text = blocks
      .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
      .map((b) => b.text.trim())
      .filter(Boolean)
      .join("\n\n");
    const tools = blocks
      .filter((b): b is Anthropic.ToolUseBlockParam => b.type === "tool_use")
      .map((b) => b.name);

    const prev = out[out.length - 1];
    if (prev?.role === "assistant") {
      prev.text = [prev.text, text].filter(Boolean).join("\n\n");
      prev.tools.push(...tools);
    } else {
      out.push({ id: String(row.id), role: "assistant", text, tools });
    }
  }
  return out;
}

export function toDisplayPending(
  pending: PendingAction | null | undefined
): DisplayPendingAction[] {
  return (pending?.toolUses ?? [])
    .filter((t) => t.requiresConfirmation)
    .map((t) => ({ name: t.name, input: t.input }));
}
