"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import type { BusinessFeeRow } from "@/components/owners/types";

export function BusinessFeeDialog({
  open,
  onOpenChange,
  ownerId,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerId: string;
  editing: BusinessFeeRow | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-md">
        {open && (
          <BusinessFeeDialogForm
            key={editing?.id || "new"}
            ownerId={ownerId}
            editing={editing}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BusinessFeeDialogForm({
  ownerId,
  editing,
  onClose,
}: {
  ownerId: string;
  editing: BusinessFeeRow | null;
  onClose: () => void;
}) {
  const t = useTranslations("owners");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { toast } = useToast();
  const [periodMonth, setPeriodMonth] = useState(
    editing?.period_month || thisMonthFirst(),
  );
  const [amount, setAmount] = useState(
    editing ? String(Number(editing.amount)) : "1500",
  );
  const [notes, setNotes] = useState(editing?.notes || "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      toast({ title: t("fees.amountNonNegative"), variant: "destructive" });
      return;
    }
    // Force the date to the 1st of the month — that's how the schema
    // anchors the unique constraint.
    const month = `${periodMonth.slice(0, 7)}-01`;
    setSaving(true);
    const supabase = createClient();
    const payload = {
      owner_id: ownerId,
      period_month: month,
      amount: numericAmount,
      notes: notes.trim() || null,
    };

    if (editing) {
      const { error } = await supabase
        .from("owner_business_fees")
        .update(payload)
        .eq("id", editing.id);
      setSaving(false);
      if (error) {
        toast({ title: t("saveFailed"), description: error.message, variant: "destructive" });
        return;
      }
      await logAudit(supabase, {
        action: "update",
        entity_type: "owner_business_fee",
        entity_id: editing.id,
        metadata: payload,
      });
    } else {
      const { data, error } = await supabase
        .from("owner_business_fees")
        .insert(payload)
        .select("id")
        .single();
      setSaving(false);
      if (error) {
        // Friendlier message for the unique-violation on (owner, month).
        const desc = error.code === "23505"
          ? t("fees.duplicateMonth")
          : error.message;
        toast({ title: t("saveFailed"), description: desc, variant: "destructive" });
        return;
      }
      await logAudit(supabase, {
        action: "create",
        entity_type: "owner_business_fee",
        entity_id: data?.id,
        metadata: payload,
      });
    }
    toast({ title: editing ? t("fees.updated") : t("fees.added"), variant: "success" });
    onClose();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? t("fees.editTitle") : t("fees.addTitle")}</DialogTitle>
        <DialogDescription>
          {t("fees.dialogDescription")}
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        <form id="business-fee-form" onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="month"
            label={t("fees.month")}
            value={periodMonth.slice(0, 7)}
            onChange={(e) => setPeriodMonth(e.target.value + "-01")}
            required
            className="font-mono ltr-nums"
          />
          <Input
            type="number"
            label={t("amountOmr")}
            min={0}
            step={0.001}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="font-mono ltr-nums"
          />
          <Textarea
            label={tCommon("notes")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={tCommon("optional")}
            className="resize-none"
          />
        </form>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" form="business-fee-form" loading={saving}>
          {saving ? t("saving") : editing ? t("saveChanges") : tCommon("add")}
        </Button>
      </DialogFooter>
    </>
  );
}

function thisMonthFirst(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
