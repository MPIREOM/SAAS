"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import {
  Check,
  CreditCard,
  Banknote,
  FileCheck,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";

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

const METHOD_ICONS = {
  cash: Banknote,
  bank_transfer: CreditCard,
  cheque: FileCheck,
} as const;

export function MarkPaidButton({
  invoiceId,
  amount,
  tenantName,
  tenantId,
}: MarkPaidButtonProps) {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "cheque">(
    "cash"
  );
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

    // Fetch the invoice to get lease_id
    const { data: invoice } = await supabase
      .from("invoices")
      .select("lease_id, tenant_id, amount")
      .eq("id", invoiceId)
      .single();

    const { error } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_date: paidDate,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (!error && invoice) {
      // Build reference number from cheque if applicable
      const selectedCheque = cheques.find((c) => c.id === selectedChequeId);
      const referenceNumber =
        method === "cheque" && selectedCheque
          ? selectedCheque.cheque_number
          : null;

      // Insert a payment record
      await supabase.from("payments").insert({
        lease_id: invoice.lease_id,
        tenant_id: invoice.tenant_id,
        amount: invoice.amount,
        payment_date: paidDate,
        method,
        reference_number: referenceNumber,
        notes: notes || null,
      });

      setOpen(false);
      toast({ title: "Invoice marked as paid", variant: "success" });
      router.refresh();
    } else if (error) {
      toast({
        title: "Failed to mark invoice as paid",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  }

  const methods = [
    { key: "cash" as const, label: t("methods.cash") },
    { key: "bank_transfer" as const, label: t("methods.bankTransfer") },
    { key: "cheque" as const, label: t("methods.cheque") },
  ];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent/10 text-accent hover:bg-accent/20 rounded-lg transition-all duration-200 font-semibold group hover:shadow-sm hover:shadow-accent/10"
      >
        <Check className="h-3 w-3" />
        {t("markAsPaid")}
        <ChevronRight className="h-3 w-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent maxWidth="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("markAsPaid")}</DialogTitle>
            <DialogDescription>{t("confirmPayment")}</DialogDescription>
          </DialogHeader>

          <DialogBody>
            {/* Invoice summary card */}
            <div className="p-4 bg-surface-elevated/50 rounded-xl border border-border/40 mb-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-secondary uppercase tracking-wider font-medium mb-1">
                    {t("tenant")}
                  </p>
                  <p className="text-sm font-semibold text-text-primary">
                    {tenantName}
                  </p>
                </div>
                <div className="text-end">
                  <p className="text-xs text-text-secondary uppercase tracking-wider font-medium mb-1">
                    {t("amount")}
                  </p>
                  <p className="text-lg font-bold font-mono tabular-nums text-accent">
                    {Number(amount).toLocaleString("en-OM", {
                      minimumFractionDigits: 2,
                    })}
                    <span className="text-xs font-sans font-normal text-text-secondary ml-1">
                      OMR
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <form id="mark-paid-form" onSubmit={handleSubmit} className="space-y-4">
              {/* Payment Method Selector */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  {t("method")}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {methods.map((m) => {
                    const Icon = METHOD_ICONS[m.key];
                    const isActive = method === m.key;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setMethod(m.key)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all duration-200 ${
                          isActive
                            ? "bg-accent/10 border-accent/40 text-accent shadow-sm shadow-accent/10"
                            : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border hover:text-text-primary"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 ${
                            isActive ? "text-accent" : "text-text-secondary"
                          }`}
                        />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cheque selection */}
              {method === "cheque" && (
                <div className="animate-fade-in-up">
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                    {t("selectCheque")}
                  </label>
                  {loadingCheques ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : cheques.length === 0 ? (
                    <div className="p-3 rounded-xl bg-warning/5 border border-warning/20 text-sm text-warning">
                      {t("noPendingCheques")}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {cheques.map((ch) => {
                        const isSelected = selectedChequeId === ch.id;
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => setSelectedChequeId(ch.id)}
                            className={`w-full text-start p-3 rounded-xl border transition-all duration-200 ${
                              isSelected
                                ? "bg-accent/10 border-accent/40 shadow-sm shadow-accent/10"
                                : "bg-surface-elevated/50 border-border/40 hover:border-border"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-text-primary font-mono">
                                  #{ch.cheque_number}
                                </p>
                                <p className="text-xs text-text-secondary mt-0.5">
                                  {ch.bank_name} &middot; {ch.cheque_date}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold font-mono text-text-primary tabular-nums">
                                  {ch.amount} OMR
                                </span>
                                <div
                                  className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-all ${
                                    isSelected
                                      ? "border-accent bg-accent"
                                      : "border-border"
                                  }`}
                                >
                                  {isSelected && (
                                    <Check className="h-2.5 w-2.5 text-accent-foreground" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Paid Date */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  {t("paidAt")}
                </label>
                <input
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  required
                  className="w-full h-10 bg-surface-elevated/50 border border-border/60 rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  {t("notes")}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-surface-elevated/50 border border-border/60 rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200 resize-none"
                  placeholder="Optional notes..."
                />
              </div>
            </form>
          </DialogBody>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-10 px-5 bg-surface-elevated border border-border/60 text-text-primary text-sm font-medium rounded-xl hover:bg-surface-hover transition-colors"
            >
              {tc("cancel")}
            </button>
            <button
              type="submit"
              form="mark-paid-form"
              disabled={loading || (method === "cheque" && !selectedChequeId)}
              className="h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 disabled:opacity-40 shadow-sm shadow-accent/20 hover:shadow-md hover:shadow-accent/30 active:scale-[0.98] flex items-center gap-2"
            >
              {loading ? (
                <div className="h-4 w-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  {t("confirmPayment")}
                </>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
