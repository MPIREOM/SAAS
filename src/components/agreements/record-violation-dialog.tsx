"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// Staff: record a building-rules violation for the unit's current tenant.
// The fee is billed on its own invoice, due with the next rent.

type Kind = "garbage" | "lost_key" | "alteration";

export function RecordViolationDialog({
  unitId,
  garbageFee,
  keyFee,
}: {
  unitId: string;
  garbageFee: number;
  keyFee: number;
}) {
  const t = useTranslations("tenantAgreement.violations");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<Kind>("garbage");
  const [quantity, setQuantity] = useState(1);
  // Alterations are billed at the repair cost staff enter.
  const [repairCost, setRepairCost] = useState("");

  const fee = kind === "garbage" ? garbageFee : kind === "lost_key" ? keyFee : Number(repairCost) || 0;
  const qty = kind === "lost_key" ? Math.max(1, quantity || 1) : 1;
  const total = (fee * qty).toFixed(3);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (kind === "alteration" && !(Number(repairCost) > 0)) {
      toast({ title: t("repairCostRequired"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/violations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_id: unitId,
          kind,
          quantity: qty,
          amount: kind === "alteration" ? Number(repairCost) : undefined,
          occurred_on: (form.get("occurred_on") as string) || undefined,
          notes: ((form.get("notes") as string) || "").trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: body.error || t("failed"), variant: "destructive" });
      } else {
        toast({ title: t("recorded", { amount: Number(body.amount).toFixed(3) }), variant: "success" });
        setOpen(false);
        setKind("garbage");
        setQuantity(1);
        setRepairCost("");
        router.refresh();
      }
    } catch {
      toast({ title: t("failed"), variant: "destructive" });
    }
    setSaving(false);
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Muscat" });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-8 px-3 bg-destructive/10 border border-destructive/25 text-destructive text-xs font-semibold rounded-lg hover:bg-destructive/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
      >
        <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
        {t("record")}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent maxWidth="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("record")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Select label={t("kind")} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                <option value="garbage">{t("kinds.garbage", { fee: garbageFee.toFixed(3) })}</option>
                <option value="lost_key">{t("kinds.lost_key", { fee: keyFee.toFixed(3) })}</option>
                <option value="alteration">{t("kinds.alteration")}</option>
              </Select>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {kind === "alteration" && (
                  <Input
                    type="number"
                    min={0.001}
                    step={0.001}
                    inputMode="decimal"
                    required
                    label={t("repairCost")}
                    value={repairCost}
                    onChange={(e) => setRepairCost(e.target.value)}
                    placeholder="0.000"
                    className="font-mono ltr-nums tabular-nums"
                  />
                )}
                {kind === "lost_key" && (
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    step={1}
                    label={t("quantity")}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                    className="font-mono ltr-nums tabular-nums"
                  />
                )}
                <Input
                  name="occurred_on"
                  type="date"
                  defaultValue={today}
                  max={today}
                  label={t("date")}
                  className="font-mono ltr-nums"
                />
              </div>
              <Textarea name="notes" rows={2} maxLength={500} label={t("notes")} placeholder={t("notesPlaceholder")} />
              <div className="flex items-center justify-between rounded-lg bg-surface-elevated border border-border/60 px-4 py-3">
                <span className="text-sm text-text-secondary">{t("total")}</span>
                <span className="text-base font-semibold font-mono ltr-nums tabular-nums text-destructive">
                  {total} OMR
                </span>
              </div>
              <p className="text-xs text-text-secondary">{t("billingNote")}</p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  {tc("cancel")}
                </Button>
                <Button type="submit" loading={saving} variant="destructive">
                  {t("submit")}
                </Button>
              </div>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
