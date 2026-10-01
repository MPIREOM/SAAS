"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, CalendarClock, XCircle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatSlotRange, formatVisitDates } from "@/lib/visits/slots";
import {
  PublicVisitLoading,
  PublicVisitMessage,
  PublicVisitShell,
  type PublicVisitInfo,
} from "./public-shell";
import { SlotPicker, type SlotOption } from "./slot-picker";

interface ManageData {
  campaign: PublicVisitInfo & { is_open: boolean };
  booking: {
    unit_number: string;
    slot_start: string;
    status: "booked" | "cancelled";
    can_change: boolean;
  };
  slots: SlotOption[];
}

type LoadState = { kind: "loading" } | { kind: "invalid" } | { kind: "ready"; data: ManageData };

const ERROR_KEYS: Record<string, string> = {
  slot_taken: "errors.slotTaken",
  invalid_slot: "errors.slotTaken",
  closed: "errors.closed",
  too_late: "errors.tooLate",
  already_booked: "errors.alreadyBookedOther",
};

async function fetchManage(url: string): Promise<LoadState> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { kind: "invalid" };
    return { kind: "ready", data: (await res.json()) as ManageData };
  } catch {
    return { kind: "invalid" };
  }
}

export function ManageVisit({
  manageToken,
  locale,
  notice,
}: {
  manageToken: string;
  locale: string;
  notice: "booked" | "existing" | null;
}) {
  const t = useTranslations("visitBooking");
  const tc = useTranslations("common");

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [picking, setPicking] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState<string | null>(
    notice === "booked" ? "noticeBooked" : notice === "existing" ? "noticeExisting" : null
  );

  const url = `/api/visit-booking/manage/${encodeURIComponent(manageToken)}`;

  const load = useCallback(async () => setState(await fetchManage(url)), [url]);

  useEffect(() => {
    let cancelled = false;
    fetchManage(url).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const fail = async (res: Response) => {
    const body = await res.json().catch(() => ({}));
    setError(t(ERROR_KEYS[body.error] ?? "errors.generic"));
    if (body.error === "slot_taken" || body.error === "invalid_slot") setSlot(null);
    await load();
  };

  const move = async () => {
    if (!slot) {
      setError(t("errors.pickSlot"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot_start: slot }),
      });
      if (res.ok) {
        setPicking(false);
        setSlot(null);
        setMessage("noticeMoved");
        await load();
      } else {
        await fail(res);
      }
    } catch {
      setError(t("errors.generic"));
    }
    setBusy(false);
  };

  const cancel = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, { method: "DELETE" });
      setConfirmCancel(false);
      if (res.ok) {
        setPicking(false);
        setMessage("noticeCancelled");
        await load();
      } else {
        await fail(res);
      }
    } catch {
      setError(t("errors.generic"));
    }
    setBusy(false);
  };

  if (state.kind === "loading") return <PublicVisitLoading label={tc("loading")} />;
  if (state.kind === "invalid") return <PublicVisitMessage title={t("invalidLink")} message={t("invalidLinkMessage")} />;

  const { campaign, booking, slots } = state.data;
  const cancelled = booking.status === "cancelled";

  return (
    <PublicVisitShell title={campaign.title} subtitle={t("manageSubtitle")}>
      {message && <Alert variant="success">{t(message)}</Alert>}

      <div className="bg-surface border border-border/60 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
              <Building2 aria-hidden="true" className="h-5 w-5 text-accent" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">{campaign.property_name}</p>
              <p className="text-xs text-text-secondary">
                {t("unit")} <span className="font-mono ltr-nums">{booking.unit_number}</span>
              </p>
            </div>
          </div>
          <Badge variant={cancelled ? "destructive" : "success"}>
            {cancelled ? t("statusCancelled") : t("statusBooked")}
          </Badge>
        </div>

        <div className="rounded-lg border border-border/40 bg-surface-elevated/50 p-4">
          <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
            {cancelled ? t("previousTime") : t("yourTime")}
          </p>
          <p
            className={`text-lg font-semibold ${
              cancelled ? "text-text-secondary line-through" : "text-text-primary"
            }`}
          >
            {formatSlotRange(booking.slot_start, campaign.slot_minutes, locale)}
          </p>
        </div>

        {!cancelled && <p className="text-xs text-text-secondary">{t("entryNote")}</p>}

        {campaign.notes && (
          <Alert variant="warning" title={t("beforeWeArrive")}>
            <span className="whitespace-pre-line">{campaign.notes}</span>
          </Alert>
        )}
      </div>

      {booking.can_change ? (
        picking || cancelled ? (
          <section className="bg-surface border border-border/60 rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-text-primary font-display">
                {cancelled ? t("pickNewTime") : t("changeTime")}
              </h2>
              <p className="text-xs text-text-secondary mt-1">{formatVisitDates(campaign, locale)}</p>
            </div>
            <SlotPicker
              slots={slots}
              value={slot}
              onChange={setSlot}
              locale={locale}
              currentSlot={cancelled ? null : booking.slot_start}
            />
            {error && <Alert variant="destructive">{error}</Alert>}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              {!cancelled && (
                <Button type="button" variant="ghost" onClick={() => setPicking(false)} disabled={busy}>
                  {tc("cancel")}
                </Button>
              )}
              <Button type="button" onClick={move} loading={busy}>
                <CalendarClock aria-hidden="true" className="h-4 w-4" />
                {cancelled ? t("bookThisTime") : t("saveNewTime")}
              </Button>
            </div>
          </section>
        ) : (
          <div className="space-y-3">
            {error && <Alert variant="destructive">{error}</Alert>}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setPicking(true)}>
                <CalendarClock aria-hidden="true" className="h-4 w-4" />
                {t("changeTime")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 text-destructive hover:border-destructive/40"
                onClick={() => setConfirmCancel(true)}
              >
                <XCircle aria-hidden="true" className="h-4 w-4" />
                {t("cancelVisit")}
              </Button>
            </div>
          </div>
        )
      ) : (
        <Alert variant="info">{campaign.is_open ? t("changesClosed") : t("closedMessage")}</Alert>
      )}

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent maxWidth="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("cancelConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("cancelConfirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmCancel(false)} disabled={busy}>
              {t("keepVisit")}
            </Button>
            <Button type="button" variant="destructive" onClick={cancel} loading={busy}>
              {t("cancelVisit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicVisitShell>
  );
}
