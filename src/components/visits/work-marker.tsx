"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Pencil, Undo2, XCircle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";

export type WorkStatus = "done" | "not_entered";
export type WorkReason = "not_home" | "refused" | "other";

const REASONS: WorkReason[] = ["not_home", "refused", "other"];

interface Props {
  crewToken: string;
  bookingId: string;
  status: WorkStatus | null;
  reason: WorkReason | null;
  note: string | null;
}

/** Contractor's per-unit "Done / Couldn't enter" control on the schedule page (050). */
export function WorkMarker({ crewToken, bookingId, status, reason, note }: Props) {
  const t = useTranslations("visitSchedule");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftStatus, setDraftStatus] = useState<WorkStatus>(status ?? "done");
  const [draftReason, setDraftReason] = useState<WorkReason | null>(reason);
  const [draftNote, setDraftNote] = useState(note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (next: { status: WorkStatus | null; reason?: WorkReason | null; note?: string | null }) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/visit-schedule/${encodeURIComponent(crewToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId, ...next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setEditing(false);
      router.refresh();
    } catch {
      setError(t("saveFailed"));
    }
    setBusy(false);
  };

  const openEditor = (preset: WorkStatus) => {
    setDraftStatus(preset);
    setDraftReason(reason);
    setDraftNote(note ?? "");
    setEditing(true);
  };

  if (editing) {
    return (
      <div className="mt-2 space-y-3 rounded-lg border border-border/60 bg-surface-elevated/50 p-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("outcome")}>
          {(["done", "not_entered"] as WorkStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={draftStatus === s}
              onClick={() => setDraftStatus(s)}
              className={cn(
                "px-3 h-9 rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                draftStatus === s
                  ? s === "done"
                    ? "border-success bg-success/15 text-success"
                    : "border-destructive bg-destructive/10 text-destructive"
                  : "border-border/60 text-text-secondary"
              )}
            >
              {s === "done" ? t("markDone") : t("couldntEnter")}
            </button>
          ))}
        </div>
        {draftStatus === "not_entered" && (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("reason")}>
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={draftReason === r}
                onClick={() => setDraftReason(r)}
                className={cn(
                  "px-3 h-8 rounded-lg border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  draftReason === r ? "border-accent bg-accent/10 text-text-primary" : "border-border/60 text-text-secondary"
                )}
              >
                {t(`reasons.${r}`)}
              </button>
            ))}
          </div>
        )}
        <Textarea
          label={t("note")}
          placeholder={t("notePlaceholder")}
          rows={2}
          maxLength={500}
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          className="resize-none"
        />
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            loading={busy}
            disabled={draftStatus === "not_entered" && !draftReason}
            onClick={() =>
              save({
                status: draftStatus,
                reason: draftStatus === "not_entered" ? draftReason : null,
                note: draftNote.trim() || null,
              })
            }
          >
            {t("save")}
          </Button>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            loading={busy}
            onClick={() => save({ status: "done", reason: null, note: null })}
            className="bg-success text-white hover:bg-success/90 shadow-none"
          >
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
            {t("markDone")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => openEditor("not_entered")} disabled={busy}>
            <XCircle aria-hidden="true" className="h-3.5 w-3.5" />
            {t("couldntEnter")}
          </Button>
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status === "done" ? "success" : "destructive"}>
          {status === "done" ? t("statusDone") : t("statusNotEntered")}
          {status === "not_entered" && reason ? ` · ${t(`reasons.${reason}`)}` : ""}
        </Badge>
        <Button type="button" size="sm" variant="ghost" onClick={() => openEditor(status)} disabled={busy}>
          <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
          {t("edit")}
        </Button>
        <Button type="button" size="sm" variant="ghost" loading={busy} onClick={() => save({ status: null })}>
          <Undo2 aria-hidden="true" className="h-3.5 w-3.5" />
          {t("undo")}
        </Button>
      </div>
      {note && <p className="text-xs text-text-secondary whitespace-pre-line">{note}</p>}
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
