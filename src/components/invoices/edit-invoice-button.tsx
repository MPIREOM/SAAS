"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { CURRENCY } from "@/lib/currency";

interface EditInvoiceButtonProps {
  invoiceId: string;
  tenantName: string;
}

interface EditableInvoice {
  id: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
  status: string;
  paid_date: string | null;
  invoice_type: string | null;
}

/** Today's date in Oman (UTC+4), matching the invoice cron. */
const omanToday = () =>
  new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().split("T")[0];

/**
 * Status an invoice should have after its amount / due date changed, so the
 * paid / partial / pending / overdue buckets stay consistent with
 * paid_amount. Cancelled and written-off invoices keep their status.
 */
function recomputeStatus(
  current: string,
  amount: number,
  paid: number,
  dueDate: string,
): string {
  if (current === "cancelled" || current === "written_off") return current;
  if (paid > 0 && paid >= amount) return "paid";
  if (paid > 0) return "partial";
  return dueDate < omanToday() ? "overdue" : "pending";
}

/**
 * Edit an existing invoice's amount, due date, period and notes. Works for
 * every status; the status itself is recomputed from the new amount against
 * what has already been paid. Itemised (move-out) invoices keep their
 * amount, since it is the sum of their line items.
 */
export function EditInvoiceButton({ invoiceId, tenantName }: EditInvoiceButtonProps) {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [invoice, setInvoice] = useState<EditableInvoice | null>(null);

  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");

  async function openDialog() {
    setOpen(true);
    setError("");
    setLoadError(null);
    setInvoice(null);
    setLoadingInvoice(true);

    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from("invoices")
      .select(
        "id, amount, paid_amount, due_date, period_start, period_end, notes, status, paid_date, invoice_type",
      )
      .eq("id", invoiceId)
      .single();

    if (fetchError || !data) {
      setLoadError(fetchError?.message || t("notFound"));
      setLoadingInvoice(false);
      return;
    }
    const inv: EditableInvoice = {
      ...data,
      amount: Number(data.amount || 0),
      paid_amount: Number(data.paid_amount || 0),
    };
    setInvoice(inv);
    setAmount(String(inv.amount));
    setDueDate(inv.due_date);
    setPeriodStart(inv.period_start ?? "");
    setPeriodEnd(inv.period_end ?? "");
    setNotes(inv.notes ?? "");
    setLoadingInvoice(false);
  }

  const itemised = invoice?.invoice_type === "move_out";
  const amountNum = Number(amount);
  const nextStatus =
    invoice && Number.isFinite(amountNum)
      ? recomputeStatus(invoice.status, amountNum, invoice.paid_amount, dueDate)
      : null;
  const statusChanges = !!invoice && !!nextStatus && nextStatus !== invoice.status;

  function validate(): string | null {
    if (!(amountNum > 0)) return t("edit.errors.amountPositive");
    if (!dueDate) return t("edit.errors.dueDateRequired");
    if ((periodStart && !periodEnd) || (!periodStart && periodEnd))
      return t("edit.errors.periodBothOrNone");
    if (periodStart && periodEnd && periodEnd < periodStart)
      return t("edit.errors.periodEndAfterStart");
    return null;
  }

  async function handleSave() {
    if (!invoice || !nextStatus) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");

    const patch: Record<string, unknown> = {
      due_date: dueDate,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      notes: notes.trim() || null,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };
    if (!itemised) patch.amount = amountNum;
    if (nextStatus === "paid" && !invoice.paid_date) patch.paid_date = omanToday();
    if (nextStatus === "pending" || nextStatus === "overdue") patch.paid_date = null;

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("invoices")
      .update(patch)
      .eq("id", invoice.id);

    if (updateError) {
      setError(
        updateError.message.includes("invoices_lease_period_unique")
          ? t("invoicePeriodExists")
          : updateError.message,
      );
      setSaving(false);
      return;
    }

    await logAudit(supabase, {
      action: "edit_invoice",
      entity_type: "invoice",
      entity_id: invoice.id,
      metadata: {
        before: {
          amount: invoice.amount,
          due_date: invoice.due_date,
          period_start: invoice.period_start,
          period_end: invoice.period_end,
          notes: invoice.notes,
          status: invoice.status,
        },
        after: patch,
      },
    });

    setSaving(false);
    setOpen(false);
    toast({ title: t("edit.saved"), variant: "success" });
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-1 h-7 px-2 text-text-secondary hover:text-accent text-xs rounded-md border border-border/50 hover:border-accent/30 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        title={t("edit.title")}
        aria-label={t("edit.title")}
      >
        <Pencil className="h-3 w-3" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent maxWidth="max-w-md" className="flex max-h-[90vh] flex-col">
          <DialogHeader>
            <DialogTitle>{t("edit.title")}</DialogTitle>
            <DialogDescription>
              {tenantName}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4 overflow-y-auto">
            {loadingInvoice ? (
              <Spinner label={tc("loading")} className="min-h-[160px]" />
            ) : loadError ? (
              <Alert variant="destructive" className="text-xs">
                {loadError}
              </Alert>
            ) : invoice ? (
              <>
                {error && (
                  <Alert variant="destructive" className="text-xs">
                    {error}
                  </Alert>
                )}

                {(invoice.status === "paid" ||
                  invoice.status === "cancelled" ||
                  invoice.status === "written_off") && (
                  <Alert variant="warning" className="text-xs">
                    {t("edit.closedWarning", { status: t(invoice.status) })}
                  </Alert>
                )}

                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  label={`${t("amount")} (${CURRENCY.code})`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={itemised}
                  helperText={
                    itemised
                      ? t("edit.itemisedHint")
                      : invoice.paid_amount > 0
                        ? t("edit.paidSoFar", {
                            amount: invoice.paid_amount.toLocaleString("en-OM", {
                              minimumFractionDigits: 2,
                            }),
                            currency: CURRENCY.code,
                          })
                        : undefined
                  }
                  className="font-mono ltr-nums"
                />

                <Input
                  type="date"
                  label={t("dueDate")}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="ltr-nums"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    type="date"
                    label={t("periodStart")}
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="ltr-nums"
                  />
                  <Input
                    type="date"
                    label={t("periodEnd")}
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="ltr-nums"
                  />
                </div>

                <Textarea
                  label={t("notes")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="min-h-0 resize-none"
                />

                {statusChanges && nextStatus && (
                  <Alert variant="info" className="text-xs">
                    {t("edit.statusWillChange", {
                      from: t(invoice.status),
                      to: t(nextStatus),
                    })}
                  </Alert>
                )}
              </>
            ) : null}
          </DialogBody>

          <DialogFooter className="pt-4 border-t border-border/40">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              loading={saving}
              disabled={!invoice || loadingInvoice}
            >
              {!saving && <Pencil className="h-4 w-4" aria-hidden="true" />}
              {t("edit.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
