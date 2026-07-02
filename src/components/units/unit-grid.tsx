"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertCircle, ChevronRight } from "lucide-react";
import { CURRENCY } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

/**
 * Interactive unit grid for the property detail page.
 *
 * Adds a row of filter chips above the grid (All / Occupied / Vacant /
 * Maintenance) so the property manager can drill into one segment of
 * units without scanning the whole list. Counts are baked into each
 * chip; an empty filtered subset shows a friendly inline message
 * rather than the page-level <EmptyState> (which would be misleading
 * since the property does have units).
 *
 * Rendering matches the previous server-rendered grid 1:1 — only the
 * filtering logic is new. Lifted out of the server page because state
 * is required.
 */

type UnitStatus = "occupied" | "vacant" | "maintenance";

export interface UnitGridItem {
  id: string;
  unit_number: string;
  status: UnitStatus | string | null;
  bedrooms?: number | null;
  unit_type?: string | null;
  rent_amount?: string | number | null;
  active_tenant_name?: string | null;
  active_tenant_id?: string | null;
}

interface UnitGridProps {
  propertyId: string;
  locale: string;
  units: UnitGridItem[];
  /** IDs of active tenants in this property who have at least one cheque on file */
  tenantIdsWithCheques: string[];
}

const STATUS_FILTERS = ["all", "occupied", "vacant", "maintenance"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const statusToneClasses: Record<
  UnitStatus,
  { bg: string; text: string; dot: string; border: string }
> = {
  vacant: {
    bg: "bg-success/5",
    text: "text-success",
    dot: "bg-success",
    border: "border-success/20 hover:border-success/40",
  },
  occupied: {
    bg: "bg-info/5",
    text: "text-info",
    dot: "bg-info",
    border: "border-info/20 hover:border-info/40",
  },
  maintenance: {
    bg: "bg-warning/5",
    text: "text-warning",
    dot: "bg-warning",
    border: "border-warning/20 hover:border-warning/40",
  },
};

export function UnitGrid({
  propertyId,
  locale,
  units,
  tenantIdsWithCheques,
}: UnitGridProps) {
  const tu = useTranslations("units");
  const tch = useTranslations("cheques");
  const [filter, setFilter] = React.useState<StatusFilter>("all");

  const tenantChequeSet = React.useMemo(
    () => new Set(tenantIdsWithCheques),
    [tenantIdsWithCheques]
  );

  // Pre-bucketed counts so each chip can show its tally without re-iterating.
  const counts = React.useMemo(() => {
    const c = { all: units.length, occupied: 0, vacant: 0, maintenance: 0 };
    for (const u of units) {
      const s = (u.status as UnitStatus) || "vacant";
      if (s === "occupied") c.occupied++;
      else if (s === "vacant") c.vacant++;
      else if (s === "maintenance") c.maintenance++;
    }
    return c;
  }, [units]);

  const filtered = React.useMemo(() => {
    if (filter === "all") return units;
    return units.filter((u) => ((u.status as string) || "vacant") === filter);
  }, [units, filter]);

  return (
    <div>
      {/* Filter chips — client-side filter, no navigation */}
      <div
        role="tablist"
        aria-label={tu("title")}
        className="mb-4 flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1"
      >
        {STATUS_FILTERS.map((f) => {
          const isActive = filter === f;
          const count = counts[f];
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilter(f)}
              className={cn(
                "shrink-0 inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                isActive
                  ? "bg-accent font-medium text-accent-foreground shadow-sm shadow-accent/20"
                  : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
              )}
            >
              <span>
                {f === "all" ? tu("filterAll") : tu(f)}
              </span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-mono tabular-nums ltr-nums",
                  isActive
                    ? "bg-accent-foreground/15 text-accent-foreground"
                    : "bg-surface-elevated text-text-secondary"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/40 px-6 py-10 text-center text-sm text-text-secondary">
          {tu("noUnitsForFilter")}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {filtered.map((unit) => {
            const status = ((unit.status as UnitStatus) || "vacant") as UnitStatus;
            const config = statusToneClasses[status] ?? statusToneClasses.vacant;
            const missingCheques =
              status === "occupied" &&
              !!unit.active_tenant_id &&
              !tenantChequeSet.has(unit.active_tenant_id);

            return (
              <Link
                key={unit.id}
                href={`/${locale}/properties/${propertyId}/units/${unit.id}`}
                className={cn(
                  "group rounded-xl border p-4 transition-all duration-200 hover:shadow-md hover:shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  config.bg,
                  config.border
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-bold font-mono ltr-nums text-text-primary group-hover:text-accent transition-colors">
                    {unit.unit_number}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {missingCheques && (
                      <span
                        title={tch("missingCheques")}
                        aria-label={tch("missingCheques")}
                        className="inline-flex"
                      >
                        <AlertCircle
                          aria-hidden="true"
                          className="h-3.5 w-3.5 text-destructive"
                        />
                      </span>
                    )}
                    <div className={cn("h-2.5 w-2.5 rounded-full", config.dot)} />
                  </div>
                </div>

                <span
                  className={cn(
                    "inline-block text-[10px] font-semibold uppercase tracking-wider",
                    config.text
                  )}
                >
                  {tu(status)}
                </span>

                {unit.active_tenant_name ? (
                  <p className="mt-1.5 truncate text-[11px] text-text-secondary">
                    {unit.active_tenant_name}
                  </p>
                ) : unit.bedrooms != null ? (
                  <p className="mt-1.5 truncate text-[11px] text-text-secondary/70">
                    {unit.bedrooms === 0
                      ? tu("types.studio")
                      : unit.bedrooms >= 1 && unit.bedrooms <= 4
                        ? tu(`types.${unit.bedrooms}br`)
                        : `${unit.bedrooms} BR`}
                  </p>
                ) : unit.unit_type ? (
                  <p className="mt-1.5 truncate text-[11px] capitalize text-text-secondary/70">
                    {unit.unit_type}
                  </p>
                ) : null}

                {unit.rent_amount ? (
                  <p className="mt-2 text-xs font-bold font-mono tabular-nums ltr-nums text-text-primary/70">
                    {Number(unit.rent_amount).toLocaleString("en-OM", {
                      minimumFractionDigits: 0,
                    })}{" "}
                    <span className="text-[10px] font-normal text-text-secondary">
                      {CURRENCY.code}
                    </span>
                  </p>
                ) : null}

                <div className="mt-2 flex items-center justify-end">
                  <ChevronRight
                    aria-hidden="true"
                    className="h-3 w-3 text-text-secondary/0 transition-all duration-200 group-hover:text-text-secondary/60 rtl:rotate-180"
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
