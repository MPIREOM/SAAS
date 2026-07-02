"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import {
  Check,
  CreditCard,
  Banknote,
  FileCheck,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { CURRENCY } from "@/lib/currency";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

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
  paidAmount?: string;
  tenantName: string;
  tenantId: string;
  periodStart?: string;
  periodEnd?: string;
  dueDate?: string;
}

const METHOD_ICONS = {
  cash: Banknote,
  bank_transfer: CreditCard,
  cheque: FileCheck,
} as const;

export function MarkPaidButton({
  invoiceId,
  amount,
  paidAmount: existingPaidAmount,
  tenantName,
  tenantId,
  periodStart,
  periodEnd,
  dueDate,
}: MarkPaidButtonProps) {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const tch = useTranslations("cheques");
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "cheque">(
    "cash"
  );
  const [paymentType, setPaymentType] = useState<"full" | "partial" | "advance">("full");
  const [partialAmount, setPartialAmount] = useState("");
  const [advanceMonths, setAdvanceMonths] = useState(3);
  const [paidDate, setPaidDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [selectedChequeId, setSelectedChequeId] = useState("");
  const [loadingCheques, setLoadingCheques] = useState(false);
  const [addNewCheque, setAddNewCheque] = useState(false);
  // Paid by cheque, but no cheque to record on our side — used when the
  // tenant handed the cheque directly to the owner. The payment still goes
  // in with method="cheque" so the owner ledger treats it as "direct to
  // owner" (no balance impact) while still applying the 9% commission for
  // percentage-rate units.
  const [noChequeOnFile, setNoChequeOnFile] = useState(false);
  const [showAllCheques, setShowAllCheques] = useState(false);
  const [newChequeNumber, setNewChequeNumber] = useState("");
  const [newChequeBankName, setNewChequeBankName] = useState("");
  const [newChequeDate, setNewChequeDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [newChequeAmount, setNewChequeAmount] = useState("");

  const totalAmount = Number(amount);
  const alreadyPaid = Number(existingPaidAmount || 0);
  const remainingAmount = totalAmount - alreadyPaid;

  // Cheques are considered "relevant" to this invoice when their date falls
  // inside the invoice period (preferred) or within ±15 days of the due date.
  // This stops a tenant's 12-month batch of post-dated cheques from flooding
  // the picker when paying a single month.
  function shiftDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  }
  const windowStart =
    periodStart || (dueDate ? shiftDays(dueDate, -15) : null);
  const windowEnd =
    periodEnd || (dueDate ? shiftDays(dueDate, 15) : null);
  const isRelevantCheque = (chequeDate: string) => {
    if (!windowStart || !windowEnd) return true;
    return chequeDate >= windowStart && chequeDate <= windowEnd;
  };
  const relevantCheques = cheques.filter((c) => isRelevantCheque(c.cheque_date));
  const displayedCheques = showAllCheques ? cheques : relevantCheques;
  const hiddenChequeCount = cheques.length - relevantCheques.length;

  useEffect(() => {
    if (method === "cheque" && open) {
      setLoadingCheques(true);
      setAddNewCheque(false);
      setNoChequeOnFile(false);
      setShowAllCheques(false);
      const supabase = createClient();
      supabase
        .from("cheques")
        .select("id, cheque_number, bank_name, cheque_date, amount, status")
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .order("cheque_date", { ascending: true })
        .then(({ data }) => {
          const all = data || [];
          setCheques(all);
          // Auto-select the single in-window match if there's exactly one.
          const inWindow = all.filter((c) => isRelevantCheque(c.cheque_date));
          setSelectedChequeId(inWindow.length === 1 ? inWindow[0].id : "");
          // No auto-jump to "add new" anymore — the user might just want to
          // record the payment as method="cheque" (direct to owner) without
          // tracking an actual cheque. They'll pick a path from the toggles.
          setLoadingCheques(false);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, open, tenantId, periodStart, periodEnd, dueDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();

    const { data: invoice } = await supabase
      .from("invoices")
      .select("lease_id, tenant_id, unit_id, amount, paid_amount, due_date, period_start, period_end")
      .eq("id", invoiceId)
      .single();

    if (!invoice) {
      toast({ title: t("notFound"), variant: "destructive" });
      setLoading(false);
      return;
    }

    const currentPaidAmount = Number(invoice.paid_amount || 0);
    const invoiceTotal = Number(invoice.amount || 0);
    const actualRemaining = Math.max(invoiceTotal - currentPaidAmount, 0);

    // For advance payments, pay full amount of current invoice + generate future ones
    const paymentAmount =
      paymentType === "full" || paymentType === "advance"
        ? actualRemaining
        : Math.min(Number(partialAmount), actualRemaining);

    if (paymentAmount <= 0) {
      toast({
        title: t("alreadyFullyPaid"),
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const newPaidAmount = currentPaidAmount + paymentAmount;
    const isFullyPaid = newPaidAmount >= invoiceTotal;

    // Mark current invoice as paid
    const { error } = await supabase
      .from("invoices")
      .update({
        status: isFullyPaid ? "paid" : "partial",
        paid_amount: newPaidAmount,
        paid_date: isFullyPaid ? paidDate : null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (!error) {
      const selectedCheque = cheques.find((c) => c.id === selectedChequeId);
      const referenceNumber =
        method === "cheque" && selectedCheque
          ? selectedCheque.cheque_number
          : method === "cheque" && addNewCheque
          ? newChequeNumber
          : null;

      // Calculate total payment amount (current + advance months)
      const totalPaymentAmount = paymentType === "advance"
        ? paymentAmount + (invoiceTotal * (advanceMonths - 1))
        : paymentAmount;

      const { data: paymentData } = await supabase
        .from("payments")
        .insert({
          lease_id: invoice.lease_id,
          tenant_id: invoice.tenant_id,
          amount: totalPaymentAmount,
          payment_date: paidDate,
          method,
          reference_number: referenceNumber,
          notes: paymentType === "advance"
            ? `Advance payment for ${advanceMonths} months${notes ? ` — ${notes}` : ""}`
            : notes || null,
        })
        .select("id")
        .single();

      if (method === "cheque" && selectedChequeId) {
        await supabase
          .from("cheques")
          .update({
            status: "cleared",
            payment_id: paymentData?.id || null,
            invoice_id: invoiceId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", selectedChequeId);
      } else if (method === "cheque" && addNewCheque && newChequeNumber) {
        await supabase
          .from("cheques")
          .insert({
            tenant_id: invoice.tenant_id,
            payment_id: paymentData?.id || null,
            invoice_id: invoiceId,
            cheque_number: newChequeNumber,
            bank_name: newChequeBankName,
            cheque_date: newChequeDate,
            amount: totalPaymentAmount,
            status: "cleared",
          });
      }
      // noChequeOnFile === true → no cheque row created or updated;
      // the payment carries method="cheque" so the owner ledger flags it
      // as paid-direct-to-owner with no company balance impact.

      // When the invoice is fully paid by any method, retire any pending
      // cheques tied to it so they stop showing up on the daily briefing.
      if (isFullyPaid) {
        // Already-linked pending cheques → cancel.
        await supabase
          .from("cheques")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("invoice_id", invoiceId)
          .eq("status", "pending");

        // Unlinked pending cheques sitting in this invoice's period for this
        // tenant → link to this invoice and cancel.
        if (invoice.period_start && invoice.period_end) {
          await supabase
            .from("cheques")
            .update({
              invoice_id: invoiceId,
              status: "cancelled",
              updated_at: new Date().toISOString(),
            })
            .eq("tenant_id", invoice.tenant_id)
            .eq("status", "pending")
            .is("invoice_id", null)
            .gte("cheque_date", invoice.period_start)
            .lte("cheque_date", invoice.period_end);
        }
      }

      // Handle advance payment: generate and mark future invoices as paid
      if (paymentType === "advance" && isFullyPaid) {
        const baseDate = invoice.due_date
          ? new Date(invoice.due_date)
          : new Date();

        for (let i = 1; i < advanceMonths; i++) {
          const futureDate = new Date(baseDate);
          futureDate.setMonth(futureDate.getMonth() + i);
          const futureDueDate = futureDate.toISOString().split("T")[0];

          const futurePeriodStart = new Date(futureDate.getFullYear(), futureDate.getMonth(), 1)
            .toISOString().split("T")[0];
          const futurePeriodEnd = new Date(futureDate.getFullYear(), futureDate.getMonth() + 1, 0)
            .toISOString().split("T")[0];

          // Check if invoice already exists for this period
          const { data: existing } = await supabase
            .from("invoices")
            .select("id, status, paid_amount")
            .eq("lease_id", invoice.lease_id)
            .eq("period_start", futurePeriodStart)
            .maybeSingle();

          let advanceInvoiceId: string | null = null;
          if (existing) {
            advanceInvoiceId = existing.id;
            // Mark existing invoice as paid
            await supabase
              .from("invoices")
              .update({
                status: "paid",
                paid_amount: invoiceTotal,
                paid_date: paidDate,
                notes: t("paidInAdvanceNote", { months: advanceMonths }),
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
          } else {
            // Create future invoice and mark as paid
            const { data: inserted } = await supabase.from("invoices").insert({
              lease_id: invoice.lease_id,
              tenant_id: invoice.tenant_id,
              unit_id: invoice.unit_id,
              amount: invoiceTotal,
              due_date: futureDueDate,
              issued_date: paidDate,
              period_start: futurePeriodStart,
              period_end: futurePeriodEnd,
              status: "paid",
              paid_amount: invoiceTotal,
              paid_date: paidDate,
              notes: `Paid in advance (${advanceMonths} months)`,
            }).select("id").single();
            advanceInvoiceId = inserted?.id || null;
          }

          // Retire pending cheques that sit in this advance-paid period.
          if (advanceInvoiceId) {
            await supabase
              .from("cheques")
              .update({ status: "cancelled", updated_at: new Date().toISOString() })
              .eq("invoice_id", advanceInvoiceId)
              .eq("status", "pending");

            await supabase
              .from("cheques")
              .update({
                invoice_id: advanceInvoiceId,
                status: "cancelled",
                updated_at: new Date().toISOString(),
              })
              .eq("tenant_id", invoice.tenant_id)
              .eq("status", "pending")
              .is("invoice_id", null)
              .gte("cheque_date", futurePeriodStart)
              .lte("cheque_date", futurePeriodEnd);
          }
        }
      }

      await logAudit(supabase, {
        action: paymentType === "advance" ? "advance_payment" : isFullyPaid ? "mark_paid" : "partial_payment",
        entity_type: "invoice",
        entity_id: invoiceId,
      });

      setOpen(false);
      toast({
        title:
          paymentType === "advance"
            ? t("advancePaymentRecorded", { months: advanceMonths })
            : isFullyPaid
            ? t("markedAsPaid")
            : t("partialPaymentRecorded", {
                amount: paymentAmount.toFixed(2),
                code: CURRENCY.code,
              }),
        variant: "success",
      });
      router.refresh();
    } else {
      toast({
        title: t("recordPaymentFailed"),
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
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent/10 text-accent hover:bg-accent/20 rounded-lg transition-all duration-200 font-semibold group cursor-pointer hover:shadow-sm hover:shadow-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <Check className="h-3 w-3" aria-hidden="true" />
        {alreadyPaid > 0 ? (
          <>
            {t("markAsPaid")}{" "}
            <span className="font-mono tabular-nums ltr-nums">
              ({remainingAmount.toFixed(2)})
            </span>
          </>
        ) : (
          t("markAsPaid")
        )}
        <ChevronRight
          className="h-3 w-3 opacity-0 -ms-1 group-hover:opacity-100 group-hover:ms-0 transition-all duration-200 rtl:rotate-180"
          aria-hidden="true"
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent maxWidth="max-w-md" className="flex max-h-[90vh] flex-col">
          <DialogHeader>
            <DialogTitle>{t("markAsPaid")}</DialogTitle>
            <DialogDescription>{t("confirmPayment")}</DialogDescription>
          </DialogHeader>

          <DialogBody className="overflow-y-auto">
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
                    {alreadyPaid > 0 ? t("remaining") : t("amount")}
                  </p>
                  <p className="text-lg font-bold font-mono tabular-nums ltr-nums text-accent">
                    {remainingAmount.toLocaleString("en-OM", {
                      minimumFractionDigits: 2,
                    })}
                    <span className="text-xs font-sans font-normal text-text-secondary ms-1">
                      {CURRENCY.code}
                    </span>
                  </p>
                  {alreadyPaid > 0 && (
                    <p className="text-[10px] text-text-secondary mt-0.5">
                      {t("paidAmount")}:{" "}
                      <span className="font-mono ltr-nums">
                        {alreadyPaid.toLocaleString("en-OM", { minimumFractionDigits: 2 })} / {totalAmount.toLocaleString("en-OM", { minimumFractionDigits: 2 })}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            <form id="mark-paid-form" onSubmit={handleSubmit} className="space-y-4">
              {/* Payment Type Toggle */}
              <div role="group" aria-label={t("paymentType")}>
                <span className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  {t("paymentType")}
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "full" as const, label: t("fullPayment") },
                    { key: "partial" as const, label: t("partialPayment") },
                    { key: "advance" as const, label: t("advancePayment") },
                  ].map((pt) => (
                    <button
                      key={pt.key}
                      type="button"
                      onClick={() => setPaymentType(pt.key)}
                      aria-pressed={paymentType === pt.key}
                      className={`flex items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                        paymentType === pt.key
                          ? "bg-accent/10 border-accent/40 text-accent shadow-sm shadow-accent/10"
                          : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border hover:text-text-primary"
                      }`}
                    >
                      {pt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Partial Amount Input */}
              {paymentType === "partial" && (
                <div className="animate-fade-in-up">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={remainingAmount}
                    value={partialAmount}
                    onChange={(e) => setPartialAmount(e.target.value)}
                    required
                    label={`${t("paidAmount")} (${CURRENCY.code})`}
                    placeholder={t("maxAmountPlaceholder", {
                      amount: remainingAmount.toFixed(2),
                    })}
                    className="font-mono ltr-nums"
                    helperText={
                      partialAmount && Number(partialAmount) > 0
                        ? `${t("remaining")}: ${Math.max(remainingAmount - Number(partialAmount), 0).toLocaleString("en-OM", { minimumFractionDigits: 2 })} ${CURRENCY.code}`
                        : undefined
                    }
                  />
                </div>
              )}

              {/* Advance Months Selector */}
              {paymentType === "advance" && (
                <div className="animate-fade-in-up" role="group" aria-label={t("numberOfMonths")}>
                  <span className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                    {t("numberOfMonths")}
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    {[2, 3, 6, 12].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setAdvanceMonths(m)}
                        aria-pressed={advanceMonths === m}
                        className={`flex items-center justify-center p-3 rounded-xl border text-sm font-semibold font-mono ltr-nums transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                          advanceMonths === m
                            ? "bg-accent/10 border-accent/40 text-accent shadow-sm shadow-accent/10"
                            : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border hover:text-text-primary"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 p-3 rounded-xl bg-accent/5 border border-accent/20">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-text-secondary">{t("totalAdvanceAmount")}</span>
                      <span className="font-mono font-bold text-accent tabular-nums ltr-nums">
                        {(remainingAmount + totalAmount * (advanceMonths - 1)).toLocaleString("en-OM", { minimumFractionDigits: 2 })} {CURRENCY.code}
                      </span>
                    </div>
                    <p className="text-[10px] text-text-secondary mt-1">
                      <span className="ltr-nums">{remainingAmount.toLocaleString("en-OM", { minimumFractionDigits: 2 })}</span> ({t("currentMonth")}) + <span className="ltr-nums">{(totalAmount * (advanceMonths - 1)).toLocaleString("en-OM", { minimumFractionDigits: 2 })}</span> ({advanceMonths - 1} {t("futureMonths")})
                    </p>
                  </div>
                </div>
              )}

              {/* Payment Method Selector */}
              <div role="group" aria-label={t("method")}>
                <span className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  {t("method")}
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {methods.map((m) => {
                    const Icon = METHOD_ICONS[m.key];
                    const isActive = method === m.key;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setMethod(m.key)}
                        aria-pressed={isActive}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                          isActive
                            ? "bg-accent/10 border-accent/40 text-accent shadow-sm shadow-accent/10"
                            : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border hover:text-text-primary"
                        }`}
                      >
                        <Icon
                          aria-hidden="true"
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
                <div className="animate-fade-in-up space-y-3">
                  {loadingCheques ? (
                    <Spinner
                      className="py-4"
                      sizeClassName="h-4 w-4"
                      label={tc("loading")}
                    />
                  ) : (
                    <>
                      {/* Mode toggle: pick existing / add new / no cheque */}
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          disabled={cheques.length === 0}
                          onClick={() => {
                            setAddNewCheque(false);
                            setNoChequeOnFile(false);
                          }}
                          aria-pressed={!addNewCheque && !noChequeOnFile}
                          className={`p-2.5 rounded-xl border text-xs font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                            !addNewCheque && !noChequeOnFile
                              ? "bg-accent/10 border-accent/40 text-accent"
                              : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                          }`}
                        >
                          {t("selectCheque")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddNewCheque(true);
                            setNoChequeOnFile(false);
                            setSelectedChequeId("");
                          }}
                          aria-pressed={addNewCheque}
                          className={`p-2.5 rounded-xl border text-xs font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                            addNewCheque
                              ? "bg-accent/10 border-accent/40 text-accent"
                              : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border hover:text-text-primary"
                          }`}
                        >
                          {tch("addCheque")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNoChequeOnFile(true);
                            setAddNewCheque(false);
                            setSelectedChequeId("");
                          }}
                          aria-pressed={noChequeOnFile}
                          className={`p-2.5 rounded-xl border text-xs font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                            noChequeOnFile
                              ? "bg-accent/10 border-accent/40 text-accent"
                              : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border hover:text-text-primary"
                          }`}
                          title={t("paidToOwnerTooltip")}
                        >
                          {t("paidToOwner")}
                        </button>
                      </div>

                      {/* Direct-to-owner mode: explainer card */}
                      {noChequeOnFile && (
                        <Alert variant="info" className="text-xs animate-fade-in-up">
                          {t("paidToOwnerHint")}
                        </Alert>
                      )}

                      {/* Existing cheques list */}
                      {displayedCheques.length > 0 && !addNewCheque && !noChequeOnFile && (
                        <div role="group" aria-label={t("selectCheque")}>
                          <span className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                            {t("selectCheque")}
                          </span>
                          <div className="space-y-2">
                            {displayedCheques.map((ch) => {
                              const isSelected = selectedChequeId === ch.id;
                              return (
                                <button
                                  key={ch.id}
                                  type="button"
                                  onClick={() => setSelectedChequeId(ch.id)}
                                  aria-pressed={isSelected}
                                  className={`w-full text-start p-3 rounded-xl border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                                    isSelected
                                      ? "bg-accent/10 border-accent/40 shadow-sm shadow-accent/10"
                                      : "bg-surface-elevated/50 border-border/40 hover:border-border"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-text-primary font-mono ltr-nums">
                                        #{ch.cheque_number}
                                      </p>
                                      <p className="text-xs text-text-secondary mt-0.5">
                                        {ch.bank_name} &middot;{" "}
                                        <span className="font-mono ltr-nums">{ch.cheque_date}</span>
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-sm font-bold font-mono text-text-primary tabular-nums ltr-nums">
                                        {ch.amount} {CURRENCY.code}
                                      </span>
                                      <div
                                        aria-hidden="true"
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
                        </div>
                      )}

                      {/* No in-window matches, but tenant has other pending cheques */}
                      {!addNewCheque && !noChequeOnFile && displayedCheques.length === 0 && cheques.length > 0 && (
                        <Alert variant="info" className="text-xs">
                          {t("noChequesMatchPeriod")}
                        </Alert>
                      )}

                      {/* Show all / only-matching toggle when some cheques were hidden */}
                      {!addNewCheque && !noChequeOnFile && hiddenChequeCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowAllCheques(!showAllCheques);
                            setSelectedChequeId("");
                          }}
                          className="w-full text-xs text-text-secondary hover:text-text-primary font-medium py-2 border border-dashed border-border/60 rounded-xl hover:border-border hover:bg-surface-elevated/50 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                        >
                          {showAllCheques
                            ? t("showOnlyPeriodCheques")
                            : t("showAllPendingCheques", {
                                total: cheques.length,
                                hidden: hiddenChequeCount,
                              })}
                        </button>
                      )}

                      {/* New cheque form */}
                      {addNewCheque && (
                        <div className="space-y-3 animate-fade-in-up">
                          {cheques.length === 0 && (
                            <Alert variant="info" className="text-xs">
                              {t("noPendingCheques")}
                            </Alert>
                          )}
                          <span className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
                            {tch("addCheque")}
                          </span>
                          <Input
                            type="text"
                            value={newChequeNumber}
                            onChange={(e) => setNewChequeNumber(e.target.value)}
                            required
                            label={tch("chequeNumber")}
                            placeholder={t("chequeNumberPlaceholder")}
                            className="font-mono ltr-nums"
                          />
                          <Input
                            type="text"
                            value={newChequeBankName}
                            onChange={(e) => setNewChequeBankName(e.target.value)}
                            required
                            label={tch("bankName")}
                            placeholder={tch("bankNamePlaceholder")}
                          />
                          <Input
                            type="date"
                            value={newChequeDate}
                            onChange={(e) => setNewChequeDate(e.target.value)}
                            required
                            label={t("chequeDate")}
                            className="font-mono ltr-nums"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Paid Date */}
              <Input
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                required
                label={t("paidAt")}
                className="font-mono ltr-nums"
              />

              {/* Notes */}
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                label={t("notes")}
                placeholder={t("optionalNotes")}
                className="min-h-0 resize-none"
              />
            </form>
          </DialogBody>

          <DialogFooter className="pt-4 border-t border-border/40">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              {tc("cancel")}
            </Button>
            <Button
              type="submit"
              form="mark-paid-form"
              loading={loading}
              disabled={
                (method === "cheque" && !selectedChequeId && !addNewCheque && !noChequeOnFile) ||
                (method === "cheque" && addNewCheque && (!newChequeNumber || !newChequeBankName)) ||
                (paymentType === "partial" && (!partialAmount || Number(partialAmount) <= 0))
              }
            >
              {!loading && <Check className="h-4 w-4" aria-hidden="true" />}
              {t("confirmPayment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
