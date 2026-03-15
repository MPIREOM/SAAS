"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";

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
  const [costInput, setCostInput] = useState("");

  const handleStatusUpdate = async () => {
    if (!nextStatus) return;
    setLoading(true);
    setError("");

    const supabase = createClient();
    const updateData: Record<string, unknown> = { status: nextStatus };

    if (nextStatus === "resolved") {
      updateData.resolved_at = new Date().toISOString();
      if (costInput) {
        updateData.actual_cost = parseFloat(costInput);
      }
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

    await logAudit(supabase, {
      action: "status_update",
      entity_type: "maintenance_request",
      entity_id: requestId,
      metadata: { from: currentStatus, to: nextStatus },
    });

    // Auto-create expense record when resolved with actual_cost
    if (nextStatus === "resolved") {
      const { data: request } = await supabase
        .from("maintenance_requests")
        .select("actual_cost, unit_id, category, description, units:unit_id(property_id)")
        .eq("id", requestId)
        .single();

      if (request?.actual_cost && Number(request.actual_cost) > 0) {
        const unit = request.units as unknown as { property_id: string } | null;
        await supabase.from("expenses").insert({
          property_id: unit?.property_id,
          unit_id: request.unit_id,
          category: "maintenance",
          description: `Maintenance: ${request.category} - ${request.description?.slice(0, 100) || ""}`,
          amount: request.actual_cost,
          expense_date: new Date().toISOString().split("T")[0],
          created_by: (await supabase.auth.getUser()).data.user?.id,
        });
      }
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
      {nextStatus === "resolved" && (
        <div className="mb-3">
          <label className="block text-xs text-text-secondary mb-1">{t("actualCostInput")} (OMR)</label>
          <input
            type="number"
            step="0.01"
            value={costInput}
            onChange={(e) => setCostInput(e.target.value)}
            placeholder="0.00"
            className="w-full h-9 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary font-mono focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      )}
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
