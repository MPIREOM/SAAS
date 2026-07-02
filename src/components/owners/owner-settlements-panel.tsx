"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Pencil, Trash2, ArrowUpRight, ArrowDownLeft, Banknote } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/toast";
import { CURRENCY } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SettlementDialog } from "@/components/owners/settlement-dialog";
import type { OwnerDetailProps, SettlementRow } from "@/components/owners/types";

export function OwnerSettlementsPanel({ owner, settlements }: OwnerDetailProps) {
  const t = useTranslations("owners");
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
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-text-secondary">
          Record payouts the company makes to the owner, or money the owner
          gives back to the company.
        </p>
        <Button type="button" size="sm" onClick={openCreate} className="sm:shrink-0">
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t("newSettlement")}
        </Button>
      </div>

      {settlements.length === 0 ? (
        <EmptyState
          icon={<Banknote className="h-6 w-6" />}
          title="No settlements yet"
          description="Each time the company pays the owner (or vice versa), record it here so the running balance reflects it."
          action={
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              {t("newSettlement")}
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop statement table */}
          <div className="hidden overflow-hidden rounded-xl border border-border/50 md:block">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-40 text-end">
                    Amount ({CURRENCY.code})
                  </TableHead>
                  <TableHead className="w-20 text-end">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements.map((s) => (
                  <SettlementTableRow
                    key={s.id}
                    settlement={s}
                    onEdit={() => openEdit(s)}
                    onDelete={() => deleteOne(s)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <ul className="space-y-2 md:hidden">
            {settlements.map((s) => (
              <SettlementCard
                key={`m-${s.id}`}
                settlement={s}
                onEdit={() => openEdit(s)}
                onDelete={() => deleteOne(s)}
              />
            ))}
          </ul>
        </>
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

function DirectionBadge({ settlement: s }: { settlement: SettlementRow }) {
  const t = useTranslations("owners");
  const isOut = s.direction === "company_to_owner";
  const Icon = isOut ? ArrowUpRight : ArrowDownLeft;
  return (
    <Badge variant="outline" className="gap-1.5">
      <Icon
        aria-hidden="true"
        className={cn(
          "h-3 w-3 rtl:-scale-x-100",
          isOut ? "text-destructive" : "text-success",
        )}
      />
      {isOut ? t("paidToOwner") : t("receivedFromOwner")}
    </Badge>
  );
}

function SettlementAmount({ settlement: s }: { settlement: SettlementRow }) {
  const isOut = s.direction === "company_to_owner";
  return (
    <span
      className={cn(
        "font-mono text-sm font-semibold tabular-nums ltr-nums",
        isOut ? "text-destructive" : "text-success",
      )}
    >
      {isOut ? "−" : "+"}
      {Number(s.amount).toLocaleString("en-OM", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}

function detailsText(s: SettlementRow): string {
  return (
    [
      labelMethod(s.method),
      s.reference_number ? `Ref ${s.reference_number}` : null,
      s.notes,
    ]
      .filter(Boolean)
      .join(" · ") || "—"
  );
}

function RowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onEdit}
        aria-label="Edit"
        title="Edit"
        className="h-8 w-8 p-0 text-text-secondary hover:text-accent"
      >
        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDelete}
        aria-label="Delete"
        title="Delete"
        className="h-8 w-8 p-0 text-text-secondary hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function SettlementTableRow({
  settlement: s,
  onEdit,
  onDelete,
}: {
  settlement: SettlementRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap font-mono text-xs ltr-nums text-text-secondary">
        {formatDate(s.settled_at)}
      </TableCell>
      <TableCell>
        <DirectionBadge settlement={s} />
      </TableCell>
      <TableCell>
        <span className="text-xs text-text-secondary">{detailsText(s)}</span>
      </TableCell>
      <TableCell className="text-end">
        <SettlementAmount settlement={s} />
      </TableCell>
      <TableCell className="text-end">
        <RowActions onEdit={onEdit} onDelete={onDelete} />
      </TableCell>
    </TableRow>
  );
}

function SettlementCard({
  settlement: s,
  onEdit,
  onDelete,
}: {
  settlement: SettlementRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="rounded-xl border border-border/50 bg-surface-elevated/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <DirectionBadge settlement={s} />
          <p className="mt-1.5 text-xs text-text-secondary">{detailsText(s)}</p>
        </div>
        <RowActions onEdit={onEdit} onDelete={onDelete} />
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="font-mono text-xs ltr-nums text-text-secondary">
          {formatDate(s.settled_at)}
        </span>
        <span className="text-end">
          <SettlementAmount settlement={s} />
          <span className="ms-1 text-[10px] text-text-secondary">
            {CURRENCY.code}
          </span>
        </span>
      </div>
    </li>
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
