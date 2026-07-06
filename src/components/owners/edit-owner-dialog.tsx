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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  const t = useTranslations("owners");
  const tCommon = useTranslations("common");
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
      toast({ title: t("editOwnerDialog.nameRequired"), variant: "destructive" });
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
      toast({ title: t("saveFailed"), description: error.message, variant: "destructive" });
      return;
    }
    await logAudit(supabase, {
      action: "update",
      entity_type: "owner",
      entity_id: owner.id,
      metadata: payload,
    });
    toast({ title: t("editOwnerDialog.updated"), variant: "success" });
    onClose();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("editOwner")}</DialogTitle>
        <DialogDescription>
          {t("editOwnerDialog.description")}
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        <form id="edit-owner-form" onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="text"
            label={t("editOwnerDialog.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              type="text"
              label={t("editOwnerDialog.whatsappLabel")}
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder={t("editOwnerDialog.whatsappPlaceholder")}
              className="font-mono ltr-nums"
            />
            <Input
              type="email"
              label={t("editOwnerDialog.emailOptional")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label={t("profile.language")}
              value={language}
              onChange={(e) => setLanguage(e.target.value as "en" | "ar")}
            >
              <option value="en">{t("editOwnerDialog.english")}</option>
              <option value="ar">{t("editOwnerDialog.arabic")}</option>
            </Select>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium tracking-tight text-foreground">
                {t("editOwnerDialog.active")}
              </span>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 px-1">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-accent"
                />
                <span className="text-sm text-text-primary">
                  {isActive ? t("editOwnerDialog.active") : t("editOwnerDialog.archived")}
                </span>
              </label>
            </div>
          </div>

          <fieldset className="space-y-4 rounded-xl border border-border/60 bg-surface-elevated/30 p-4">
            <legend className="px-1 text-[10px] font-medium uppercase tracking-wider text-text-secondary">
              {t("editOwnerDialog.openingBalanceSnapshot")}
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                type="number"
                label={t("amountOmr")}
                step={0.001}
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                required
                className="font-mono ltr-nums"
                helperText={t("editOwnerDialog.openingBalanceHelper")}
              />
              <Input
                type="date"
                label={t("editOwnerDialog.asOfDate")}
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
                required
                className="font-mono ltr-nums"
              />
            </div>
          </fieldset>

          <Textarea
            label={tCommon("notes")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={t("editOwnerDialog.notesPlaceholder")}
            className="resize-none"
          />
        </form>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" form="edit-owner-form" loading={saving}>
          {saving ? t("saving") : t("saveChanges")}
        </Button>
      </DialogFooter>
    </>
  );
}
