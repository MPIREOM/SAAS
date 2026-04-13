"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
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
        title: "Please enter a valid phone number with country code",
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
          ? "This phone number is already registered to another user"
          : "Failed to save phone number",
        variant: "destructive",
      });
    } else {
      toast({ title: "WhatsApp number registered", variant: "success" });
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
      toast({ title: "Failed to remove phone number", variant: "destructive" });
    } else {
      setPhone("");
      toast({ title: "WhatsApp number removed", variant: "success" });
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
        title: "Failed to update notification numbers",
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
        title: "Please enter a valid phone number with country code",
        variant: "destructive",
      });
      return;
    }
    if (cleaned === cleanPhone(currentPhone || "")) {
      toast({
        title: "This is already your primary number",
        variant: "destructive",
      });
      return;
    }
    if (extraPhones.includes(cleaned)) {
      toast({ title: "This number is already added", variant: "destructive" });
      return;
    }
    setSavingExtra(true);
    const next = [...extraPhones, cleaned];
    const ok = await persistExtraPhones(next);
    if (ok) {
      setExtraPhones(next);
      setNewExtraPhone("");
      toast({ title: "Notification number added", variant: "success" });
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
      toast({ title: "Notification number removed", variant: "success" });
      router.refresh();
    }
    setRemovingIndex(null);
  }

  return (
    <div className="space-y-4">
      {currentPhone ? (
        <div className="flex items-center gap-3 p-3 bg-success/5 border border-success/20 rounded-lg">
          <div className="p-1.5 bg-success/10 rounded-md">
            <Check className="h-4 w-4 text-success" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">
              Agent Active
            </p>
            <p className="text-xs text-text-secondary font-mono">
              +{currentPhone}
            </p>
          </div>
          <button
            onClick={handleRemove}
            disabled={removing}
            className="text-xs text-text-secondary hover:text-destructive transition-colors p-1.5 rounded-md hover:bg-destructive/10"
          >
            {removing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Your WhatsApp Number
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Smartphone className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary/50" />
              <input
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
              className="h-10 px-4 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-lg transition-all duration-200 disabled:opacity-40 flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                currentPhone ? "Update" : "Register"
              )}
            </button>
          </div>
          <p className="text-xs text-text-secondary mt-1.5">
            Enter your number with country code (no + sign). e.g. 968XXXXXXXX
          </p>
        </div>
      </form>

      {/* Additional notification numbers (e.g. owner) */}
      <div className="pt-4 border-t border-border/40 space-y-3">
        <div>
          <label className="block text-sm font-medium text-text-primary">
            Also send daily summary to
          </label>
          <p className="text-xs text-text-secondary mt-0.5">
            These numbers receive the morning daily summary on WhatsApp.
            Useful for keeping the owner in the loop. They cannot send
            commands to the agent.
          </p>
        </div>

        {extraPhones.length > 0 && (
          <ul className="space-y-2">
            {extraPhones.map((p, i) => (
              <li
                key={`${p}-${i}`}
                className="flex items-center gap-3 p-2.5 bg-surface-elevated/50 border border-border/40 rounded-lg"
              >
                <Smartphone className="h-4 w-4 text-text-secondary/60 ms-1" />
                <span className="flex-1 text-sm text-text-primary font-mono">
                  +{p}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveExtra(i)}
                  disabled={removingIndex === i}
                  className="text-xs text-text-secondary hover:text-destructive transition-colors p-1.5 rounded-md hover:bg-destructive/10"
                  aria-label="Remove number"
                >
                  {removingIndex === i ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAddExtra} className="flex gap-2">
          <div className="relative flex-1">
            <Smartphone className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary/50" />
            <input
              type="tel"
              value={newExtraPhone}
              onChange={(e) => setNewExtraPhone(e.target.value)}
              placeholder="968XXXXXXXX"
              className="w-full h-10 ps-9 pe-3 bg-surface-elevated/50 border border-border/60 rounded-lg text-sm text-text-primary font-mono placeholder:text-text-secondary/40 focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200"
            />
          </div>
          <button
            type="submit"
            disabled={savingExtra || !newExtraPhone}
            className="h-10 px-4 bg-surface-elevated border border-border/60 hover:border-accent/50 hover:text-accent text-text-primary text-sm font-semibold rounded-lg transition-all duration-200 disabled:opacity-40 flex items-center gap-2"
          >
            {savingExtra ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Add
              </>
            )}
          </button>
        </form>
      </div>

      <div className="p-3 bg-surface-elevated/50 border border-border/40 rounded-lg space-y-2">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          What you can do via WhatsApp
        </p>
        <ul className="text-xs text-text-secondary space-y-1.5">
          <li className="flex items-start gap-2">
            <span className="text-accent mt-0.5">&#x2022;</span>
            <span>&quot;Ahmad paid his invoice&quot; — marks the tenant&apos;s invoice as paid</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent mt-0.5">&#x2022;</span>
            <span>&quot;Add expense 50 OMR for plumbing at Sunset Tower&quot; — creates an expense</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent mt-0.5">&#x2022;</span>
            <span>&quot;Fatma paid 150 OMR for March via bank transfer&quot; — partial or specific payment</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
