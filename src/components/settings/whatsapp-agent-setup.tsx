"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/toast";
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
        <div className="flex items-center gap-3 p-3 bg-success/5 border border-success/20 rounded-lg">
          <div className="p-1.5 bg-success/10 rounded-md">
            <Check aria-hidden="true" className="h-4 w-4 text-success" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">
              {t("whatsappAgentActive")}
            </p>
            <p className="text-xs text-text-secondary font-mono">
              +{currentPhone}
            </p>
          </div>
          <button
            onClick={handleRemove}
            disabled={removing}
            aria-label={t("whatsappCcRemoveLabel")}
            className="text-xs text-text-secondary hover:text-destructive transition-colors p-1.5 rounded-md hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
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
          <label htmlFor="whatsapp-phone" className="block text-sm font-medium text-text-primary mb-1.5">
            {t("whatsappYourNumber")}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Smartphone aria-hidden="true" className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary/50" />
              <input
                id="whatsapp-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="968XXXXXXXX"
                className="w-full h-10 ps-9 pe-3 bg-surface-elevated/50 border border-border/60 rounded-lg text-sm text-text-primary font-mono placeholder:text-text-secondary/40 focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !phone}
              className="h-10 px-4 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-lg transition-all duration-200 disabled:opacity-40 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {loading ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                currentPhone ? t("whatsappUpdate") : t("whatsappRegister")
              )}
            </button>
          </div>
          <p className="text-xs text-text-secondary mt-1.5">
            {t("whatsappNumberHint")}
          </p>
        </div>
      </form>

      {/* Additional notification numbers (e.g. owner) */}
      <div className="pt-4 border-t border-border/40 space-y-3">
        <div>
          <label className="block text-sm font-medium text-text-primary">
            {t("whatsappCcLabel")}
          </label>
          <p className="text-xs text-text-secondary mt-0.5">
            {t("whatsappCcDescription")}
          </p>
        </div>

        {extraPhones.length > 0 && (
          <ul className="space-y-2">
            {extraPhones.map((p, i) => (
              <li
                key={`${p}-${i}`}
                className="flex items-center gap-3 p-2.5 bg-surface-elevated/50 border border-border/40 rounded-lg"
              >
                <Smartphone aria-hidden="true" className="h-4 w-4 text-text-secondary/60 ms-1" />
                <span className="flex-1 text-sm text-text-primary font-mono">
                  +{p}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveExtra(i)}
                  disabled={removingIndex === i}
                  className="text-xs text-text-secondary hover:text-destructive transition-colors p-1.5 rounded-md hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
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

        <form onSubmit={handleAddExtra} className="flex gap-2">
          <div className="relative flex-1">
            <Smartphone aria-hidden="true" className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary/50" />
            <input
              type="tel"
              value={newExtraPhone}
              onChange={(e) => setNewExtraPhone(e.target.value)}
              placeholder="968XXXXXXXX"
              aria-label={t("whatsappCcLabel")}
              className="w-full h-10 ps-9 pe-3 bg-surface-elevated/50 border border-border/60 rounded-lg text-sm text-text-primary font-mono placeholder:text-text-secondary/40 focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200"
            />
          </div>
          <button
            type="submit"
            disabled={savingExtra || !newExtraPhone}
            className="h-10 px-4 bg-surface-elevated border border-border/60 hover:border-accent/50 hover:text-accent text-text-primary text-sm font-semibold rounded-lg transition-all duration-200 disabled:opacity-40 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {savingExtra ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t("whatsappCcAdd")}
              </>
            )}
          </button>
        </form>
      </div>

      <div className="p-3 bg-surface-elevated/50 border border-border/40 rounded-lg space-y-2">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {t("whatsappCapabilitiesTitle")}
        </p>
        <ul className="text-xs text-text-secondary space-y-1.5">
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="text-accent mt-0.5">•</span>
            <span>{t("whatsappCapabilityPay")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="text-accent mt-0.5">•</span>
            <span>{t("whatsappCapabilityExpense")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="text-accent mt-0.5">•</span>
            <span>{t("whatsappCapabilityPartial")}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
