"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { Ban } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { CURRENCY, formatAmount } from "@/lib/currency";
import {
  INVOICE_REVERT_SELECT,
  findInvoicePayments,
  revertInvoicePayment,
  type InvoiceForRevert,
  type InvoicePaymentCandidate,
} from "@/lib/invoices/revert-payment";
import { InvoicePaymentsPicker } from "./invoice-payments-picker";

interface CancelInvoiceButtonProps {
  invoiceId: string;
  amount: string;
  paidAmount?: string;
  tenantName: string;
}

export function CancelInvoiceButton({
  invoiceId,
  amount,
  paidAmount: existingPaidAmount,
  tenantName,
}: CancelInvoiceButtonProps) {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  // Only used when the invoice already has money recorded against it.
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceForRevert | null>(null);
  const [payments, setPayments] = useState<InvoicePaymentCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const totalAmount = Number(amount);
  const alreadyPaid = Number(existingPaidAmount || 0);
  const hasPayments = alreadyPaid > 0;

  async function openDialog() {
    setOpen(true);
    setReason("");
    setLoadError(null);
    if (!hasPayments) return;

    setLoadingPayments(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("invoices")
      .select(INVOICE_REVERT_SELECT)
      .eq("id", invoiceId)
      .single();
    if (error || !data) {
      setLoadError(error?.message || t("notFound"));
      setLoadingPayments(false);
      return;
    }
    const inv = data as unknown as InvoiceForRevert;
    setInvoice(inv);
    const found = await findInvoicePayments(supabase, inv);
    setPayments(found);
    setSelectedIds(found.filter((p) => p.linked).map((p) => p.id));
    setLoadingPayments(false);
  }

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleCancel() {
    setLoading(true);
    const supabase = createClient();

    let error: string | null = null;
    let deletedPaymentIds: string[] = [];

    if (hasPayments && invoice) {
      // Paid / partial invoice: remove the selected payments, then void it.
      const result = await revertInvoicePayment(supabase, {
        invoice,
        paymentIds: selectedIds,
        target: "cancelled",
        reason,
      });
      error = result.ok ? null : result.error || t("cancelFailed");
      deletedPaymentIds = result.deleted_payment_ids;
    } else {
      const cancelNote = reason ? `Cancelled: ${reason}` : "Cancelled manually";
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          status: "cancelled",
          notes: cancelNote,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);
      error = updateError?.message ?? null;
    }

    if (!error) {
      await logAudit(supabase, {
        action: "cancel_invoice",
        entity_type: "invoice",
        entity_id: invoiceId,
        metadata: hasPayments
          ? { deleted_payment_ids: deletedPaymentIds, reason: reason || null }
          : undefined,
      });

      setOpen(false);
      toast({
        title: t("invoiceCancelled"),
        variant: "success",
      });
      router.refresh();
    } else {
      toast({
        title: t("cancelFailed"),
        description: error,
        variant: "destructive",
      });
    }
    setLoading(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-1 h-7 px-2 text-text-secondary hover:text-destructive text-xs rounded-md border border-border hover:border-destructive/30 hover:bg-destructive-tint transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        title={t("cancelInvoice")}
        aria-label={t("cancelInvoice")}
      >
        <Ban className="h-3 w-3" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          maxWidth={hasPayments ? "max-w-md" : "max-w-sm"}
          className="flex max-h-[90vh] flex-col"
        >
          <DialogHeader>
            <DialogTitle>{t("cancelInvoice")}</DialogTitle>
            <DialogDescription>{t("cancelInvoiceDescription")}</DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4 overflow-y-auto">
            {/* Warning */}
            <Alert variant="destructive" className="text-xs">
              {hasPayments ? t("cancelPaidWarning") : t("cancelWarning")}
            </Alert>

            {/* Invoice summary */}
            <div className="p-4 bg-surface-elevated rounded-xl border border-border">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-text-secondary uppercase tracking-wider font-medium mb-1">
                    {t("tenant")}
                  </p>
                  <p className="text-sm font-semibold text-text-primary truncate">
                    {tenantName}
                  </p>
                </div>
                <div className="text-end shrink-0">
                  <p className="text-xs text-text-secondary uppercase tracking-wider font-medium mb-1">
                    {t("amount")}
                  </p>
                  <p className="text-lg font-bold tabular-nums ltr-nums text-text-primary">
                    {formatAmount(totalAmount)}
                    <span className="text-xs font-sans font-normal text-text-secondary ms-1">
                      {CURRENCY.code}
                    </span>
                  </p>
                  {alreadyPaid > 0 && (
                    <p className="text-xs text-warning mt-0.5">
                      {t("paidAmount")}:{" "}
                      <span className="tabular-nums ltr-nums">
                        {formatAmount(alreadyPaid)} {CURRENCY.code}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Payments recorded against the invoice */}
            {hasPayments &&
              (loadError ? (
                <Alert variant="destructive" className="text-xs">
                  {loadError}
                </Alert>
              ) : (
                <InvoicePaymentsPicker
                  loading={loadingPayments}
                  payments={payments}
                  selectedIds={selectedIds}
                  onToggle={toggle}
                />
              ))}

            {hasPayments && !loadingPayments && payments.length > 0 && selectedIds.length === 0 && (
              <p className="text-xs text-text-secondary">{t("revert.keepPaymentsHint")}</p>
            )}

            {/* Reason */}
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              label={t("cancelReason")}
              placeholder={t("cancelReasonPlaceholder")}
              className="min-h-0 resize-none"
            />
          </DialogBody>

          <DialogFooter className="pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              {tc("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancel}
              loading={loading}
              disabled={hasPayments && (loadingPayments || !invoice || !!loadError)}
            >
              {!loading && <Ban className="h-4 w-4" aria-hidden="true" />}
              {t("confirmCancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
