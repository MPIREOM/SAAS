"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/toast";
import { CURRENCY } from "@/lib/currency";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BusinessFeeDialog } from "@/components/owners/business-fee-dialog";
import type { OwnerDetailProps, BusinessFeeRow } from "@/components/owners/types";

export function OwnerBusinessFeesPanel({ owner, businessFees }: OwnerDetailProps) {
  const t = useTranslations("owners");
  const tCommon = useTranslations("common");
  const locale = useLocale();
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
        t("fees.confirmDelete", {
          month: f.period_month.slice(0, 7),
          amount: Number(f.amount).toFixed(2),
          code: CURRENCY.code,
        }),
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
      toast({ title: t("deleteFailed"), description: error.message, variant: "destructive" });
      return;
    }
    await logAudit(supabase, {
      action: "delete",
      entity_type: "owner_business_fee",
      entity_id: f.id,
    });
    toast({ title: t("fees.deleted"), variant: "success" });
    router.refresh();
  }

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-text-secondary">
          {t("fees.intro")}
        </p>
        <Button type="button" size="sm" onClick={openCreate} className="sm:shrink-0">
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t("newFee")}
        </Button>
      </div>

      {businessFees.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title={t("fees.emptyTitle")}
          description={t("fees.emptyDescription")}
          action={
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              {t("newFee")}
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop statement table */}
          <div className="hidden overflow-hidden rounded-xl border border-border/50 md:block">
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-44">{t("fees.month")}</TableHead>
                  <TableHead>{tCommon("notes")}</TableHead>
                  <TableHead className="w-40 text-end">
                    {t("amountWithCode", { code: CURRENCY.code })}
                  </TableHead>
                  <TableHead className="w-20 text-end">
                    <span className="sr-only">{tCommon("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {businessFees.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <span className="text-sm font-medium text-text-primary">
                        {formatMonth(f.period_month, locale)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-text-secondary">
                        {f.notes || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-end">
                      <FeeAmount fee={f} />
                    </TableCell>
                    <TableCell className="text-end">
                      <RowActions
                        onEdit={() => openEdit(f)}
                        onDelete={() => deleteOne(f)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <ul className="space-y-2 md:hidden">
            {businessFees.map((f) => (
              <li
                key={`m-${f.id}`}
                className="rounded-xl border border-border/50 bg-surface-elevated/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">
                      {formatMonth(f.period_month, locale)}
                    </p>
                    {f.notes && (
                      <p className="mt-0.5 truncate text-xs text-text-secondary">
                        {f.notes}
                      </p>
                    )}
                  </div>
                  <RowActions
                    onEdit={() => openEdit(f)}
                    onDelete={() => deleteOne(f)}
                  />
                </div>
                <div className="mt-3 text-end">
                  <FeeAmount fee={f} />
                  <span className="ms-1 text-[10px] text-text-secondary">
                    {CURRENCY.code}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
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

function FeeAmount({ fee }: { fee: BusinessFeeRow }) {
  return (
    <span className="font-mono text-sm font-semibold tabular-nums ltr-nums text-destructive">
      −
      {Number(fee.amount).toLocaleString("en-OM", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}

function RowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tCommon = useTranslations("common");
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onEdit}
        aria-label={tCommon("edit")}
        title={tCommon("edit")}
        className="h-8 w-8 p-0 text-text-secondary hover:text-accent"
      >
        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDelete}
        aria-label={tCommon("delete")}
        title={tCommon("delete")}
        className="h-8 w-8 p-0 text-text-secondary hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function formatMonth(periodMonth: string, locale: string): string {
  try {
    return new Date(periodMonth).toLocaleDateString(`${locale}-u-nu-latn`, {
      month: "long",
      year: "numeric",
    });
  } catch {
    return periodMonth.slice(0, 7);
  }
}
