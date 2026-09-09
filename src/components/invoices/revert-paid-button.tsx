"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { Undo2 } from "lucide-react";
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
import { CURRENCY } from "@/lib/currency";
import {
  INVOICE_REVERT_SELECT,
  findInvoicePayments,
  revertInvoicePayment,
  type InvoiceForRevert,
  type InvoicePaymentCandidate,
} from "@/lib/invoices/revert-payment";
import { InvoicePaymentsPicker } from "./invoice-payments-picker";

interface RevertPaidButtonProps {
  invoiceId: string;
  amount: string;
  paidAmount?: string;
  tenantName: string;
}

/**
 * "Return to unpaid" — undoes a payment recorded by mistake. Deletes the
 * selected payment rows, re-opens any cheques the invoice retired, and puts
 * the invoice back to pending/overdue with paid_amount 0.
 */
export function RevertPaidButton({
  invoiceId,
  amount,
  paidAmount,
  tenantName,
}: RevertPaidButtonProps) {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceForRevert | null>(null);
  const [payments, setPayments] = useState<InvoicePaymentCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const totalAmount = Number(amount);
  const alreadyPaid = Number(paidAmount || 0);

  async function openDialog() {
    setOpen(true);
    setLoadingPayments(true);
    setLoadError(null);
    setReason("");
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
    // Exact matches are pre-selected; inferred ones need an explicit tick.
    setSelectedIds(found.filter((p) => p.linked).map((p) => p.id));
    setLoadingPayments(false);
  }

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleRevert() {
    if (!invoice) return;
    setLoading(true);
    const supabase = createClient();

    const result = await revertInvoicePayment(supabase, {
      invoice,
      paymentIds: selectedIds,
      target: "unpaid",
      reason,
    });

    if (result.ok) {
      await logAudit(supabase, {
        action: "revert_payment",
        entity_type: "invoice",
        entity_id: invoiceId,
        metadata: {
          new_status: result.new_status,
          deleted_payment_ids: result.deleted_payment_ids,
          reopened_cheques: result.reopened_cheque_count,
          reason: reason || null,
        },
      });
      setOpen(false);
      toast({ title: t("revert.success"), variant: "success" });
      router.refresh();
    } else {
      toast({
        title: t("revert.failed"),
        description: result.error,
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
        className="inline-flex items-center gap-1 h-7 px-2 text-text-secondary hover:text-warning text-xs rounded-md border border-border/50 hover:border-warning/30 hover:bg-warning/5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/40"
        title={t("revert.title")}
        aria-label={t("revert.title")}
      >
        <Undo2 className="h-3 w-3 rtl:rotate-180" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent maxWidth="max-w-md" className="flex max-h-[90vh] flex-col">
          <DialogHeader>
            <DialogTitle>{t("revert.title")}</DialogTitle>
            <DialogDescription>{t("revert.description")}</DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4 overflow-y-auto">
            <Alert variant="warning" className="text-xs">
              {t("revert.warning")}
            </Alert>

            {/* Invoice summary */}
            <div className="p-4 bg-surface-elevated/50 rounded-xl border border-border/40">
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
                    {t("paidAmount")}
                  </p>
                  <p className="text-lg font-bold font-mono tabular-nums ltr-nums text-text-primary">
                    {alreadyPaid.toLocaleString("en-OM", { minimumFractionDigits: 2 })}
                    <span className="text-xs font-sans font-normal text-text-secondary ms-1">
                      / {totalAmount.toLocaleString("en-OM", { minimumFractionDigits: 2 })}{" "}
                      {CURRENCY.code}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {loadError ? (
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
            )}

            {!loadingPayments && payments.length > 0 && selectedIds.length === 0 && (
              <p className="text-xs text-text-secondary">{t("revert.keepPaymentsHint")}</p>
            )}

            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              label={t("cancelReason")}
              placeholder={t("revert.reasonPlaceholder")}
              className="min-h-0 resize-none"
            />
          </DialogBody>

          <DialogFooter className="pt-4 border-t border-border/40">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRevert}
              loading={loading}
              disabled={loadingPayments || !invoice || !!loadError}
            >
              {!loading && <Undo2 className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />}
              {t("revert.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
