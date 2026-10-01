"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CalendarCheck,
  CalendarX,
  Check,
  Copy,
  ExternalLink,
  Info,
  Lock,
  LockOpen,
  Send,
  Trash2,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { displayPhone } from "@/lib/visits/phone";
import { ContractorLink } from "./contractor-link";
import { cn } from "@/lib/utils/cn";
import {
  isOutsideWindowError,
  messageProblem,
  messageState,
  type VisitMessage,
  type VisitMessageState,
} from "@/lib/visits/messages";
import { formatSlotRange, formatSlotTime, formatVisitDates, formatVisitDay, muscatDate } from "@/lib/visits/slots";

export interface BoardUnit {
  unit_id: string;
  unit_number: string;
  tenant_name: string | null;
  tenant_phone: string | null;
  /** contact_phone: the number the tenant typed when booking (049). */
  /** work_*: what the contractor recorded for this unit (050). */
  booking: {
    id: string;
    slot_start: string;
    booked_by: string;
    contact_phone: string | null;
    work_status: "done" | "not_entered" | null;
    work_reason: "not_home" | "refused" | "other" | null;
    work_note: string | null;
  } | null;
  /** Latest WhatsApp message to this unit's tenant for this visit. */
  message: VisitMessage | null;
}

interface BoardCampaign {
  id: string;
  title: string;
  notes: string | null;
  token: string;
  crew_token: string | null;
  status: "open" | "closed";
  over: boolean;
  start_date: string;
  end_date: string;
  day_start: string;
  day_end: string;
  slot_minutes: number;
}

interface Props {
  locale: string;
  propertyId: string;
  campaign: BoardCampaign;
  units: BoardUnit[];
  freeSlots: string[];
}

type Filter = "all" | "pending" | "booked" | "msgFailed";

const STATE_BADGE: Record<VisitMessageState, "success" | "secondary" | "destructive" | "warning"> = {
  read: "success",
  delivered: "success",
  sent: "secondary",
  failed: "destructive",
  skipped: "warning",
};
type View = "units" | "schedule";

const subscribeNoop = () => () => {};

export function VisitBoard({ locale, propertyId, campaign, units, freeSlots }: Props) {
  const t = useTranslations("visits");
  const tc = useTranslations("common");
  const router = useRouter();
  const { toast } = useToast();

  const origin = useSyncExternalStore(subscribeNoop, () => window.location.origin, () => "");
  const shareLink = origin ? `${origin}/${locale}/visit-booking/${campaign.token}` : "";

  const [view, setView] = useState<View>("units");
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<BoardUnit | null>(null);
  const [bookTarget, setBookTarget] = useState<BoardUnit | null>(null);
  const [bookSlot, setBookSlot] = useState("");
  const [dialogError, setDialogError] = useState("");

  const occupied = units.filter((u) => u.tenant_name);
  const booked = occupied.filter((u) => u.booking);
  const pending = occupied.filter((u) => !u.booking);
  const vacant = units.length - occupied.length;
  const live = campaign.status === "open" && !campaign.over;

  const msgFailed = occupied.filter((u) => u.message && messageState(u.message) === "failed");
  const shown =
    filter === "booked" ? booked : filter === "pending" ? pending : filter === "msgFailed" ? msgFailed : occupied;

  const messageCounts = useMemo(() => {
    const counts: Record<VisitMessageState, number> = { read: 0, delivered: 0, sent: 0, failed: 0, skipped: 0 };
    for (const u of occupied) if (u.message) counts[messageState(u.message)]++;
    return counts;
  }, [occupied]);
  const messaged = Object.values(messageCounts).reduce((a, b) => a + b, 0);
  // Messages that went out as plain text because the template was refused,
  // and failures from Meta's 24h rule: both mean the template isn't usable yet.
  const templateProblem =
    occupied.map((u) => u.message).find((m) => m?.via === "text" && m.template_error)?.template_error ?? null;
  const outsideWindow = occupied.some((u) => u.message && isOutsideWindowError(messageProblem(u.message)));

  const schedule = useMemo(() => {
    const rows = units
      .filter((u) => u.booking)
      .sort((a, b) => a.booking!.slot_start.localeCompare(b.booking!.slot_start));
    const byDay = new Map<string, BoardUnit[]>();
    for (const u of rows) {
      const day = muscatDate(u.booking!.slot_start);
      byDay.set(day, [...(byDay.get(day) ?? []), u]);
    }
    return Array.from(byDay);
  }, [units]);

  const slotsByDay = useMemo(() => {
    const byDay = new Map<string, string[]>();
    for (const s of freeSlots) {
      const day = muscatDate(s);
      byDay.set(day, [...(byDay.get(day) ?? []), s]);
    }
    return Array.from(byDay);
  }, [freeSlots]);

  const copy = async () => {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const call = async (key: string, url: string, init: RequestInit) => {
    setBusy(key);
    try {
      const res = await fetch(url, {
        ...init,
        headers: init.body ? { "Content-Type": "application/json" } : undefined,
      });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, body };
    } catch {
      return { ok: false, body: {} as Record<string, unknown> };
    } finally {
      setBusy(null);
    }
  };

  const sendInvites = async (unitIds?: string[]) => {
    const { ok, body } = await call(unitIds ? `send-${unitIds[0]}` : "send", `/api/visits/campaigns/${campaign.id}/notify`, {
      method: "POST",
      body: JSON.stringify(unitIds ? { unit_ids: unitIds } : {}),
    });
    setConfirmSend(false);
    if (!ok) {
      toast({ title: t("errors.generic"), variant: "destructive" });
      return;
    }
    toast({
      title: t("inviteResultTitle"),
      description: t("inviteResult", { sent: Number(body.sent ?? 0), skipped: Number(body.skipped ?? 0), failed: Number(body.failed ?? 0) }),
      variant: Number(body.failed ?? 0) > 0 ? "destructive" : "success",
    });
    router.refresh();
  };

  const setStatus = async (status: "open" | "closed") => {
    const { ok } = await call("status", `/api/visits/campaigns/${campaign.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (!ok) toast({ title: t("errors.generic"), variant: "destructive" });
    router.refresh();
  };

  const deleteVisit = async () => {
    const { ok } = await call("delete", `/api/visits/campaigns/${campaign.id}`, { method: "DELETE" });
    if (!ok) {
      setConfirmDelete(false);
      toast({ title: t("errors.generic"), variant: "destructive" });
      return;
    }
    router.push(`/${locale}/properties/${propertyId}/visits`);
    router.refresh();
  };

  const cancelBooking = async () => {
    if (!cancelTarget?.booking) return;
    const { ok } = await call("cancel", `/api/visits/bookings/${cancelTarget.booking.id}`, { method: "DELETE" });
    setCancelTarget(null);
    if (!ok) toast({ title: t("errors.generic"), variant: "destructive" });
    else toast({ title: t("bookingCancelled"), variant: "success" });
    router.refresh();
  };

  const openBook = (unit: BoardUnit) => {
    setBookTarget(unit);
    setBookSlot("");
    setDialogError("");
  };

  const bookForUnit = async () => {
    if (!bookTarget || !bookSlot) return;
    const { ok, body } = await call("book", `/api/visits/campaigns/${campaign.id}/bookings`, {
      method: "POST",
      body: JSON.stringify({ unit_id: bookTarget.unit_id, slot_start: bookSlot }),
    });
    if (!ok) {
      setDialogError(
        body.error === "slot_taken" ? t("errors.slotTaken") : body.error === "already_booked" ? t("errors.alreadyBooked") : t("errors.generic")
      );
      router.refresh();
      return;
    }
    setBookTarget(null);
    toast({
      title: t("bookedForUnit", { unit: bookTarget.unit_number }),
      description: body.notified ? t("tenantNotified") : t("tenantNotNotified"),
      variant: "success",
    });
    router.refresh();
  };

  const statusBadge = (u: BoardUnit) =>
    u.booking ? (
      <div className="flex flex-col items-start gap-1">
        <Badge variant="success">{t("unitBooked")}</Badge>
        {u.booking.work_status && (
          <Badge variant={u.booking.work_status === "done" ? "default" : "destructive"}>
            {u.booking.work_status === "done" ? t("workDone") : t("workNotEntered")}
            {u.booking.work_status === "not_entered" && u.booking.work_reason
              ? ` · ${t(`workReasons.${u.booking.work_reason}`)}`
              : ""}
          </Badge>
        )}
        {u.booking.work_note && (
          <p className="text-[11px] text-text-secondary max-w-48 line-clamp-2" title={u.booking.work_note}>
            {u.booking.work_note}
          </p>
        )}
      </div>
    ) : (
      <Badge variant="warning">{t("unitPending")}</Badge>
    );

  const rowActions = (u: BoardUnit) =>
    u.booking ? (
      <Button type="button" size="sm" variant="ghost" onClick={() => setCancelTarget(u)} className="text-destructive">
        <CalendarX aria-hidden="true" className="h-3.5 w-3.5" />
        {t("cancelBooking")}
      </Button>
    ) : (
      <div className="flex flex-wrap justify-end gap-1">
        {live && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            loading={busy === `send-${u.unit_id}`}
            disabled={!u.tenant_phone}
            onClick={() => sendInvites([u.unit_id])}
          >
            <Send aria-hidden="true" className="h-3.5 w-3.5" />
            {t("sendLink")}
          </Button>
        )}
        <Button type="button" size="sm" variant="secondary" onClick={() => openBook(u)} disabled={freeSlots.length === 0}>
          <CalendarCheck aria-hidden="true" className="h-3.5 w-3.5" />
          {t("book")}
        </Button>
      </div>
    );

  const slotText = (u: BoardUnit) =>
    u.booking ? (
      <span>{formatSlotRange(u.booking.slot_start, campaign.slot_minutes, locale)}</span>
    ) : (
      <span className="text-text-secondary">—</span>
    );

  const contactLine = (u: BoardUnit) =>
    u.booking?.contact_phone ? (
      <div className="text-xs text-text-secondary">
        {t("bookedWith")} <span className="font-mono ltr-nums">{displayPhone(u.booking.contact_phone)}</span>
      </div>
    ) : null;

  const messageCell = (u: BoardUnit) => {
    if (!u.message) return <span className="text-xs text-text-secondary">{t("msgNone")}</span>;
    const state = messageState(u.message);
    const problem = messageProblem(u.message);
    return (
      <div className="space-y-1 max-w-56">
        <Badge variant={STATE_BADGE[state]}>
          {t(`msgKind.${u.message.kind}`)} · {t(`msgState.${state}`)}
        </Badge>
        {problem && (
          <p className="text-[11px] leading-snug text-text-secondary line-clamp-2" title={problem}>
            {isOutsideWindowError(problem)
              ? t("msgOutsideWindow")
              : problem === "tenant has no phone"
                ? t("msgSkipNoPhone")
                : problem === "tenant notifications disabled"
                  ? t("msgSkipNotificationsOff")
                  : problem}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Overview + share link */}
      <section className="bg-surface border border-border/60 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={campaign.over ? "secondary" : campaign.status === "open" ? "success" : "warning"}>
            {campaign.over ? t("statusFinished") : campaign.status === "open" ? t("statusOpen") : t("statusClosed")}
          </Badge>
          <span className="text-sm text-text-secondary">
            {formatVisitDates(campaign, locale)} · <span className="ltr-nums">{campaign.day_start}–{campaign.day_end}</span> ·{" "}
            {t("minutesShort", { minutes: campaign.slot_minutes })}
          </span>
        </div>
        {campaign.notes && (
          <p className="flex gap-2 text-sm text-text-secondary whitespace-pre-line">
            <Info aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5 text-accent" />
            <span>{campaign.notes}</span>
          </p>
        )}

        {live ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-primary">{t("shareLink")}</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                readOnly
                value={shareLink}
                aria-label={t("shareLink")}
                className="font-mono text-xs ltr-nums"
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="flex gap-2 shrink-0">
                <Button type="button" variant="secondary" onClick={copy} disabled={!shareLink}>
                  {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
                  {copied ? t("copied") : t("copy")}
                </Button>
                <a
                  href={shareLink || undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("openLink")}
                  className="inline-flex items-center justify-center h-10 w-10 rounded-xl border border-border/60 text-text-secondary hover:text-accent hover:border-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <ExternalLink aria-hidden="true" className="h-4 w-4" />
                </a>
              </div>
            </div>
            <p className="text-xs text-text-secondary">{t("shareLinkHelp")}</p>
          </div>
        ) : (
          <Alert variant="info">{campaign.over ? t("finishedNote") : t("closedNote")}</Alert>
        )}

        <ContractorLink campaignId={campaign.id} locale={locale} initialToken={campaign.crew_token} />

        <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
          {live && (
            <Button type="button" onClick={() => setConfirmSend(true)} disabled={pending.length === 0}>
              <Send aria-hidden="true" className="h-4 w-4" />
              {t("sendToPending", { count: pending.length })}
            </Button>
          )}
          {!campaign.over &&
            (campaign.status === "open" ? (
              <Button type="button" variant="secondary" loading={busy === "status"} onClick={() => setStatus("closed")}>
                <Lock aria-hidden="true" className="h-4 w-4" />
                {t("closeBookings")}
              </Button>
            ) : (
              <Button type="button" variant="secondary" loading={busy === "status"} onClick={() => setStatus("open")}>
                <LockOpen aria-hidden="true" className="h-4 w-4" />
                {t("reopenBookings")}
              </Button>
            ))}
          <Button type="button" variant="ghost" className="text-destructive ms-auto" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {t("deleteVisit")}
          </Button>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t("statBooked"), value: booked.length, tone: "text-success" },
          {
            label: t("statDone"),
            value: booked.filter((u) => u.booking?.work_status === "done").length,
            tone: "text-accent",
          },
          { label: t("statPending"), value: pending.length, tone: "text-warning" },
          { label: t("statVacant"), value: vacant, tone: "text-text-secondary" },
        ].map((s) => (
          <div key={s.label} className="bg-surface border border-border/60 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-1">{s.label}</p>
            <p className={cn("text-xl font-bold font-mono tabular-nums ltr-nums", s.tone)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* WhatsApp delivery summary */}
      {messaged > 0 && (
        <section className="bg-surface border border-border/60 rounded-xl p-4 space-y-3" aria-label={t("msgTitle")}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 className="text-sm font-semibold text-text-primary font-display">{t("msgTitle")}</h2>
            {(["read", "delivered", "sent", "failed", "skipped"] as VisitMessageState[]).map((state) =>
              messageCounts[state] > 0 ? (
                <span key={state} className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                  <Badge variant={STATE_BADGE[state]}>{t(`msgState.${state}`)}</Badge>
                  <span className="font-mono ltr-nums text-text-primary">{messageCounts[state]}</span>
                </span>
              ) : null
            )}
            {occupied.length - messaged > 0 && (
              <span className="text-xs text-text-secondary">
                {t("msgNotMessaged", { count: occupied.length - messaged })}
              </span>
            )}
          </div>
          {messageCounts.sent > 0 && <p className="text-xs text-text-secondary">{t("msgSentHint")}</p>}
          {(templateProblem || outsideWindow) && (
            <Alert variant="warning" title={t("msgTemplateTitle")}>
              {t("msgTemplateBody")}
              {templateProblem && (
                <span className="block mt-1 text-xs opacity-80">
                  {t("msgTemplateReason")}: {templateProblem}
                </span>
              )}
            </Alert>
          )}
        </section>
      )}

      {/* View switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-border/60 p-1 bg-surface" role="group" aria-label={t("view")}>
          {(["units", "schedule"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "px-4 h-8 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                view === v ? "bg-accent text-accent-foreground" : "text-text-secondary hover:text-text-primary"
              )}
            >
              {v === "units" ? t("viewUnits") : t("viewSchedule")}
            </button>
          ))}
        </div>
        {view === "units" && (
          <div className="flex flex-wrap gap-2" role="group" aria-label={tc("filter")}>
            {(
              [
                ["all", t("filterAll"), occupied.length],
                ["pending", t("filterPending"), pending.length],
                ["booked", t("filterBooked"), booked.length],
                ...(msgFailed.length > 0 ? [["msgFailed", t("filterMsgFailed"), msgFailed.length]] : []),
              ] as [Filter, string, number][]
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  filter === key
                    ? "border-accent bg-accent/10 text-text-primary"
                    : "border-border/60 text-text-secondary hover:border-accent/40"
                )}
              >
                {label}
                <span className="font-mono ltr-nums">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "units" ? (
        shown.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck className="h-5 w-5" />}
            title={filter === "pending" ? t("allBookedTitle") : t("noUnitsTitle")}
            description={filter === "pending" ? t("allBookedDescription") : undefined}
          />
        ) : (
          <>
            <div className="hidden md:block bg-surface border border-border/60 rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tc("unit")}</TableHead>
                    <TableHead>{tc("tenant")}</TableHead>
                    <TableHead>{tc("status")}</TableHead>
                    <TableHead>{t("time")}</TableHead>
                    <TableHead>{t("msgColumn")}</TableHead>
                    <TableHead className="text-end">{tc("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((u) => (
                    <TableRow key={u.unit_id}>
                      <TableCell className="font-mono ltr-nums font-semibold">{u.unit_number}</TableCell>
                      <TableCell>
                        <div className="text-text-primary">{u.tenant_name}</div>
                        {u.tenant_phone && <div className="text-xs text-text-secondary font-mono ltr-nums">{u.tenant_phone}</div>}
                      </TableCell>
                      <TableCell>{statusBadge(u)}</TableCell>
                      <TableCell>
                        {slotText(u)}
                        {u.booking?.booked_by === "staff" && (
                          <span className="ms-2 text-[10px] uppercase tracking-wider text-text-secondary">{t("byStaff")}</span>
                        )}
                        {contactLine(u)}
                      </TableCell>
                      <TableCell>{messageCell(u)}</TableCell>
                      <TableCell className="text-end">{rowActions(u)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="md:hidden space-y-2">
              {shown.map((u) => (
                <li key={u.unit_id} className="bg-surface border border-border/60 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono ltr-nums font-semibold text-text-primary">
                      {tc("unit")} {u.unit_number}
                    </span>
                    {statusBadge(u)}
                  </div>
                  <p className="text-sm text-text-secondary">
                    {u.tenant_name}
                    {u.tenant_phone && <span className="font-mono ltr-nums"> · {u.tenant_phone}</span>}
                  </p>
                  {u.booking && <p className="text-sm text-text-primary">{slotText(u)}</p>}
                  {contactLine(u)}
                  {messageCell(u)}
                  <div className="flex justify-end">{rowActions(u)}</div>
                </li>
              ))}
            </ul>
          </>
        )
      ) : schedule.length === 0 ? (
        <EmptyState icon={<CalendarCheck className="h-5 w-5" />} title={t("noBookingsTitle")} description={t("noBookingsDescription")} />
      ) : (
        <div className="space-y-4">
          {schedule.map(([day, rows]) => (
            <section key={day} className="bg-surface border border-border/60 rounded-xl overflow-hidden">
              <h3 className="px-4 py-2.5 border-b border-border/40 text-sm font-semibold text-text-primary font-display">
                {formatVisitDay(day, locale)}
                <span className="ms-2 text-xs font-sans font-normal text-text-secondary">
                  {t("visitsCount", { count: rows.length })}
                </span>
              </h3>
              <ol className="divide-y divide-border/40">
                {rows.map((u) => (
                  <li key={u.unit_id} className="flex items-center gap-4 px-4 py-2.5">
                    <span className="font-mono ltr-nums text-sm text-accent w-14 shrink-0">
                      {formatSlotTime(u.booking!.slot_start, locale)}
                    </span>
                    <span className="font-mono ltr-nums text-sm font-semibold text-text-primary w-16 shrink-0">
                      {u.unit_number}
                    </span>
                    <span className="text-sm text-text-secondary truncate">{u.tenant_name}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {/* Send to all pending */}
      <Dialog open={confirmSend} onOpenChange={setConfirmSend}>
        <DialogContent maxWidth="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("sendConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("sendConfirmBody", { count: pending.length })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmSend(false)} disabled={busy === "send"}>
              {tc("cancel")}
            </Button>
            <Button type="button" onClick={() => sendInvites()} loading={busy === "send"}>
              <Send aria-hidden="true" className="h-4 w-4" />
              {t("send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete visit */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent maxWidth="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("deleteConfirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy === "delete"}>
              {tc("cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={deleteVisit} loading={busy === "delete"}>
              {t("deleteVisit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel one booking */}
      <Dialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent maxWidth="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("cancelBookingTitle", { unit: cancelTarget?.unit_number ?? "" })}</DialogTitle>
            <DialogDescription>{t("cancelBookingBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCancelTarget(null)} disabled={busy === "cancel"}>
              {tc("cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={cancelBooking} loading={busy === "cancel"}>
              {t("cancelBooking")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Book on behalf of a tenant */}
      <Dialog open={bookTarget !== null} onOpenChange={(open) => !open && setBookTarget(null)}>
        <DialogContent maxWidth="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("bookTitle", { unit: bookTarget?.unit_number ?? "" })}</DialogTitle>
            <DialogDescription>{t("bookBody")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Select label={t("time")} value={bookSlot} onChange={(e) => setBookSlot(e.target.value)}>
              <option value="">{t("selectTime")}</option>
              {slotsByDay.map(([day, slots]) => (
                <optgroup key={day} label={formatVisitDay(day, locale)}>
                  {slots.map((s) => (
                    <option key={s} value={s}>
                      {formatSlotTime(s, locale)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            {dialogError && <Alert variant="destructive">{dialogError}</Alert>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setBookTarget(null)} disabled={busy === "book"}>
              {tc("cancel")}
            </Button>
            <Button type="button" onClick={bookForUnit} loading={busy === "book"} disabled={!bookSlot}>
              <CalendarCheck aria-hidden="true" className="h-4 w-4" />
              {t("book")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
