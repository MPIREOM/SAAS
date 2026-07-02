"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium tracking-tight text-foreground">
              Direction
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection("company_to_owner")}
                aria-pressed={direction === "company_to_owner"}
                className={cn(
                  "cursor-pointer rounded-lg border p-3 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  direction === "company_to_owner"
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border/40 bg-surface-elevated/50 text-text-secondary hover:border-border",
                )}
              >
                Company → Owner
                <span className="mt-1 block text-[10px] opacity-70">
                  decreases balance
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDirection("owner_to_company")}
                aria-pressed={direction === "owner_to_company"}
                className={cn(
                  "cursor-pointer rounded-lg border p-3 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  direction === "owner_to_company"
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border/40 bg-surface-elevated/50 text-text-secondary hover:border-border",
                )}
              >
                Owner → Company
                <span className="mt-1 block text-[10px] opacity-70">
                  increases balance
                </span>
              </button>
            </div>
          </fieldset>

          <Input
            type="number"
            label="Amount (OMR)"
            min={0.001}
            step={0.001}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="e.g. 1500.000"
            className="font-mono ltr-nums"
          />

          <Select
            label="Method"
            value={method}
            onChange={(e) => setMethod(e.target.value as Method)}
          >
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cheque">Cheque</option>
          </Select>

          <Input
            type="date"
            label="Date"
            value={settledAt}
            onChange={(e) => setSettledAt(e.target.value)}
            required
            className="font-mono ltr-nums"
          />

          <Input
            type="text"
            label="Reference (optional)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Cheque number, transfer reference, etc."
            className="font-mono ltr-nums"
          />

          <Textarea
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional"
            className="resize-none"
          />
        </form>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="settlement-form" loading={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Record"}
        </Button>
      </DialogFooter>
    </>
  );
}
