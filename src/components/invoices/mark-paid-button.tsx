"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Check, X } from "lucide-react";

interface Cheque {
  id: string;
  cheque_number: string;
  bank_name: string;
  cheque_date: string;
  amount: string;
  status: string;
}

interface MarkPaidButtonProps {
  invoiceId: string;
  amount: string;
  tenantName: string;
  tenantId: string;
}

export function MarkPaidButton({
  invoiceId,
  amount,
  tenantName,
  tenantId,
}: MarkPaidButtonProps) {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState("cash");
  const [paidDate, setPaidDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [selectedChequeId, setSelectedChequeId] = useState("");
  const [loadingCheques, setLoadingCheques] = useState(false);

  useEffect(() => {
    if (method === "cheque" && open) {
      setLoadingCheques(true);
      const supabase = createClient();
      supabase
        .from("cheques")
        .select("id, cheque_number, bank_name, cheque_date, amount, status")
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .order("cheque_date", { ascending: true })
        .then(({ data }) => {
          setCheques(data || []);
          setSelectedChequeId("");
          setLoadingCheques(false);
        });
    }
  }, [method, open, tenantId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();

    // If cheque method, update the cheque status to cleared
    if (method === "cheque" && selectedChequeId) {
      await supabase
        .from("cheques")
        .update({
          status: "cleared",
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedChequeId);
    }

    const { error } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_date: paidDate,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (!error) {
      setOpen(false);
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-accent/10 text-accent hover:bg-accent/20 rounded-md transition-colors font-medium"
      >
        <Check className="h-3 w-3" />
        {t("markAsPaid")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="relative bg-surface border border-border rounded-lg p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text-primary">
                {t("markAsPaid")}
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="text-text-secondary hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-surface-elevated rounded-md border border-border">
              <p className="text-sm text-text-primary font-medium">
                {tenantName}
              </p>
              <p className="text-lg font-semibold font-mono text-accent mt-1">
                {amount} OMR
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {t("method")}
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                >
                  <option value="cash">{t("methods.cash")}</option>
                  <option value="bank_transfer">
                    {t("methods.bankTransfer")}
                  </option>
                  <option value="cheque">{t("methods.cheque")}</option>
                </select>
              </div>

              {method === "cheque" && (
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">
                    {t("selectCheque")}
                  </label>
                  {loadingCheques ? (
                    <p className="text-sm text-text-secondary">{tc("loading")}</p>
                  ) : cheques.length === 0 ? (
                    <p className="text-sm text-warning">{t("noPendingCheques")}</p>
                  ) : (
                    <>
                      <select
                        value={selectedChequeId}
                        onChange={(e) => setSelectedChequeId(e.target.value)}
                        required
                        className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                      >
                        <option value="">{t("chooseCheque")}</option>
                        {cheques.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            #{ch.cheque_number} — {ch.bank_name} — {ch.amount} OMR — {ch.cheque_date}
                          </option>
                        ))}
                      </select>
                      {selectedChequeId && (() => {
                        const ch = cheques.find((c) => c.id === selectedChequeId);
                        if (!ch) return null;
                        return (
                          <div className="mt-2 p-2.5 bg-surface-elevated rounded-md border border-border text-sm space-y-1">
                            <p className="text-text-primary font-medium">
                              {t("chequeNo")}: {ch.cheque_number}
                            </p>
                            <p className="text-text-secondary">
                              {t("bank")}: {ch.bank_name}
                            </p>
                            <p className="text-text-secondary">
                              {t("chequeDate")}: {ch.cheque_date}
                            </p>
                            <p className="text-text-primary font-mono font-semibold">
                              {ch.amount} OMR
                            </p>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {t("paidAt")}
                </label>
                <input
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  required
                  className="w-full h-10 bg-surface-elevated border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  {t("notes")}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-surface-elevated border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="h-9 px-4 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  {loading ? tc("loading") : t("confirmPayment")}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-9 px-4 bg-surface-elevated border border-border text-text-primary text-sm rounded-md hover:bg-border/30 transition-colors"
                >
                  {tc("cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
