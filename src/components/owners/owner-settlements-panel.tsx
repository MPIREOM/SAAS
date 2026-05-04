"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/toast";
import { CURRENCY } from "@/lib/currency";
import { EmptyState } from "@/components/ui/empty-state";
import { SettlementDialog } from "@/components/owners/settlement-dialog";
import type { OwnerDetailProps, SettlementRow } from "@/components/owners/types";
import { Banknote } from "lucide-react";

export function OwnerSettlementsPanel({ owner, settlements }: OwnerDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SettlementRow | null>(null);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(s: SettlementRow) {
    setEditing(s);
    setDialogOpen(true);
  }

  async function deleteOne(s: SettlementRow) {
    if (
      !confirm(
        `Delete this settlement? ${Number(s.amount).toFixed(2)} ${CURRENCY.code} on ${s.settled_at}. This cannot be undone.`,
      )
    ) {
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("owner_settlements")
      .delete()
      .eq("id", s.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    await logAudit(supabase, {
      action: "delete",
      entity_type: "owner_settlement",
      entity_id: s.id,
    });
    toast({ title: "Settlement deleted", variant: "success" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-secondary">
          Record payouts the company makes to the owner, or money the owner
          gives back to the company.
        </p>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-accent-foreground text-xs font-semibold rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          New settlement
        </button>
      </div>

      {settlements.length === 0 ? (
        <EmptyState
          icon={<Banknote className="h-6 w-6" />}
          title="No settlements yet"
          description="Each time the company pays the owner (or vice versa), record it here so the running balance reflects it."
        />
      ) : (
        <div className="rounded-2xl border border-border/60 bg-surface-elevated/30 divide-y divide-border/40 overflow-hidden">
          {settlements.map((s) => (
            <SettlementListRow
              key={s.id}
              settlement={s}
              onEdit={() => openEdit(s)}
              onDelete={() => deleteOne(s)}
            />
          ))}
        </div>
      )}

      <SettlementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ownerId={owner.id}
        editing={editing}
      />
    </div>
  );
}

function SettlementListRow({
  settlement: s,
  onEdit,
  onDelete,
}: {
  settlement: SettlementRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isOut = s.direction === "company_to_owner";
  const Icon = isOut ? ArrowUpRight : ArrowDownLeft;
  const tone = isOut ? "text-amber-400" : "text-emerald-400";
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className={`mt-0.5 ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary">
          {isOut ? "Paid to owner" : "Received from owner"}
        </div>
        <div className="text-xs text-text-secondary mt-0.5">
          {[
            labelMethod(s.method),
            s.reference_number ? `Ref ${s.reference_number}` : null,
            s.notes,
          ]
            .filter(Boolean)
            .join(" · ") || "—"}
        </div>
      </div>
      <div className="text-end shrink-0">
        <div className={`text-sm font-mono tabular-nums font-semibold ${tone}`}>
          {isOut ? "−" : "+"}
          {Number(s.amount).toLocaleString("en-OM", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          <span className="text-[10px] text-text-secondary font-sans">
            {CURRENCY.code}
          </span>
        </div>
        <div className="text-[10px] text-text-secondary mt-0.5">
          {formatDate(s.settled_at)}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
          aria-label="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg text-text-secondary hover:text-rose-400 hover:bg-rose-500/10"
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function labelMethod(m: string) {
  return m === "bank_transfer" ? "Bank transfer" : m.charAt(0).toUpperCase() + m.slice(1);
}

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s;
  }
}
