"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  ArrowUp,
  History,
  MessageSquarePlus,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";
import type {
  ConversationView,
  DisplayMessage,
  DisplayPendingAction,
} from "@/lib/assistant/display";

const STORAGE_KEY = "mpire.assistant.conversationId";

interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

function readStoredId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode); the chat still works without it.
  }
}

/** Renders **bold** spans inside a line of assistant text. */
function renderInline(line: string, key: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={`${key}-${i}`} className="font-semibold text-text-primary">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={`${key}-${i}`}>{part}</React.Fragment>
    )
  );
}

/** Minimal formatting for replies: paragraphs, "- " bullets and bold. */
function FormattedText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*[-•*]\s+/.test(l));
        if (isList) {
          return (
            <ul key={bi} className="list-disc space-y-1 ps-5">
              {lines.map((l, li) => (
                <li key={li}>{renderInline(l.replace(/^\s*[-•*]\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} className="whitespace-pre-wrap">
            {lines.map((l, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(l, `${bi}-${li}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function AssistantWidget({ locale }: { locale: string }) {
  const t = useTranslations("assistant");
  const tc = useTranslations("common");

  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<"chat" | "history">("chat");
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<DisplayMessage[]>([]);
  const [pending, setPending] = React.useState<DisplayPendingAction[]>([]);
  const [history, setHistory] = React.useState<ConversationSummary[] | null>(null);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loadingView, setLoadingView] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending, busy, open, view]);

  const errorMessage = React.useCallback(
    (code: unknown) => {
      if (code === "rate_limited") return t("errors.rateLimited");
      if (code === "ai_unavailable") return t("errors.unavailable");
      return t("errors.generic");
    },
    [t]
  );

  const applyView = React.useCallback((data: ConversationView) => {
    setConversationId(data.conversationId);
    setMessages(data.messages);
    setPending(data.pending);
    storeId(data.conversationId);
  }, []);

  const loadConversation = React.useCallback(
    async (id: string) => {
      setLoadingView(true);
      setError(null);
      try {
        const res = await fetch(`/api/assistant/conversations/${id}`);
        if (res.status === 404) {
          storeId(null);
          setConversationId(null);
          setMessages([]);
          setPending([]);
          return;
        }
        if (!res.ok) throw new Error();
        applyView(await res.json());
      } catch {
        setError(t("errors.generic"));
      } finally {
        setLoadingView(false);
      }
    },
    [applyView, t]
  );

  const loadHistory = React.useCallback(async () => {
    setHistory(null);
    try {
      const res = await fetch("/api/assistant/conversations");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setHistory(data.conversations);
    } catch {
      setHistory([]);
      setError(t("errors.generic"));
    }
  }, [t]);

  function handleOpen() {
    setOpen(true);
    if (!loadedOnce) {
      setLoadedOnce(true);
      const stored = readStoredId();
      if (stored) void loadConversation(stored);
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function startNewChat() {
    storeId(null);
    setConversationId(null);
    setMessages([]);
    setPending([]);
    setError(null);
    setView("chat");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function showHistory() {
    setView("history");
    setError(null);
    void loadHistory();
  }

  async function openFromHistory(id: string) {
    setView("chat");
    await loadConversation(id);
  }

  async function deleteConversation(id: string) {
    if (!window.confirm(t("deleteConfirm"))) return;
    const res = await fetch(`/api/assistant/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(t("errors.generic"));
      return;
    }
    setHistory((h) => (h ? h.filter((c) => c.id !== id) : h));
    if (id === conversationId) startNewChat();
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setError(null);
    setBusy(true);
    // Optimistic bubble; the server response replaces the whole list.
    setMessages((m) => [
      ...m,
      { id: `local-${Date.now()}`, role: "user", text: message, tools: [] },
    ]);
    setPending([]);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message, locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorMessage(data.error));
        if (conversationId) void loadConversation(conversationId);
        return;
      }
      applyView(data);
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function respond(approve: boolean) {
    if (!conversationId || busy) return;
    setBusy(true);
    setError(null);
    setPending([]);
    try {
      const res = await fetch("/api/assistant/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, approve, locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorMessage(data.error));
        void loadConversation(conversationId);
        return;
      }
      applyView(data);
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  function actionLabel(name: string) {
    const key = `actions.${name}`;
    return t.has(key) ? t(key) : name.replace(/_/g, " ");
  }

  const suggestions = [t("suggestions.overdue"), t("suggestions.ownerBalance"), t("suggestions.expiring")];

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={handleOpen}
          aria-label={t("open")}
          className={cn(
            "fixed bottom-5 end-5 z-40 flex h-14 w-14 items-center justify-center rounded-full",
            "bg-accent text-accent-foreground shadow-lg shadow-accent/30 transition-transform",
            "hover:scale-105 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label={t("title")}
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-surface",
            "md:inset-auto md:bottom-5 md:end-5 md:h-[min(680px,calc(100vh-2.5rem))] md:w-[420px]",
            "md:rounded-2xl md:border md:border-border/60 md:shadow-2xl md:shadow-black/40",
            "animate-fade-in-up"
          )}
        >
          {/* Header */}
          <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <Sparkles className="h-5 w-5 text-accent" aria-hidden="true" />
            <h2 className="flex-1 font-display text-base font-semibold text-text-primary">
              {view === "history" ? t("history") : t("title")}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={view === "history" ? () => setView("chat") : showHistory}
              aria-label={t("history")}
              aria-pressed={view === "history"}
            >
              <History className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={startNewChat}
              aria-label={t("newChat")}
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setOpen(false)}
              aria-label={tc("close")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </header>

          {view === "history" ? (
            <div className="flex-1 overflow-y-auto p-3">
              {history === null ? (
                <Spinner className="py-10" label={tc("loading")} />
              ) : history.length === 0 ? (
                <p className="py-10 text-center text-sm text-text-secondary">{t("noHistory")}</p>
              ) : (
                <ul className="space-y-1">
                  {history.map((c) => (
                    <li key={c.id} className="group flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void openFromHistory(c.id)}
                        className={cn(
                          "flex-1 rounded-lg px-3 py-2 text-start transition-colors hover:bg-surface-elevated",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                          c.id === conversationId && "bg-surface-elevated"
                        )}
                      >
                        <span dir="auto" className="block truncate text-sm text-text-primary">
                          {c.title || t("untitled")}
                        </span>
                        <span className="ltr-nums font-mono text-xs text-text-secondary">
                          {new Date(c.updated_at).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-text-secondary hover:text-destructive"
                        onClick={() => void deleteConversation(c.id)}
                        aria-label={t("deleteChat")}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
              {loadingView ? (
                <Spinner className="py-10" label={tc("loading")} />
              ) : messages.length === 0 && !busy ? (
                <div className="flex h-full flex-col justify-center gap-4">
                  <div>
                    <p className="font-display text-lg font-semibold text-text-primary">{t("welcomeTitle")}</p>
                    <p className="mt-1 text-sm text-text-secondary">{t("welcomeBody")}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void send(s)}
                        className={cn(
                          "rounded-lg border border-border/60 px-3 py-2 text-start text-sm text-text-secondary transition-colors",
                          "hover:border-accent/40 hover:text-text-primary",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}
                  >
                    {m.role === "assistant" && m.tools.length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-text-secondary">
                        <Wrench className="h-3 w-3" aria-hidden="true" />
                        {t("toolsUsed", { count: m.tools.length })}
                      </span>
                    )}
                    {(m.text || m.role === "user") && (
                      <div
                        dir="auto"
                        className={cn(
                          "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                          m.role === "user"
                            ? "bg-accent/15 text-text-primary rounded-ee-sm"
                            : "bg-surface-elevated text-text-primary rounded-es-sm"
                        )}
                      >
                        {m.role === "user" ? (
                          <p className="whitespace-pre-wrap">{m.text}</p>
                        ) : (
                          <FormattedText text={m.text} />
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}

              {pending.length > 0 && !busy && (
                <div className="rounded-xl border border-warning/40 bg-warning/10 p-3.5">
                  <p className="text-sm font-semibold text-warning">{t("confirmTitle")}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">{t("confirmBody")}</p>
                  <div className="mt-3 space-y-3">
                    {pending.map((p, i) => (
                      <div key={i} className="rounded-lg bg-surface/70 p-2.5">
                        <p className="text-sm font-medium text-text-primary">{actionLabel(p.name)}</p>
                        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                          {Object.entries(p.input).map(([k, v]) => (
                            <React.Fragment key={k}>
                              <dt className="text-text-secondary">{k.replace(/_/g, " ")}</dt>
                              <dd dir="auto" className="ltr-nums break-all font-mono text-text-primary">
                                {formatValue(v)}
                              </dd>
                            </React.Fragment>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => void respond(false)}>
                      {tc("cancel")}
                    </Button>
                    <Button size="sm" onClick={() => void respond(true)}>
                      {tc("confirm")}
                    </Button>
                  </div>
                </div>
              )}

              {busy && (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Spinner sizeClassName="h-4 w-4" />
                  <span>{t("thinking")}</span>
                </div>
              )}

              {error && <Alert variant="destructive">{error}</Alert>}
            </div>
          )}

          {view === "chat" && (
            <form
              className="flex items-end gap-2 border-t border-border/60 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <div className="flex-1">
                <Textarea
                  ref={inputRef}
                  dir="auto"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  placeholder={t("placeholder")}
                  aria-label={t("placeholder")}
                  rows={2}
                  maxLength={8000}
                  className="min-h-[44px] resize-none"
                  disabled={busy}
                />
              </div>
              <Button
                type="submit"
                size="icon"
                disabled={busy || !input.trim()}
                aria-label={t("send")}
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          )}
        </section>
      )}
    </>
  );
}
