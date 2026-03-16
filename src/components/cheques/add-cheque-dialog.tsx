"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { Plus, X, Loader2 } from "lucide-react";
import { CURRENCY } from "@/lib/currency";

interface AddChequeDialogProps {
  tenantId: string;
}

export function AddChequeDialog({ tenantId }: AddChequeDialogProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const t = useTranslations("cheques");
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
      toast({ title: "Please fill all fields", variant: "destructive" });
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

  const inputClass =
    "w-full h-9 bg-surface-elevated border border-border rounded-lg px-3 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent transition-colors";
  const labelClass = "block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 bg-warning/10 text-warning text-xs font-semibold rounded-lg hover:bg-warning/20 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        {t("addCheque")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-text-primary font-display">
                {t("addCheque")}
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelClass}>{t("chequeNumber")}</label>
                <input
                  name="cheque_number"
                  type="text"
                  required
                  placeholder="000000"
                  className={`${inputClass} font-mono`}
                />
              </div>

              <div>
                <label className={labelClass}>{t("bankName")}</label>
                <input
                  name="bank_name"
                  type="text"
                  required
                  placeholder="Bank name"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{t("chequeDate")}</label>
                  <input
                    name="cheque_date"
                    type="date"
                    required
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t("amount")} ({CURRENCY.code})</label>
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-9 px-4 text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {saving ? "Saving..." : t("addCheque")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
