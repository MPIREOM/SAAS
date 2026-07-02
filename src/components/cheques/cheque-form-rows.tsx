"use client";

import { useTranslations } from "next-intl";
import { Plus, Trash2, FileText } from "lucide-react";
import { CURRENCY, formatCurrency } from "@/lib/currency";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

export interface ChequeEntry {
  id?: string; // Only set for existing cheques
  cheque_number: string;
  bank_name: string;
  cheque_date: string;
  amount: string;
  status?: string;
  notes?: string;
}

interface ChequeFormRowsProps {
  cheques: ChequeEntry[];
  onChange: (cheques: ChequeEntry[]) => void;
  /** Show status badge on existing cheques */
  showStatus?: boolean;
}

const STATUS_VARIANTS: Record<
  string,
  "warning" | "success" | "destructive" | "secondary"
> = {
  pending: "warning",
  cleared: "success",
  bounced: "destructive",
  cancelled: "secondary",
};

export function ChequeFormRows({
  cheques,
  onChange,
  showStatus = false,
}: ChequeFormRowsProps) {
  const t = useTranslations("cheques");
  const tc = useTranslations("common");

  const addRow = () => {
    onChange([
      ...cheques,
      {
        cheque_number: "",
        bank_name: "",
        cheque_date: "",
        amount: "",
      },
    ]);
  };

  const removeRow = (index: number) => {
    // Don't allow removing existing (saved) cheques — only new ones
    if (cheques[index].id) return;
    onChange(cheques.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof ChequeEntry, value: string) => {
    const updated = [...cheques];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  // Running total across all rows (display only)
  const total = cheques.reduce((sum, c) => {
    const n = parseFloat(c.amount);
    return Number.isNaN(n) ? sum : sum + n;
  }, 0);

  return (
    <div className="space-y-3">
      {cheques.map((cheque, index) => {
        const isExisting = Boolean(cheque.id);

        return (
          <div
            key={cheque.id || `new-${index}`}
            className={cn(
              "rounded-xl border p-4 space-y-4 transition-colors",
              isExisting
                ? "border-border/40 bg-surface-elevated/30"
                : "border-accent/20 bg-accent/5"
            )}
          >
            {/* Header row with index + status + delete */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText
                  aria-hidden="true"
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isExisting ? "text-text-secondary/50" : "text-accent"
                  )}
                />
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider truncate">
                  {t("title")}{" "}
                  <span className="font-mono ltr-nums">#{index + 1}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {showStatus && cheque.status && (
                  <Badge variant={STATUS_VARIANTS[cheque.status] ?? "secondary"}>
                    {t(`statuses.${cheque.status}`)}
                  </Badge>
                )}
                {!isExisting && (
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    aria-label={`${t("deleteCheque")} #${index + 1}`}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary cursor-pointer transition-colors hover:text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
                  >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Fields — identical column structure per row keeps the grid aligned */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Input
                label={t("chequeNumber")}
                value={cheque.cheque_number}
                onChange={(e) => updateRow(index, "cheque_number", e.target.value)}
                disabled={isExisting}
                required={!isExisting}
                placeholder="000000"
                className="font-mono ltr-nums"
              />

              <Input
                label={t("bankName")}
                value={cheque.bank_name}
                onChange={(e) => updateRow(index, "bank_name", e.target.value)}
                disabled={isExisting}
                required={!isExisting}
                placeholder={t("bankNamePlaceholder")}
              />

              <Input
                type="date"
                label={t("chequeDate")}
                value={cheque.cheque_date}
                onChange={(e) => updateRow(index, "cheque_date", e.target.value)}
                disabled={isExisting}
                required={!isExisting}
                className="font-mono ltr-nums"
              />

              <Input
                type="number"
                step="0.01"
                min="0.01"
                label={`${t("amount")} (${CURRENCY.code})`}
                value={cheque.amount}
                onChange={(e) => updateRow(index, "amount", e.target.value)}
                disabled={isExisting}
                required={!isExisting}
                placeholder="0.00"
                className="font-mono ltr-nums tabular-nums"
              />
            </div>
          </div>
        );
      })}

      {/* Count + running total — helps sanity-check a stack of post-dated cheques */}
      {cheques.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-surface-elevated/40 px-4 py-2.5">
          <span className="text-xs font-medium text-text-secondary">
            {t("title")}{" "}
            <span className="font-mono ltr-nums text-text-primary">
              {cheques.length}
            </span>
          </span>
          <span className="text-xs text-text-secondary">
            {tc("total")}:{" "}
            <span className="font-mono ltr-nums tabular-nums text-sm font-semibold text-text-primary">
              {formatCurrency(total)}
            </span>{" "}
            <span className="text-[10px]">{CURRENCY.code}</span>
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={addRow}
        className="w-full flex items-center justify-center gap-2 h-10 border-2 border-dashed border-border/60 rounded-xl text-sm font-medium text-text-secondary cursor-pointer hover:text-accent hover:border-accent/40 hover:bg-accent/5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        {t("addCheque")}
      </button>
    </div>
  );
}
