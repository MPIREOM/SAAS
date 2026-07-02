"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { Plus } from "lucide-react";
import { CURRENCY } from "@/lib/currency";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AddChequeDialogProps {
  tenantId: string;
}

export function AddChequeDialog({ tenantId }: AddChequeDialogProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const t = useTranslations("cheques");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const form = new FormData(e.currentTarget);
    const chequeNumber = form.get("cheque_number") as string;
    const bankName = form.get("bank_name") as string;
    const chequeDate = form.get("cheque_date") as string;
    const amount = form.get("amount") as string;

    if (!chequeNumber || !bankName || !chequeDate || !amount) {
      toast({ title: t("fillAllFields"), variant: "destructive" });
      setSaving(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("cheques").insert({
      tenant_id: tenantId,
      cheque_number: chequeNumber,
      bank_name: bankName,
      cheque_date: chequeDate,
      amount: parseFloat(amount),
      status: "pending",
    });

    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: t("addCheque"), variant: "success" });
      setOpen(false);
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 bg-warning/10 text-warning text-xs font-semibold rounded-lg border border-warning/20 cursor-pointer hover:bg-warning/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/40"
      >
        <Plus aria-hidden="true" className="h-3.5 w-3.5" />
        {t("addCheque")}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent maxWidth="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("addCheque")}</DialogTitle>
            <DialogDescription>{t("subtitle")}</DialogDescription>
          </DialogHeader>

          <DialogBody className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                name="cheque_number"
                type="text"
                required
                label={t("chequeNumber")}
                placeholder="000000"
                className="font-mono ltr-nums"
              />

              <Input
                name="bank_name"
                type="text"
                required
                label={t("bankName")}
                placeholder={t("bankNamePlaceholder")}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  name="cheque_date"
                  type="date"
                  required
                  label={t("chequeDate")}
                  className="font-mono ltr-nums"
                />
                <Input
                  name="amount"
                  type="number"
                  step="0.01"
                  required
                  label={`${t("amount")} (${CURRENCY.code})`}
                  placeholder="0.00"
                  className="font-mono ltr-nums tabular-nums"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                >
                  {tc("cancel")}
                </Button>
                <Button type="submit" loading={saving}>
                  {saving ? t("saving") : t("addCheque")}
                </Button>
              </div>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
