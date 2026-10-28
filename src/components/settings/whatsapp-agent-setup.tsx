"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Loader2, Plus, Smartphone, Trash2, X } from "lucide-react";

interface WhatsAppAgentSetupProps {
  userId: string;
  currentPhone: string | null;
  notificationPhones: string[];
}

const cleanPhone = (raw: string) => raw.replace(/[^\d]/g, "");

export function WhatsAppAgentSetup({
  userId,
  currentPhone,
  notificationPhones,
}: WhatsAppAgentSetupProps) {
  const t = useTranslations("settings");
  const [phone, setPhone] = useState(currentPhone || "");
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [extraPhones, setExtraPhones] = useState<string[]>(notificationPhones);
  const [newExtraPhone, setNewExtraPhone] = useState("");
  const [savingExtra, setSavingExtra] = useState(false);
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);

  const router = useRouter();
  const { toast } = useToast();

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const cleaned = cleanPhone(phone);
    if (!cleaned || cleaned.length < 8) {
      toast({
        title: t("whatsappPhoneInvalid"),
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ whatsapp_phone: cleaned, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      toast({
        title: error.message.includes("unique")
          ? t("whatsappPhoneAlreadyRegistered")
          : t("whatsappPhoneSaveFailed"),
        variant: "destructive",
      });
    } else {
      toast({ title: t("whatsappNumberRegistered"), variant: "success" });
      router.refresh();
    }
    setLoading(false);
  }

  async function handleRemove() {
    setRemoving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ whatsapp_phone: null, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      toast({ title: t("whatsappPhoneRemoveFailed"), variant: "destructive" });
    } else {
      setPhone("");
      toast({ title: t("whatsappNumberRemoved"), variant: "success" });
      router.refresh();
    }
    setRemoving(false);
  }

  async function persistExtraPhones(next: string[]) {
    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({
        notification_phones: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) {
      toast({
        title: t("whatsappCcUpdateFailed"),
        variant: "destructive",
      });
      return false;
    }
    return true;
  }

  async function handleAddExtra(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = cleanPhone(newExtraPhone);
    if (!cleaned || cleaned.length < 8) {
      toast({
        title: t("whatsappPhoneInvalid"),
        variant: "destructive",
      });
      return;
    }
    if (cleaned === cleanPhone(currentPhone || "")) {
      toast({
        title: t("whatsappCcSamePrimary"),
        variant: "destructive",
      });
      return;
    }
    if (extraPhones.includes(cleaned)) {
      toast({ title: t("whatsappCcDuplicate"), variant: "destructive" });
      return;
    }
    setSavingExtra(true);
    const next = [...extraPhones, cleaned];
    const ok = await persistExtraPhones(next);
    if (ok) {
      setExtraPhones(next);
      setNewExtraPhone("");
      toast({ title: t("whatsappCcAdded"), variant: "success" });
      router.refresh();
    }
    setSavingExtra(false);
  }

  async function handleRemoveExtra(index: number) {
    setRemovingIndex(index);
    const next = extraPhones.filter((_, i) => i !== index);
    const ok = await persistExtraPhones(next);
    if (ok) {
      setExtraPhones(next);
      toast({ title: t("whatsappCcRemoved"), variant: "success" });
      router.refresh();
    }
    setRemovingIndex(null);
  }

  return (
    <div className="space-y-4">
      {currentPhone ? (
        <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success-tint p-3">
          <div className="rounded-md bg-success-tint p-1.5">
            <Check aria-hidden="true" className="h-4 w-4 text-success" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary">
              {t("whatsappAgentActive")}
            </p>
            <p className="ltr-nums truncate tabular-nums text-xs text-text-secondary">
              +{currentPhone}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            aria-label={t("whatsappCcRemoveLabel")}
            className="cursor-pointer rounded-md p-1.5 text-xs text-text-secondary transition-colors hover:bg-destructive-tint hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40"
          >
            {removing ? (
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <Input
                id="whatsapp-phone"
                type="tel"
                label={t("whatsappYourNumber")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="968XXXXXXXX"
                helperText={t("whatsappNumberHint")}
                className="ltr-nums tabular-nums"
              />
            </div>
            <Button
              type="submit"
              disabled={loading || !phone}
              loading={loading}
              className="mt-[26px] shrink-0"
            >
              {currentPhone ? t("whatsappUpdate") : t("whatsappRegister")}
            </Button>
          </div>
        </div>
      </form>

      {/* Additional notification numbers (e.g. owner) */}
      <div className="space-y-3 border-t border-border pt-4">
        <div>
          <p className="text-sm font-medium text-text-primary">
            {t("whatsappCcLabel")}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {t("whatsappCcDescription")}
          </p>
        </div>

        {extraPhones.length > 0 && (
          <ul className="space-y-2">
            {extraPhones.map((p, i) => (
              <li
                key={`${p}-${i}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-elevated p-2.5 transition-colors hover:border-border"
              >
                <Smartphone
                  aria-hidden="true"
                  className="ms-1 h-4 w-4 text-text-tertiary"
                />
                <span className="ltr-nums flex-1 truncate tabular-nums text-sm text-text-primary">
                  +{p}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveExtra(i)}
                  disabled={removingIndex === i}
                  className="cursor-pointer rounded-md p-1.5 text-xs text-text-secondary transition-colors hover:bg-destructive-tint hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40"
                  aria-label={t("whatsappCcRemoveLabel")}
                >
                  {removingIndex === i ? (
                    <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAddExtra} className="flex items-start gap-2">
          <div className="relative flex-1">
            <Smartphone
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-text-tertiary"
            />
            <Input
              type="tel"
              value={newExtraPhone}
              onChange={(e) => setNewExtraPhone(e.target.value)}
              placeholder="968XXXXXXXX"
              aria-label={t("whatsappCcLabel")}
              className="ltr-nums ps-9 tabular-nums"
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            disabled={savingExtra || !newExtraPhone}
            loading={savingExtra}
            className="shrink-0"
          >
            {!savingExtra && <Plus aria-hidden="true" className="h-4 w-4" />}
            {t("whatsappCcAdd")}
          </Button>
        </form>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-surface-elevated p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] rtl:normal-case rtl:tracking-normal text-text-secondary">
          {t("whatsappCapabilitiesTitle")}
        </p>
        <ul className="space-y-1.5 text-xs text-text-secondary">
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-0.5 text-accent">•</span>
            <span>{t("whatsappCapabilityPay")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-0.5 text-accent">•</span>
            <span>{t("whatsappCapabilityExpense")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-0.5 text-accent">•</span>
            <span>{t("whatsappCapabilityPartial")}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
