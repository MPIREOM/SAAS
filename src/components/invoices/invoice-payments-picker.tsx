"use client";

import { useTranslations } from "next-intl";
import { Check, Banknote, CreditCard, FileCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { CURRENCY } from "@/lib/currency";
import type { InvoicePaymentCandidate } from "@/lib/invoices/revert-payment";

const METHOD_ICONS: Record<string, typeof Banknote> = {
  cash: Banknote,
  bank_transfer: CreditCard,
  cheque: FileCheck,
};

interface InvoicePaymentsPickerProps {
  loading: boolean;
  payments: InvoicePaymentCandidate[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

/**
 * Lists the payments recorded against an invoice and lets the user pick
 * which ones to delete. Payments matched exactly (payments.invoice_id) are
 * pre-selected by the parent; heuristically matched ones show a warning so
 * the user double-checks before removing them.
 */
export function InvoicePaymentsPicker({
  loading,
  payments,
  selectedIds,
  onToggle,
}: InvoicePaymentsPickerProps) {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");

  if (loading) {
    return (
      <Spinner className="py-4" sizeClassName="h-4 w-4" label={tc("loading")} />
    );
  }

  if (payments.length === 0) {
    return (
      <Alert variant="info" className="text-xs">
        {t("revert.noPaymentsFound")}
      </Alert>
    );
  }

  const hasInferred = payments.some((p) => !p.linked);

  return (
    <div role="group" aria-label={t("revert.paymentsToRemove")} className="space-y-2">
      <span className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
        {t("revert.paymentsToRemove")}
      </span>
      {hasInferred && (
        <Alert variant="warning" className="text-xs">
          {t("revert.inferredWarning")}
        </Alert>
      )}
      <div className="space-y-2">
        {payments.map((p) => {
          const isSelected = selectedIds.includes(p.id);
          const Icon = METHOD_ICONS[p.method || ""] || Banknote;
          const methodLabel = p.method
            ? t(
                p.method === "bank_transfer"
                  ? "methods.bankTransfer"
                  : p.method === "cheque"
                    ? "methods.cheque"
                    : "methods.cash",
              )
            : "—";
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle(p.id)}
              aria-pressed={isSelected}
              className={`w-full text-start p-3 rounded-xl border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 ${
                isSelected
                  ? "bg-destructive/5 border-destructive/40"
                  : "bg-surface-elevated/50 border-border/40 hover:border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-text-secondary"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">
                      {methodLabel}
                      {p.reference_number && (
                        <span className="ms-1.5 text-xs font-mono ltr-nums text-text-secondary">
                          #{p.reference_number}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      <span className="font-mono ltr-nums">{p.payment_date}</span>
                      {!p.linked && (
                        <span className="ms-1.5 text-warning">
                          · {t("revert.inferredMatch")}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold font-mono text-text-primary tabular-nums ltr-nums">
                    {p.amount.toLocaleString("en-OM", { minimumFractionDigits: 2 })}{" "}
                    {CURRENCY.code}
                  </span>
                  <div
                    aria-hidden="true"
                    className={`h-4 w-4 rounded-md border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? "border-destructive bg-destructive"
                        : "border-border"
                    }`}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
