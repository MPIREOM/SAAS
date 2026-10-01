"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2, CalendarCheck, Info } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatVisitDates } from "@/lib/visits/slots";
import {
  PublicVisitLoading,
  PublicVisitMessage,
  PublicVisitShell,
  type PublicVisitInfo,
} from "./public-shell";
import { SlotPicker, type SlotOption } from "./slot-picker";

interface BookingData {
  campaign: PublicVisitInfo;
  units: string[];
  slots: SlotOption[];
}

type LoadState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "closed"; campaign: PublicVisitInfo | null }
  | { kind: "ready"; data: BookingData };

const ERROR_KEYS: Record<string, string> = {
  phone_mismatch: "errors.phoneMismatch",
  locked: "errors.locked",
  unit_not_found: "errors.unitNotFound",
  slot_taken: "errors.slotTaken",
  invalid_slot: "errors.slotTaken",
  closed: "errors.closed",
  already_booked: "errors.alreadyBooked",
};

async function fetchBooking(token: string): Promise<LoadState> {
  try {
    const res = await fetch(`/api/visit-booking/${encodeURIComponent(token)}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (res.status === 410) return { kind: "closed", campaign: body.campaign ?? null };
    if (!res.ok) return { kind: "invalid" };
    return { kind: "ready", data: body as BookingData };
  } catch {
    return { kind: "invalid" };
  }
}

export function BookVisit({ token, locale }: { token: string; locale: string }) {
  const t = useTranslations("visitBooking");
  const tc = useTranslations("common");
  const router = useRouter();

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [unit, setUnit] = useState("");
  const [digits, setDigits] = useState("");
  const [slot, setSlot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => setState(await fetchBooking(token)), [token]);

  useEffect(() => {
    let cancelled = false;
    fetchBooking(token).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slot) {
      setError(t("errors.pickSlot"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/visit-booking/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit_number: unit, phone_last4: digits, slot_start: slot }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.manage_token) {
        router.push(`/${locale}/my-visit/${body.manage_token}?booked=1`);
        return;
      }
      if (body.error === "already_booked" && body.manage_token) {
        router.push(`/${locale}/my-visit/${body.manage_token}?existing=1`);
        return;
      }
      setError(t(ERROR_KEYS[body.error] ?? "errors.generic"));
      if (body.error === "slot_taken" || body.error === "invalid_slot") {
        setSlot(null);
        await load();
      }
    } catch {
      setError(t("errors.generic"));
    }
    setSubmitting(false);
  };

  if (state.kind === "loading") return <PublicVisitLoading label={tc("loading")} />;
  if (state.kind === "invalid") return <PublicVisitMessage title={t("invalidLink")} message={t("invalidLinkMessage")} />;
  if (state.kind === "closed") {
    return (
      <PublicVisitMessage
        title={state.campaign?.title ?? t("closedTitle")}
        message={t("closedMessage")}
      />
    );
  }

  const { campaign, units, slots } = state.data;

  return (
    <PublicVisitShell title={campaign.title} subtitle={t("subtitle")}>
      <div className="bg-surface border border-border/60 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            <Building2 aria-hidden="true" className="h-5 w-5 text-accent" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">{campaign.property_name}</p>
            <p className="text-xs text-text-secondary">{formatVisitDates(campaign, locale)}</p>
          </div>
        </div>
        {campaign.notes && (
          <p className="flex gap-2 text-sm text-text-secondary whitespace-pre-line border-t border-border/40 pt-3">
            <Info aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5 text-accent" />
            <span>{campaign.notes}</span>
          </p>
        )}
      </div>

      <form onSubmit={submit} className="space-y-5">
        <section className="bg-surface border border-border/60 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-text-primary font-display">{t("step1")}</h2>
          <Select
            label={`${t("unit")} *`}
            required
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            <option value="">{t("selectUnit")}</option>
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
          <Input
            label={`${t("phoneLast4")} *`}
            helperText={t("phoneLast4Help")}
            required
            inputMode="numeric"
            autoComplete="off"
            pattern="\d{4}"
            maxLength={4}
            value={digits}
            onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="font-mono ltr-nums tracking-[0.3em]"
          />
        </section>

        <section className="bg-surface border border-border/60 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary font-display">{t("step2")}</h2>
            <p className="text-xs text-text-secondary mt-1">
              {t("slotLength", { minutes: campaign.slot_minutes })}
            </p>
          </div>
          <SlotPicker slots={slots} value={slot} onChange={setSlot} locale={locale} />
        </section>

        {error && <Alert variant="destructive">{error}</Alert>}

        <Button type="submit" size="lg" loading={submitting} className="w-full rounded-xl">
          {submitting ? (
            t("booking")
          ) : (
            <>
              <CalendarCheck aria-hidden="true" className="h-4 w-4" />
              {t("confirm")}
            </>
          )}
        </Button>
      </form>
    </PublicVisitShell>
  );
}
