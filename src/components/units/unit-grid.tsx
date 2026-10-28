"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertCircle, FileWarning } from "lucide-react";
import { CURRENCY, formatAmount } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

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
  /** IDs of units whose current tenant has a municipality contract covering today */
  unitIdsWithMunicipalityContract: string[];
}

const STATUS_FILTERS = ["all", "occupied", "vacant", "maintenance"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

// Occupied reads as information, vacant as an opportunity, maintenance as attention
const statusBadge: Record<UnitStatus, "info" | "success" | "warning"> = {
  occupied: "info",
  vacant: "success",
  maintenance: "warning",
};

export function UnitGrid({
  propertyId,
  locale,
  units,
  tenantIdsWithCheques,
  unitIdsWithMunicipalityContract,
}: UnitGridProps) {
  const tu = useTranslations("units");
  const tch = useTranslations("cheques");
  const tmc = useTranslations("municipalityContract");
  const [filter, setFilter] = React.useState<StatusFilter>("all");

  const tenantChequeSet = React.useMemo(
    () => new Set(tenantIdsWithCheques),
    [tenantIdsWithCheques]
  );
  const municipalityContractSet = React.useMemo(
    () => new Set(unitIdsWithMunicipalityContract),
    [unitIdsWithMunicipalityContract]
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
        className="mb-4 inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[9px] border border-border bg-sunken p-[3px]"
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
                "shrink-0 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
                isActive
                  ? "bg-surface text-text-primary shadow-card ring-1 ring-border"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              <span>
                {f === "all" ? tu("filterAll") : tu(f)}
              </span>
              <span className="text-xs font-medium tabular-nums ltr-nums text-text-tertiary">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={tu("noUnitsForFilter")} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2.5 sm:gap-3">
          {filtered.map((unit) => {
            const status = ((unit.status as UnitStatus) || "vacant") as UnitStatus;
            const missingCheques =
              status === "occupied" &&
              !!unit.active_tenant_id &&
              !tenantChequeSet.has(unit.active_tenant_id);
            const missingMunicipalityContract =
              status === "occupied" &&
              !!unit.active_tenant_id &&
              !municipalityContractSet.has(unit.id);

            return (
              <Link
                key={unit.id}
                href={`/${locale}/properties/${propertyId}/units/${unit.id}`}
                className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-surface p-3.5 shadow-card transition-colors duration-150 hover:border-border-strong hover:bg-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <div className="flex items-center gap-1.5">
                  <p className="min-w-0 truncate text-[15px] font-bold tabular-nums ltr-nums text-text-primary">
                    {unit.unit_number}
                  </p>
                  <div className="ms-auto flex shrink-0 items-center gap-1">
                    {missingCheques && (
                      <span
                        title={tch("missingCheques")}
                        aria-label={tch("missingCheques")}
                        className="inline-flex"
                      >
                        <AlertCircle
                          aria-hidden="true"
                          className="h-4 w-4 text-destructive-text"
                        />
                      </span>
                    )}
                    {missingMunicipalityContract && (
                      <span
                        title={tmc("missing")}
                        aria-label={tmc("missing")}
                        className="inline-flex"
                      >
                        <FileWarning
                          aria-hidden="true"
                          className="h-4 w-4 text-warning"
                        />
                      </span>
                    )}
                  </div>
                </div>

                <Badge variant={statusBadge[status] ?? "secondary"} className="self-start">
                  {tu(status)}
                </Badge>

                {unit.active_tenant_name ? (
                  <p className="truncate text-[13px] text-text-secondary">
                    {unit.active_tenant_name}
                  </p>
                ) : unit.bedrooms != null ? (
                  <p className="truncate text-[13px] text-text-tertiary">
                    {unit.bedrooms === 0
                      ? tu("types.studio")
                      : unit.bedrooms >= 1 && unit.bedrooms <= 4
                        ? tu(`types.${unit.bedrooms}br`)
                        : `${unit.bedrooms} BR`}
                  </p>
                ) : unit.unit_type ? (
                  <p className="truncate text-[13px] capitalize text-text-tertiary">
                    {unit.unit_type}
                  </p>
                ) : null}

                {unit.rent_amount ? (
                  <p className="mt-auto pt-1 text-sm font-semibold tabular-nums ltr-nums text-text-primary">
                    {formatAmount(Number(unit.rent_amount))}
                    <small className="ms-1 text-xs font-medium text-text-secondary">
                      {CURRENCY.code}
                    </small>
                  </p>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
