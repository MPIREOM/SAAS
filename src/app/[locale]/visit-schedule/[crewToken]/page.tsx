import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Building2, Phone } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AutoRefresh } from "@/components/visits/auto-refresh";
import { PublicVisitMessage, PublicVisitShell } from "@/components/visits/public-shell";
import { formatWhatsAppPhone } from "@/lib/maintenance/whatsapp";
import {
  createVisitsAdminClient,
  getCampaignByCrewToken,
  getPropertyUnits,
  isVisitOver,
  type OccupiedUnit,
} from "@/lib/visits/service";
import { formatSlotTime, formatVisitDates, formatVisitDay, muscatDate, slotKey } from "@/lib/visits/slots";

// Public, read-only schedule for the contractor doing a visit (048): booked
// times with unit, tenant name and phone, then the units that haven't
// booked. Reached by visit_campaigns.crew_token; staff can revoke it.

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const REFRESH_SECONDS = 60;

function PhoneLink({ phone }: { phone: string | null }) {
  if (!phone) return null;
  return (
    <a
      href={`tel:+${formatWhatsAppPhone(phone)}`}
      className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline font-mono ltr-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
    >
      <Phone aria-hidden="true" className="h-3.5 w-3.5" />
      {phone}
    </a>
  );
}

export default async function VisitSchedulePage({
  params,
}: {
  params: Promise<{ locale: string; crewToken: string }>;
}) {
  const { locale, crewToken } = await params;
  const t = await getTranslations("visitSchedule");
  const tb = await getTranslations("visitBooking");

  const db = createVisitsAdminClient();
  const campaign = await getCampaignByCrewToken(db, crewToken);
  if (!campaign) return <PublicVisitMessage title={tb("invalidLink")} message={t("invalidLinkMessage")} />;

  const [units, { data: bookings }] = await Promise.all([
    getPropertyUnits(db, campaign.property_id),
    db.from("visit_bookings").select("unit_id, slot_start").eq("campaign_id", campaign.id).eq("status", "booked"),
  ]);

  const unitById = new Map(units.map((u) => [u.unit_id, u]));
  const booked = ((bookings || []) as { unit_id: string; slot_start: string }[])
    .map((b) => ({ start: slotKey(b.slot_start), unit: unitById.get(b.unit_id) }))
    .filter((b): b is { start: string; unit: OccupiedUnit } => Boolean(b.unit))
    .sort((a, b) => a.start.localeCompare(b.start));
  const bookedIds = new Set(booked.map((b) => b.unit.unit_id));
  const notBooked = units.filter((u) => u.tenant && !bookedIds.has(u.unit_id));

  const days = new Map<string, typeof booked>();
  for (const b of booked) {
    const day = muscatDate(b.start);
    days.set(day, [...(days.get(day) ?? []), b]);
  }

  const over = isVisitOver(campaign);
  const updatedAt = formatSlotTime(new Date().toISOString(), locale);

  return (
    <PublicVisitShell title={campaign.title} subtitle={t("subtitle")}>
      <AutoRefresh seconds={REFRESH_SECONDS} />

      <div className="bg-surface border border-border/60 rounded-xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
              <Building2 aria-hidden="true" className="h-5 w-5 text-accent" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">{campaign.property_name}</p>
              <p className="text-xs text-text-secondary">
                {formatVisitDates(campaign, locale, "long")} ·{" "}
                <span className="ltr-nums">
                  {campaign.day_start.slice(0, 5)}–{campaign.day_end.slice(0, 5)}
                </span>
              </p>
            </div>
          </div>
          {(over || campaign.status === "closed") && (
            <Badge variant="secondary">{over ? t("finished") : t("bookingsClosed")}</Badge>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/40 bg-surface-elevated/50 p-3">
            <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">{t("booked")}</p>
            <p className="text-xl font-bold font-mono ltr-nums text-success">{booked.length}</p>
          </div>
          <div className="rounded-lg border border-border/40 bg-surface-elevated/50 p-3">
            <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">{t("notBooked")}</p>
            <p className="text-xl font-bold font-mono ltr-nums text-warning">{notBooked.length}</p>
          </div>
        </div>
        {campaign.notes && (
          <Alert variant="warning" title={tb("beforeWeArrive")}>
            <span className="whitespace-pre-line">{campaign.notes}</span>
          </Alert>
        )}
      </div>

      <section className="space-y-3" aria-label={t("schedule")}>
        <h2 className="text-sm font-semibold text-text-primary font-display">{t("schedule")}</h2>
        {booked.length === 0 ? (
          <p className="bg-surface border border-border/60 rounded-xl p-4 text-sm text-text-secondary">{t("noBookings")}</p>
        ) : (
          Array.from(days).map(([day, rows]) => (
            <div key={day} className="bg-surface border border-border/60 rounded-xl overflow-hidden">
              <h3 className="px-4 py-2.5 border-b border-border/40 text-sm font-semibold text-text-primary">
                {formatVisitDay(day, locale, "long")}
                <span className="ms-2 text-xs font-normal text-text-secondary">
                  {t("visitsCount", { count: rows.length })}
                </span>
              </h3>
              <ol className="divide-y divide-border/40">
                {rows.map((b) => (
                  <li key={b.unit.unit_id} className="flex gap-4 px-4 py-3">
                    <span className="font-mono ltr-nums text-sm font-semibold text-accent w-12 shrink-0 pt-0.5">
                      {formatSlotTime(b.start, locale)}
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-semibold text-text-primary">
                        {t("unit")} <span className="font-mono ltr-nums">{b.unit.unit_number}</span>
                      </p>
                      {b.unit.tenant && <p className="text-sm text-text-secondary">{b.unit.tenant.full_name}</p>}
                      <PhoneLink phone={b.unit.tenant?.phone ?? null} />
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </section>

      {notBooked.length > 0 && (
        <section className="space-y-3" aria-label={t("notBookedTitle")}>
          <div>
            <h2 className="text-sm font-semibold text-text-primary font-display">{t("notBookedTitle")}</h2>
            <p className="text-xs text-text-secondary mt-1">{t("notBookedHint")}</p>
          </div>
          <ul className="bg-surface border border-border/60 rounded-xl divide-y divide-border/40">
            {notBooked.map((u) => (
              <li key={u.unit_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="text-sm font-semibold text-text-primary w-24 shrink-0">
                  {t("unit")} <span className="font-mono ltr-nums">{u.unit_number}</span>
                </span>
                <span className="text-sm text-text-secondary min-w-0 flex-1 break-words">{u.tenant?.full_name}</span>
                <PhoneLink phone={u.tenant?.phone ?? null} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-xs text-text-secondary">
        {t("updated", { time: updatedAt, seconds: REFRESH_SECONDS })}
      </p>
    </PublicVisitShell>
  );
}
