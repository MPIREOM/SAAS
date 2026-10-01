import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CalendarClock, ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CAMPAIGN_COLUMNS, getPropertyUnits, isVisitOver, type VisitCampaign } from "@/lib/visits/service";
import { formatVisitDates } from "@/lib/visits/slots";

export default async function PropertyVisitsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("visits");
  const tp = await getTranslations("properties");
  const supabase = await createClient();

  const { data: property } = await supabase
    .from("properties")
    .select("id, name")
    .eq("id", id)
    .eq("is_archived", false)
    .single();
  if (!property) notFound();
  const propertyIds = await getUserAccessiblePropertyIds(supabase);
  if (propertyIds !== null && !propertyIds.includes(id)) notFound();

  const [{ data: campaigns }, units] = await Promise.all([
    supabase
      .from("visit_campaigns")
      .select(CAMPAIGN_COLUMNS)
      .eq("property_id", id)
      .order("start_date", { ascending: false }),
    getPropertyUnits(supabase, id),
  ]);
  const list = (campaigns || []) as VisitCampaign[];
  const { data: bookings } = list.length
    ? await supabase
        .from("visit_bookings")
        .select("campaign_id")
        .eq("status", "booked")
        .in("campaign_id", list.map((c) => c.id))
    : { data: [] };

  const occupiedCount = units.filter((u) => u.tenant).length;
  const bookedByCampaign = new Map<string, number>();
  for (const b of (bookings || []) as { campaign_id: string }[]) {
    bookedByCampaign.set(b.campaign_id, (bookedByCampaign.get(b.campaign_id) ?? 0) + 1);
  }
  const newLink = (
    <Link
      href={`/${locale}/properties/${id}/visits/new`}
      className="inline-flex items-center gap-2 h-10 px-5 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm shadow-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <Plus aria-hidden="true" className="h-4 w-4" />
      {t("newVisit")}
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        breadcrumbs={[
          { label: tp("title"), href: `/${locale}/properties` },
          { label: property.name, href: `/${locale}/properties/${id}` },
          { label: t("title") },
        ]}
      >
        {newLink}
      </PageHeader>

      {list.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-5 w-5" />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={newLink}
        />
      ) : (
        <ul className="space-y-3 stagger-children">
          {list.map((c) => {
            const over = isVisitOver(c);
            const booked = bookedByCampaign.get(c.id) ?? 0;
            const pct = occupiedCount > 0 ? Math.min(100, Math.round((booked / occupiedCount) * 100)) : 0;
            return (
              <li key={c.id}>
                <Link
                  href={`/${locale}/properties/${id}/visits/${c.id}`}
                  className="group flex items-center gap-4 bg-surface border border-border/60 rounded-xl p-4 hover:border-accent/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-text-primary truncate">{c.title}</span>
                      <Badge variant={over ? "secondary" : c.status === "open" ? "success" : "warning"}>
                        {over ? t("statusFinished") : c.status === "open" ? t("statusOpen") : t("statusClosed")}
                      </Badge>
                    </div>
                    <p className="text-xs text-text-secondary">
                      {formatVisitDates(c, locale)} ·{" "}
                      <span className="ltr-nums">
                        {c.day_start.slice(0, 5)}–{c.day_end.slice(0, 5)}
                      </span>{" "}
                      ·{" "}
                      {t("minutesShort", { minutes: c.slot_minutes })}
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 max-w-48 bg-border/50 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-text-secondary">
                        {t("bookedOf", { booked, total: occupiedCount })}
                      </span>
                    </div>
                  </div>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 text-text-secondary group-hover:text-accent rtl:rotate-180" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
