"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
      toast({ title: "Amount must be zero or positive", variant: "destructive" });
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
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
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
          ? "A fee already exists for this month — edit that row instead."
          : error.message;
        toast({ title: "Save failed", description: desc, variant: "destructive" });
        return;
      }
      await logAudit(supabase, {
        action: "create",
        entity_type: "owner_business_fee",
        entity_id: data?.id,
        metadata: payload,
      });
    }
    toast({ title: editing ? "Fee updated" : "Fee added", variant: "success" });
    onClose();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit business fee" : "Add business fee"}</DialogTitle>
        <DialogDescription>
          One flat charge per calendar month. Subtracts from the owner balance.
        </DialogDescription>
      </DialogHeader>

        <DialogBody>
          <form id="business-fee-form" onSubmit={handleSubmit} className="space-y-4">
            <Field label="Month">
              <input
                type="month"
                value={periodMonth.slice(0, 7)}
                onChange={(e) => setPeriodMonth(e.target.value + "-01")}
                required
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Amount (OMR)">
              <input
                type="number"
                min={0}
                step={0.001}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={INPUT_CLASS + " resize-none"}
                placeholder="Optional"
              />
            </Field>
          </form>
        </DialogBody>

      <DialogFooter>
        <button
          type="button"
          onClick={onClose}
          className="h-10 px-5 bg-surface-elevated border border-border/60 text-text-primary text-sm font-medium rounded-xl hover:bg-surface-hover transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          form="business-fee-form"
          disabled={saving}
          className="h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-colors disabled:opacity-40"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Add"}
        </button>
      </DialogFooter>
    </>
  );
}

const INPUT_CLASS =
  "w-full h-10 bg-surface-elevated/50 border border-border/60 rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

function thisMonthFirst(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
