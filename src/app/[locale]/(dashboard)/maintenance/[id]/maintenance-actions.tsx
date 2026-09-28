"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type SendResult = { success: boolean; error?: string } | undefined;
type Notifications = { tenant?: SendResult; technician?: SendResult };

interface ApiResult {
  error?: string;
  warning?: string;
  notifications?: Notifications;
}

async function callApi(url: string, method: "PATCH" | "POST", body: unknown): Promise<ApiResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as ApiResult;
    if (!res.ok) return { error: data.error || `HTTP ${res.status}` };
    return data;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Network error" };
  }
}

/** Human-readable outcome of the WhatsApp sends the server attempted. */
function useNotificationMessages() {
  const t = useTranslations("maintenance");
  return (n: Notifications | undefined) => {
    const ok: string[] = [];
    const failed: string[] = [];
    if (n?.tenant) {
      if (n.tenant.success) ok.push(t("tenantNotified"));
      else failed.push(t("tenantNotifyFailed", { error: n.tenant.error || "unknown" }));
    }
    if (n?.technician) {
      if (n.technician.success) ok.push(t("technicianNotified"));
      else failed.push(t("technicianNotifyFailed", { error: n.technician.error || "unknown" }));
    }
    return { ok, failed };
  };
}

interface FeedbackState {
  error?: string;
  success?: string;
  warnings?: string[];
}

function Feedback({ state }: { state: FeedbackState }) {
  return (
    <>
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      {state.success && <Alert variant="success">{state.success}</Alert>}
      {state.warnings?.map((w) => (
        <Alert key={w} variant="warning">
          {w}
        </Alert>
      ))}
    </>
  );
}

// ── Status transitions ────────────────────────────────────────────────────

export function MaintenanceStatusActions({
  requestId,
  currentStatus,
  transitions,
  actualCost,
}: {
  requestId: string;
  currentStatus: string;
  transitions: string[];
  actualCost: number | null;
}) {
  const router = useRouter();
  const t = useTranslations("maintenance");
  const describe = useNotificationMessages();
  const [pending, setPending] = useState<string | null>(null);
  const [costInput, setCostInput] = useState(actualCost ? String(actualCost) : "");
  const [feedback, setFeedback] = useState<FeedbackState>({});

  const labelFor = (target: string): string => {
    const reopening =
      (currentStatus === "resolved" || currentStatus === "closed") && target === "in_progress";
    if (reopening) return t("reopen");
    if (target === "open") return t("moveBackToOpen");
    if (target === "in_progress") return t("markInProgress");
    if (target === "resolved") return t("markResolved");
    if (target === "closed") return t("closeRequest");
    return target;
  };

  const isForward = (target: string) =>
    ["open", "in_progress", "resolved", "closed"].indexOf(target) >
    ["open", "in_progress", "resolved", "closed"].indexOf(currentStatus);

  const handleTransition = async (target: string) => {
    // One request at a time: prevents double-submits of the same move.
    if (pending) return;
    setPending(target);
    setFeedback({});

    const body: Record<string, unknown> = { status: target };
    if (target === "resolved" && costInput.trim()) {
      const cost = parseFloat(costInput);
      if (!Number.isFinite(cost) || cost < 0) {
        setFeedback({ error: t("unexpectedError") });
        setPending(null);
        return;
      }
      body.actual_cost = cost;
    }

    const result = await callApi(`/api/maintenance/${requestId}`, "PATCH", body);
    if (result.error) {
      setFeedback({ error: result.error });
      setPending(null);
      return;
    }

    const { ok, failed } = describe(result.notifications);
    setFeedback({
      success: [t("statusUpdated"), ...ok].join(" "),
      warnings: [...failed, ...(result.warning ? [result.warning] : [])],
    });
    setPending(null);
    router.refresh();
  };

  if (transitions.length === 0) {
    return <p className="text-sm text-text-secondary">{t("requestClosed")}</p>;
  }

  return (
    <div className="space-y-3">
      {transitions.includes("resolved") && (
        <Input
          type="number"
          min={0}
          step="0.01"
          value={costInput}
          onChange={(e) => setCostInput(e.target.value)}
          label={`${t("actualCostInput")} (OMR)`}
          placeholder="0.00"
          className="font-mono ltr-nums max-w-xs"
        />
      )}
      <div className="flex flex-wrap gap-2">
        {transitions.map((target) => (
          <Button
            key={target}
            variant={isForward(target) ? "default" : "outline"}
            loading={pending === target}
            disabled={pending !== null && pending !== target}
            onClick={() => handleTransition(target)}
          >
            {labelFor(target)}
          </Button>
        ))}
      </div>
      <p className="text-xs text-text-secondary">{t("statusWhatsAppHint")}</p>
      <Feedback state={feedback} />
    </div>
  );
}

// ── Assignment & cost ─────────────────────────────────────────────────────

export function MaintenanceAssignmentForm({
  requestId,
  assignedToName,
  assignedToPhone,
  estimatedCost,
}: {
  requestId: string;
  assignedToName: string | null;
  assignedToPhone: string | null;
  estimatedCost: number | null;
}) {
  const router = useRouter();
  const t = useTranslations("maintenance");
  const tc = useTranslations("common");
  const describe = useNotificationMessages();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>({});

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setFeedback({});

    const form = new FormData(e.currentTarget);
    const costRaw = String(form.get("estimated_cost") ?? "").trim();
    const cost = costRaw ? parseFloat(costRaw) : null;
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
      setFeedback({ error: t("unexpectedError") });
      setLoading(false);
      return;
    }

    const result = await callApi(`/api/maintenance/${requestId}`, "PATCH", {
      assigned_to_name: String(form.get("assigned_to_name") ?? ""),
      assigned_to_phone: String(form.get("assigned_to_phone") ?? ""),
      estimated_cost: cost,
    });
    if (result.error) {
      setFeedback({ error: result.error });
      setLoading(false);
      return;
    }

    const { ok, failed } = describe(result.notifications);
    setFeedback({ success: [t("saved"), ...ok].join(" "), warnings: failed });
    setLoading(false);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input
          name="assigned_to_name"
          label={t("assignedTo")}
          placeholder={t("technicianName")}
          defaultValue={assignedToName ?? ""}
        />
        <Input
          name="assigned_to_phone"
          label={t("vendorPhone")}
          placeholder={t("vendorPhonePlaceholder")}
          defaultValue={assignedToPhone ?? ""}
          className="font-mono ltr-nums"
          dir="ltr"
        />
        <Input
          name="estimated_cost"
          type="number"
          min={0}
          step="0.01"
          label={`${t("estimatedCost")} (OMR)`}
          placeholder="0.00"
          defaultValue={estimatedCost ?? ""}
          className="font-mono ltr-nums"
        />
      </div>
      <p className="text-xs text-text-secondary">{t("assignmentHint")}</p>
      <div className="flex justify-end">
        <Button type="submit" loading={loading}>
          {tc("save")}
        </Button>
      </div>
      <Feedback state={feedback} />
    </form>
  );
}

// ── Notes ─────────────────────────────────────────────────────────────────

export function MaintenanceNoteForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const t = useTranslations("maintenance");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [noteText, setNoteText] = useState("");

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim() || loading) return;
    setLoading(true);
    setError("");

    const result = await callApi(`/api/maintenance/${requestId}/notes`, "POST", {
      note: noteText.trim(),
    });
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setNoteText("");
    setLoading(false);
    router.refresh();
  };

  return (
    <div className="space-y-2">
      <form onSubmit={handleAddNote} className="flex gap-3 items-end">
        <div className="flex-1">
          <Input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={t("addNotePlaceholder")}
            aria-label={t("addNote")}
          />
        </div>
        <Button type="submit" loading={loading} disabled={!noteText.trim()}>
          {t("addNote")}
        </Button>
      </form>
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
