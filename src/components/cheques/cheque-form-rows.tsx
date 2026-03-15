"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, FileText, Hash, Building2, Calendar, Banknote } from "lucide-react";

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

export function ChequeFormRows({
  cheques,
  onChange,
  showStatus = false,
}: ChequeFormRowsProps) {
  const t = useTranslations("cheques");

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

  const statusColors: Record<string, string> = {
    pending: "bg-warning/10 text-warning",
    cleared: "bg-success/10 text-success",
    bounced: "bg-destructive/10 text-destructive",
    cancelled: "bg-text-secondary/10 text-text-secondary",
  };

  return (
    <div className="space-y-3">
      {cheques.map((cheque, index) => {
        const isExisting = Boolean(cheque.id);

        return (
          <div
            key={cheque.id || `new-${index}`}
            className={`border rounded-xl p-4 space-y-3 transition-colors ${
              isExisting
                ? "border-border/40 bg-surface-elevated/30"
                : "border-accent/20 bg-accent/5"
            }`}
          >
            {/* Header row with index + status + delete */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className={`h-3.5 w-3.5 ${isExisting ? "text-text-secondary/50" : "text-accent"}`} />
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  {t("title")} #{index + 1}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {showStatus && cheque.status && (
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg capitalize ${
                      statusColors[cheque.status] || ""
                    }`}
                  >
                    {t(`statuses.${cheque.status}`)}
                  </span>
                )}
                {!isExisting && (
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="p-1 rounded-lg text-text-secondary hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  {t("chequeNumber")}
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary/40" />
                  <input
                    value={cheque.cheque_number}
                    onChange={(e) => updateRow(index, "cheque_number", e.target.value)}
                    disabled={isExisting}
                    required={!isExisting}
                    className="w-full h-9 bg-surface-elevated/50 border border-border/60 rounded-lg pl-8 pr-3 text-sm text-text-primary font-mono focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-text-secondary/40"
                    placeholder="000000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  {t("bankName")}
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary/40" />
                  <input
                    value={cheque.bank_name}
                    onChange={(e) => updateRow(index, "bank_name", e.target.value)}
                    disabled={isExisting}
                    required={!isExisting}
                    className="w-full h-9 bg-surface-elevated/50 border border-border/60 rounded-lg pl-8 pr-3 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-text-secondary/40"
                    placeholder="Bank name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  {t("chequeDate")}
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary/40" />
                  <input
                    type="date"
                    value={cheque.cheque_date}
                    onChange={(e) => updateRow(index, "cheque_date", e.target.value)}
                    disabled={isExisting}
                    required={!isExisting}
                    className="w-full h-9 bg-surface-elevated/50 border border-border/60 rounded-lg pl-8 pr-3 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  {t("amount")} (OMR)
                </label>
                <div className="relative">
                  <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary/40" />
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={cheque.amount}
                    onChange={(e) => updateRow(index, "amount", e.target.value)}
                    disabled={isExisting}
                    required={!isExisting}
                    className="w-full h-9 bg-surface-elevated/50 border border-border/60 rounded-lg pl-8 pr-3 text-sm text-text-primary font-mono tabular-nums focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-text-secondary/40"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRow}
        className="w-full flex items-center justify-center gap-2 h-10 border-2 border-dashed border-border/60 rounded-xl text-sm font-medium text-text-secondary hover:text-accent hover:border-accent/40 hover:bg-accent/5 transition-all duration-200"
      >
        <Plus className="h-4 w-4" />
        {t("addCheque")}
      </button>
    </div>
  );
}
