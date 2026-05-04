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
import type { SettlementRow } from "@/components/owners/types";

type Direction = "company_to_owner" | "owner_to_company";
type Method = "cash" | "bank_transfer" | "cheque";

export function SettlementDialog({
  open,
  onOpenChange,
  ownerId,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerId: string;
  editing: SettlementRow | null;
}) {
  // Keying the form on the editing target ensures useState initializers
  // re-run cleanly when the operator switches between "create" and editing
  // a specific row — no useEffect setState dance required.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-md">
        {open && (
          <SettlementDialogForm
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

function SettlementDialogForm({
  ownerId,
  editing,
  onClose,
}: {
  ownerId: string;
  editing: SettlementRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [direction, setDirection] = useState<Direction>(
    editing?.direction || "company_to_owner",
  );
  const [amount, setAmount] = useState(
    editing ? String(Number(editing.amount)) : "",
  );
  const [method, setMethod] = useState<Method>(editing?.method || "cash");
  const [settledAt, setSettledAt] = useState(
    editing?.settled_at || new Date().toISOString().split("T")[0],
  );
  const [reference, setReference] = useState(editing?.reference_number || "");
  const [notes, setNotes] = useState(editing?.notes || "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast({ title: "Amount must be a positive number", variant: "destructive" });
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const payload = {
      owner_id: ownerId,
      direction,
      amount: numericAmount,
      method,
      settled_at: settledAt,
      reference_number: reference.trim() || null,
      notes: notes.trim() || null,
    };

    if (editing) {
      const { error } = await supabase
        .from("owner_settlements")
        .update(payload)
        .eq("id", editing.id);
      setSaving(false);
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        return;
      }
      await logAudit(supabase, {
        action: "update",
        entity_type: "owner_settlement",
        entity_id: editing.id,
        metadata: payload,
      });
    } else {
      const { data, error } = await supabase
        .from("owner_settlements")
        .insert(payload)
        .select("id")
        .single();
      setSaving(false);
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        return;
      }
      await logAudit(supabase, {
        action: "create",
        entity_type: "owner_settlement",
        entity_id: data?.id,
        metadata: payload,
      });
    }
    toast({ title: editing ? "Settlement updated" : "Settlement recorded", variant: "success" });
    onClose();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit settlement" : "Record settlement"}</DialogTitle>
        <DialogDescription>
          Money moving between the company and the owner. Adjusts the running balance immediately.
        </DialogDescription>
      </DialogHeader>

        <DialogBody>
          <form id="settlement-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Direction toggle */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Direction
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDirection("company_to_owner")}
                  className={`p-3 rounded-xl border text-xs font-medium transition-colors ${
                    direction === "company_to_owner"
                      ? "bg-accent/10 border-accent/40 text-accent"
                      : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border"
                  }`}
                >
                  Company → Owner
                  <div className="text-[10px] mt-1 opacity-70">decreases balance</div>
                </button>
                <button
                  type="button"
                  onClick={() => setDirection("owner_to_company")}
                  className={`p-3 rounded-xl border text-xs font-medium transition-colors ${
                    direction === "owner_to_company"
                      ? "bg-accent/10 border-accent/40 text-accent"
                      : "bg-surface-elevated/50 border-border/40 text-text-secondary hover:border-border"
                  }`}
                >
                  Owner → Company
                  <div className="text-[10px] mt-1 opacity-70">increases balance</div>
                </button>
              </div>
            </div>

            {/* Amount */}
            <Field label="Amount (OMR)">
              <input
                type="number"
                min={0.001}
                step={0.001}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                placeholder="e.g. 1500.000"
                className={INPUT_CLASS}
              />
            </Field>

            {/* Method */}
            <Field label="Method">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                className={INPUT_CLASS}
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </Field>

            {/* Date */}
            <Field label="Date">
              <input
                type="date"
                value={settledAt}
                onChange={(e) => setSettledAt(e.target.value)}
                required
                className={INPUT_CLASS}
              />
            </Field>

            {/* Reference */}
            <Field label="Reference (optional)">
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Cheque number, transfer reference, etc."
                className={INPUT_CLASS}
              />
            </Field>

            {/* Notes */}
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
          form="settlement-form"
          disabled={saving}
          className="h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-colors disabled:opacity-40"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Record"}
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
