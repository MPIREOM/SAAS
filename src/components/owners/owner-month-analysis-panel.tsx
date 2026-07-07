"use client";

import { useLocale, useTranslations } from "next-intl";
import { TrendingUp } from "lucide-react";
import { CURRENCY } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import type { OwnerMonthAnalysis } from "@/components/owners/types";

// Month analysis card: credits/charges/net-change stat tiles with deltas vs
// the previous month, expense totals by category, and rent by payment method.
// All figures come pre-aggregated from the server over the SAME window as the
// breakdown card, so the two always reconcile.
export function OwnerMonthAnalysisPanel({
  analysis,
  isCurrentMonth,
}: {
  analysis: OwnerMonthAnalysis;
  isCurrentMonth: boolean;
}) {
  const t = useTranslations("owners");
  const tExpenses = useTranslations("expenses");
  const locale = useLocale();

  const netTone =
    analysis.netChange > 0.005
      ? "text-success"
      : analysis.netChange < -0.005
        ? "text-destructive"
        : "text-text-primary";
  const maxCategory = Math.max(
    ...analysis.expensesByCategory.map((c) => c.amount),
    0,
  );

  return (
    <section
      aria-label={t("analysis.title", { month: formatMonthLabel(analysis.month, locale) })}
      className="animate-fade-in-up rounded-xl border border-border/60 bg-surface-elevated/30 p-6"
    >
      <h2 className="mb-4 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-wider text-text-secondary">
        <TrendingUp aria-hidden="true" className="h-4 w-4 text-accent" />
        {t("analysis.title", { month: formatMonthLabel(analysis.month, locale) })}
      </h2>

      {/* Headline figures for the month */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t("analysis.credits")}
          value={analysis.credits}
          sign="+"
          tone="text-success"
          delta={analysis.prev ? analysis.credits - analysis.prev.credits : null}
          deltaLabel={t("analysis.vsPreviousMonth")}
        />
        <StatTile
          label={t("analysis.charges")}
          value={analysis.charges}
          sign="-"
          tone="text-destructive"
          delta={analysis.prev ? analysis.charges - analysis.prev.charges : null}
          deltaLabel={t("analysis.vsPreviousMonth")}
        />
        <StatTile
          label={t("analysis.netChange")}
          value={analysis.netChange}
          sign={analysis.netChange > 0.005 ? "+" : ""}
          tone={netTone}
          delta={analysis.prev ? analysis.netChange - analysis.prev.netChange : null}
          deltaLabel={t("analysis.vsPreviousMonth")}
        />
        <StatTile
          label={isCurrentMonth ? t("currentBalance") : t("closingBalance")}
          value={analysis.closingBalance}
          sign={analysis.closingBalance > 0.005 ? "+" : ""}
          tone="text-accent"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Expenses by category */}
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {t("analysis.expensesByCategory")}
          </h3>
          {analysis.expensesByCategory.length === 0 ? (
            <p className="text-sm text-text-secondary">{t("analysis.noExpenses")}</p>
          ) : (
            <ul className="space-y-3">
              {analysis.expensesByCategory.map((c) => (
                <li key={c.category}>
                  <div className="mb-1 flex items-baseline justify-between gap-4 text-sm">
                    <span className="min-w-0 truncate text-text-primary">
                      {tExpenses.has(`categories.${c.category}`)
                        ? tExpenses(`categories.${c.category}`)
                        : c.category}
                      <span className="ms-2 text-xs text-text-secondary ltr-nums">
                        {t("activity.entryCount", { count: c.count })}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono tabular-nums ltr-nums text-text-primary">
                      {fmt(c.amount)}
                    </span>
                  </div>
                  <div
                    aria-hidden="true"
                    className="h-1.5 overflow-hidden rounded-full bg-border/30"
                  >
                    <div
                      className="h-full rounded-full bg-accent/70"
                      style={{
                        width: `${maxCategory > 0 ? Math.max(4, (c.amount / maxCategory) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Rent collected by method */}
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {t("analysis.rentByMethod")}
          </h3>
          {analysis.rentByMethod.length === 0 ? (
            <p className="text-sm text-text-secondary">{t("analysis.noRent")}</p>
          ) : (
            <dl className="divide-y divide-border/30">
              {analysis.rentByMethod.map((r) => {
                const isCheque = r.method === "cheque";
                return (
                  <div
                    key={r.method}
                    className={cn(
                      "flex items-center justify-between gap-4 py-2.5 text-sm",
                      isCheque && "opacity-60",
                    )}
                  >
                    <dt className="min-w-0 text-text-secondary">
                      {t(`methods.${methodKey(r.method)}`)}
                      <span className="ms-2 text-xs ltr-nums">
                        {t("activity.entryCount", { count: r.count })}
                      </span>
                      {isCheque && (
                        <span className="ms-2 text-[10px] uppercase tracking-wider">
                          {t("breakdownRows.referenceOnly")}
                        </span>
                      )}
                    </dt>
                    <dd className="shrink-0 font-mono tabular-nums ltr-nums text-end text-text-primary">
                      {fmt(r.amount)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
        </div>
      </div>
    </section>
  );
}

function StatTile({
  label,
  value,
  sign,
  tone,
  delta = null,
  deltaLabel,
}: {
  label: string;
  value: number;
  sign: "+" | "-" | "";
  tone: string;
  delta?: number | null;
  deltaLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface-elevated/40 p-4">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-secondary">
        {label}
      </div>
      <div className={cn("font-mono text-lg font-semibold tabular-nums ltr-nums", tone)}>
        {sign && <span className="me-0.5">{sign}</span>}
        {fmt(Math.abs(value) < 0.005 ? 0 : value)}
        <span className="ms-1.5 text-xs font-medium text-text-secondary">
          {CURRENCY.code}
        </span>
      </div>
      {delta !== null && deltaLabel && (
        <div className="mt-1 text-xs text-text-secondary">
          <span className="font-mono tabular-nums ltr-nums">
            {delta > 0.005 ? "+" : ""}
            {fmt(Math.abs(delta) < 0.005 ? 0 : delta)}
          </span>{" "}
          {deltaLabel}
        </div>
      )}
    </div>
  );
}

// The month's rent figures are magnitudes; the leading sign glyph carries the
// credit/debit meaning textually so color is never the only signal.
function fmt(n: number): string {
  return n.toLocaleString("en-OM", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function methodKey(method: string): string {
  return method === "bank_transfer" ? "bankTransfer" : method;
}

function formatMonthLabel(month: string, locale: string): string {
  try {
    return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(
      `${locale}-u-nu-latn`,
      { month: "long", year: "numeric", timeZone: "UTC" },
    );
  } catch {
    return month;
  }
}
