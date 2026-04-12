"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { Ban, AlertTriangle } from "lucide-react";
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
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 h-7 px-2 text-text-secondary hover:text-destructive text-xs rounded-md border border-border/50 hover:border-destructive/30 transition-colors"
        title={t("cancelInvoice")}
      >
        <Ban className="h-3 w-3" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent maxWidth="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("cancelInvoice")}</DialogTitle>
            <DialogDescription>{t("cancelInvoiceDescription")}</DialogDescription>
          </DialogHeader>

          <DialogBody>
            {/* Warning */}
            <div className="flex items-start gap-3 p-3 bg-destructive/5 border border-destructive/20 rounded-xl mb-4">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive/90">
                {t("cancelWarning")}
              </p>
            </div>

            {/* Invoice summary */}
            <div className="p-4 bg-surface-elevated/50 rounded-xl border border-border/40 mb-4">
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
                  <p className="text-lg font-bold font-mono tabular-nums text-text-primary">
                    {totalAmount.toLocaleString("en-OM", {
                      minimumFractionDigits: 2,
                    })}
                    <span className="text-xs font-sans font-normal text-text-secondary ms-1">
                      {CURRENCY.code}
                    </span>
                  </p>
                  {alreadyPaid > 0 && (
                    <p className="text-[10px] text-warning mt-0.5">
                      {t("paidAmount")}: {alreadyPaid.toLocaleString("en-OM", { minimumFractionDigits: 2 })} {CURRENCY.code}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                {t("cancelReason")}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full bg-surface-elevated/50 border border-border/60 rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200 resize-none"
                placeholder={t("cancelReasonPlaceholder")}
              />
            </div>
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
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="h-10 px-5 bg-destructive hover:bg-destructive/90 text-white text-sm font-semibold rounded-xl transition-all duration-200 disabled:opacity-40 shadow-sm shadow-destructive/20 hover:shadow-md hover:shadow-destructive/30 active:scale-[0.98] flex items-center gap-2"
            >
              {loading ? (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Ban className="h-4 w-4" />
                  {t("confirmCancel")}
                </>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
