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
import { CURRENCY } from "@/lib/currency";

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

  const totalAmount = Number(amount);
  const alreadyPaid = Number(existingPaidAmount || 0);

  async function handleCancel() {
    setLoading(true);
    const supabase = createClient();

    const cancelNote = reason
      ? `Cancelled: ${reason}`
      : "Cancelled manually";

    const { error } = await supabase
      .from("invoices")
      .update({
        status: "cancelled",
        notes: cancelNote,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (!error) {
      await logAudit(supabase, {
        action: "cancel_invoice",
        entity_type: "invoice",
        entity_id: invoiceId,
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
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 h-7 px-2 text-text-secondary hover:text-destructive text-xs rounded-md border border-border/50 hover:border-destructive/30 hover:bg-destructive/5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
        title={t("cancelInvoice")}
        aria-label={t("cancelInvoice")}
      >
        <Ban className="h-3 w-3" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent maxWidth="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("cancelInvoice")}</DialogTitle>
            <DialogDescription>{t("cancelInvoiceDescription")}</DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {/* Warning */}
            <Alert variant="destructive" className="text-xs">
              {t("cancelWarning")}
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
                    {t("amount")}
                  </p>
                  <p className="text-lg font-bold font-mono tabular-nums ltr-nums text-text-primary">
                    {totalAmount.toLocaleString("en-OM", {
                      minimumFractionDigits: 2,
                    })}
                    <span className="text-xs font-sans font-normal text-text-secondary ms-1">
                      {CURRENCY.code}
                    </span>
                  </p>
                  {alreadyPaid > 0 && (
                    <p className="text-[10px] text-warning mt-0.5">
                      {t("paidAmount")}:{" "}
                      <span className="font-mono ltr-nums">
                        {alreadyPaid.toLocaleString("en-OM", { minimumFractionDigits: 2 })} {CURRENCY.code}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>

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

          <DialogFooter>
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
