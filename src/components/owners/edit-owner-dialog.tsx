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
import type { Owner } from "@/components/owners/types";

export function EditOwnerDialog({
  open,
  onOpenChange,
  owner,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  owner: Owner;
}) {
  // Key on owner.id + opening_balance so the form re-mounts (and re-reads
  // initial state) whenever the owner data changes from the server.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-lg">
        {open && (
          <EditOwnerForm
            key={`${owner.id}-${owner.opening_balance}-${owner.opening_balance_date}`}
            owner={owner}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditOwnerForm({
  owner,
  onClose,
}: {
  owner: Owner;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(owner.name);
  const [whatsapp, setWhatsapp] = useState(owner.whatsapp_phone || "");
  const [email, setEmail] = useState(owner.email || "");
  const [language, setLanguage] = useState<"en" | "ar">(owner.language_preference);
  const [openingBalance, setOpeningBalance] = useState(
    String(Number(owner.opening_balance)),
  );
  const [openingDate, setOpeningDate] = useState(owner.opening_balance_date);
  const [notes, setNotes] = useState(owner.notes || "");
  const [isActive, setIsActive] = useState(owner.is_active);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const payload = {
      name: name.trim(),
      whatsapp_phone: whatsapp.replace(/[^\d]/g, "") || null,
      email: email.trim() || null,
      language_preference: language,
      opening_balance: Number(openingBalance),
      opening_balance_date: openingDate,
      notes: notes.trim() || null,
      is_active: isActive,
    };
    const { error } = await supabase
      .from("owners")
      .update(payload)
      .eq("id", owner.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    await logAudit(supabase, {
      action: "update",
      entity_type: "owner",
      entity_id: owner.id,
      metadata: payload,
    });
    toast({ title: "Owner updated", variant: "success" });
    onClose();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit owner</DialogTitle>
        <DialogDescription>
          Owner details, opening balance, and contact info. Changes here flow
          into the daily summary and the WhatsApp agent immediately.
        </DialogDescription>
      </DialogHeader>

        <DialogBody>
          <form id="edit-owner-form" onSubmit={handleSubmit} className="space-y-4">
            <Field label="Name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={INPUT_CLASS}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="WhatsApp (digits + country code)">
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="e.g. 96899372277"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Email (optional)">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Language">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "en" | "ar")}
                  className={INPUT_CLASS}
                >
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                </select>
              </Field>
              <Field label="Active">
                <label className="inline-flex items-center gap-2 h-10 px-3">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">
                    {isActive ? "Active" : "Archived"}
                  </span>
                </label>
              </Field>
            </div>

            <div className="rounded-xl border border-border/60 bg-surface-elevated/30 p-4 space-y-4">
              <div className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">
                Opening balance snapshot
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Amount (OMR)">
                  <input
                    type="number"
                    step={0.001}
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    required
                    className={INPUT_CLASS}
                  />
                  <p className="text-[10px] text-text-secondary mt-1">
                    Positive = company owes owner. Negative = owner owes company.
                  </p>
                </Field>
                <Field label="As of date">
                  <input
                    type="date"
                    value={openingDate}
                    onChange={(e) => setOpeningDate(e.target.value)}
                    required
                    className={INPUT_CLASS}
                  />
                </Field>
              </div>
            </div>

            <Field label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={INPUT_CLASS + " resize-none"}
                placeholder="Anything worth remembering about this owner"
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
          form="edit-owner-form"
          disabled={saving}
          className="h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-colors disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save changes"}
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
