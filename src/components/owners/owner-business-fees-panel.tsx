"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/toast";
import { CURRENCY } from "@/lib/currency";
import { EmptyState } from "@/components/ui/empty-state";
import { BusinessFeeDialog } from "@/components/owners/business-fee-dialog";
import type { OwnerDetailProps, BusinessFeeRow } from "@/components/owners/types";

export function OwnerBusinessFeesPanel({ owner, businessFees }: OwnerDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BusinessFeeRow | null>(null);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(f: BusinessFeeRow) {
    setEditing(f);
    setDialogOpen(true);
  }

  async function deleteOne(f: BusinessFeeRow) {
    if (
      !confirm(
        `Delete the ${f.period_month.slice(0, 7)} business fee (${Number(f.amount).toFixed(2)} ${CURRENCY.code})?`,
      )
    ) {
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("owner_business_fees")
      .delete()
      .eq("id", f.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    await logAudit(supabase, {
      action: "delete",
      entity_type: "owner_business_fee",
      entity_id: f.id,
    });
    toast({ title: "Fee deleted", variant: "success" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-secondary">
          Flat monthly fee charged to the owner&apos;s ledger. The cron creates
          one row per month automatically; edit or delete here when the
          arrangement changes.
        </p>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-accent-foreground text-xs font-semibold rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          New fee
        </button>
      </div>

      {businessFees.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No fees yet"
          description="The daily cron auto-creates a row each month for owners with included_in_business_fee properties."
        />
      ) : (
        <div className="rounded-2xl border border-border/60 bg-surface-elevated/30 divide-y divide-border/40 overflow-hidden">
          {businessFees.map((f) => (
            <div key={f.id} className="flex items-start gap-3 px-4 py-3">
              <div className="text-text-secondary mt-0.5">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary">
                  {formatMonth(f.period_month)}
                </div>
                {f.notes && (
                  <div className="text-xs text-text-secondary mt-0.5 truncate">
                    {f.notes}
                  </div>
                )}
              </div>
              <div className="text-end shrink-0">
                <div className="text-sm font-mono tabular-nums font-semibold text-amber-400">
                  −
                  {Number(f.amount).toLocaleString("en-OM", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  <span className="text-[10px] text-text-secondary font-sans">
                    {CURRENCY.code}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openEdit(f)}
                  className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                  aria-label="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteOne(f)}
                  className="p-2 rounded-lg text-text-secondary hover:text-rose-400 hover:bg-rose-500/10"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <BusinessFeeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ownerId={owner.id}
        editing={editing}
      />
    </div>
  );
}

function formatMonth(periodMonth: string): string {
  try {
    return new Date(periodMonth).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    });
  } catch {
    return periodMonth.slice(0, 7);
  }
}
