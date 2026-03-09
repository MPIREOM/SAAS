"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  const [loading, setLoading] = useState(false);
  const [noteText, setNoteText] = useState("");

  const handleStatusUpdate = async () => {
    if (!nextStatus) return;
    setLoading(true);

    const supabase = createClient();
    const updateData: Record<string, unknown> = { status: nextStatus };

    if (nextStatus === "resolved") {
      updateData.resolved_at = new Date().toISOString();
    }

    await supabase
      .from("maintenance_requests")
      .update(updateData)
      .eq("id", requestId);

    router.refresh();
    setLoading(false);
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setLoading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("maintenance_notes").insert({
      maintenance_request_id: requestId,
      content: noteText.trim(),
      created_by: user?.id,
    });

    setNoteText("");
    router.refresh();
    setLoading(false);
  };

  if (showNoteForm) {
    return (
      <form onSubmit={handleAddNote} className="flex gap-3">
        <input
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Add a note..."
          className="flex-1 h-9 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !noteText.trim()}
          className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
        >
          Add Note
        </button>
      </form>
    );
  }

  if (!nextStatus) {
    return (
      <p className="text-sm text-text-secondary">
        This request is closed. No further status changes available.
      </p>
    );
  }

  const statusLabels: Record<string, string> = {
    in_progress: "Mark In Progress",
    resolved: "Mark Resolved",
    closed: "Close Request",
  };

  return (
    <button
      onClick={handleStatusUpdate}
      disabled={loading}
      className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
    >
      {loading ? "Updating..." : statusLabels[nextStatus] || `Move to ${nextStatus}`}
    </button>
  );
}
