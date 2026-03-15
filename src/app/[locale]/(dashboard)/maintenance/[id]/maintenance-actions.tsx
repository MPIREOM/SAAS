"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

interface MaintenanceActionsProps {
  requestId: string;
  currentStatus: string;
  nextStatus: string | null;
  showNoteForm?: boolean;
}

export default function MaintenanceActions({
  requestId,
  currentStatus,
  nextStatus,
  showNoteForm,
}: MaintenanceActionsProps) {
  const router = useRouter();
  const t = useTranslations("maintenance");
  const tc = useTranslations("common");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [noteText, setNoteText] = useState("");

  const handleStatusUpdate = async () => {
    if (!nextStatus) return;
    setLoading(true);
    setError("");

    const supabase = createClient();
    const updateData: Record<string, unknown> = { status: nextStatus };

    if (nextStatus === "resolved") {
      updateData.resolved_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from("maintenance_requests")
      .update(updateData)
      .eq("id", requestId);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.refresh();
    setLoading(false);
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setLoading(true);
    setError("");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from("maintenance_notes").insert({
      maintenance_request_id: requestId,
      content: noteText.trim(),
      created_by: user?.id,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    setNoteText("");
    router.refresh();
    setLoading(false);
  };

  if (showNoteForm) {
    return (
      <div className="space-y-2">
        <form onSubmit={handleAddNote} className="flex gap-3">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={t("addNotePlaceholder")}
            className="flex-1 h-9 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !noteText.trim()}
            className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {t("addNote")}
          </button>
        </form>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (!nextStatus) {
    return (
      <p className="text-sm text-text-secondary">
        {t("requestClosed")}
      </p>
    );
  }

  const statusLabels: Record<string, string> = {
    in_progress: t("markInProgress"),
    resolved: t("markResolved"),
    closed: t("closeRequest"),
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleStatusUpdate}
        disabled={loading}
        className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
      >
        {loading ? tc("loading") : statusLabels[nextStatus] || nextStatus}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
