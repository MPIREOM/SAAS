"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { Trash2, CheckCircle2, XCircle, MoreVertical } from "lucide-react";

interface ChequeActionsProps {
  chequeId: string;
  currentStatus: string;
}

const menuItemClass =
  "w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:bg-surface-elevated";

export function ChequeActions({ chequeId, currentStatus }: ChequeActionsProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("cheques");
  const tc = useTranslations("common");

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
      toast({ title: t("chequeMarked", { status: newStatus }), variant: "success" });
      router.refresh();
    }
    setLoading(false);
    setOpen(false);
  }

  async function deleteCheque() {
    if (!confirm(t("deleteConfirm"))) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("cheques")
      .delete()
      .eq("id", chequeId);

    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: t("chequeDeleted"), variant: "success" });
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
        aria-label={tc("actions")}
        aria-haspopup="true"
        aria-expanded={open}
        className="p-1.5 rounded-md text-text-secondary cursor-pointer transition-colors hover:text-text-primary hover:bg-surface-elevated disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            role="presentation"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute end-0 top-8 z-50 bg-surface border border-border/60 rounded-lg shadow-xl shadow-black/20 py-1 min-w-[180px] animate-scale-in"
            role="menu"
          >
            {currentStatus === "pending" && (
              <>
                <button
                  onClick={() => updateStatus("cleared")}
                  role="menuitem"
                  className={`${menuItemClass} text-success`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("markCleared")}
                </button>
                <button
                  onClick={() => updateStatus("bounced")}
                  role="menuitem"
                  className={`${menuItemClass} text-warning`}
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("markBounced")}
                </button>
              </>
            )}
            {currentStatus === "bounced" && (
              <button
                onClick={() => updateStatus("pending")}
                role="menuitem"
                className={`${menuItemClass} text-text-primary`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t("resetPending")}
              </button>
            )}
            {currentStatus === "cleared" && (
              <button
                onClick={() => updateStatus("pending")}
                role="menuitem"
                className={`${menuItemClass} text-text-primary`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t("resetPending")}
              </button>
            )}
            <div className="border-t border-border/60 my-1" role="presentation" />
            <button
              onClick={deleteCheque}
              role="menuitem"
              className={`${menuItemClass} text-destructive`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t("deleteCheque")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
