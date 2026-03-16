"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { Trash2, CheckCircle2, XCircle, MoreVertical } from "lucide-react";

interface ChequeActionsProps {
  chequeId: string;
  currentStatus: string;
}

export function ChequeActions({ chequeId, currentStatus }: ChequeActionsProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function updateStatus(newStatus: string) {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("cheques")
      .update({ status: newStatus })
      .eq("id", chequeId);

    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: `Cheque marked as ${newStatus}`, variant: "success" });
      router.refresh();
    }
    setLoading(false);
    setOpen(false);
  }

  async function deleteCheque() {
    if (!confirm("Are you sure you want to delete this cheque?")) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("cheques")
      .delete()
      .eq("id", chequeId);

    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Cheque deleted", variant: "success" });
      router.refresh();
    }
    setLoading(false);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-50 bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[180px] animate-scale-in">
            {currentStatus === "pending" && (
              <>
                <button
                  onClick={() => updateStatus("cleared")}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-success hover:bg-surface-elevated transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Mark as Cleared
                </button>
                <button
                  onClick={() => updateStatus("bounced")}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-warning hover:bg-surface-elevated transition-colors"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Mark as Bounced
                </button>
              </>
            )}
            {currentStatus === "bounced" && (
              <button
                onClick={() => updateStatus("pending")}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-elevated transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Reset to Pending
              </button>
            )}
            {currentStatus === "cleared" && (
              <button
                onClick={() => updateStatus("pending")}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-elevated transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Reset to Pending
              </button>
            )}
            <div className="border-t border-border my-1" />
            <button
              onClick={deleteCheque}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-surface-elevated transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Cheque
            </button>
          </div>
        </>
      )}
    </div>
  );
}
