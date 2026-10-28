"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, X } from "lucide-react";
import { CURRENCY, formatAmount } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

/**
 * Hero alert strip for the dashboard. Renders a prominent destructive
 * banner when there's overdue rent, plus a warning chip when there's
 * vacant inventory. The banner is dismissable per session via local
 * state — it always reappears on a fresh load if the underlying
 * problem still exists, so admins can't accidentally hide a real issue.
 *
 * Returns null when both numbers are zero so the dashboard doesn't
 * carry empty visual weight on a clean day.
 */

interface HeroAlertStripProps {
  overdueCount: number;
  overdueAmount: number;
  vacantCount: number;
  vacancyCost: number;
  invoicesHref: string;
  propertiesHref: string;
  labels: {
    overdueTitle: string; // e.g. "Action needed"
    overdueLine: string; // e.g. "{count} overdue invoices, {amount} {code} unpaid"
    overdueCta: string; // e.g. "Review overdue"
    vacantLine: string; // e.g. "{count} vacant units · {cost} {code}/mo lost revenue"
    vacantCta: string; // e.g. "View vacancies"
    dismiss: string; // e.g. "Dismiss"
  };
}

function fmt(n: number) {
  return formatAmount(n);
}

function interpolate(
  template: string,
  values: Record<string, string | number>
) {
  return template.replace(/\{(\w+)\}/g, (_m, k) =>
    values[k] !== undefined ? String(values[k]) : `{${k}}`
  );
}

export function HeroAlertStrip({
  overdueCount,
  overdueAmount,
  vacantCount,
  vacancyCost,
  invoicesHref,
  propertiesHref,
  labels,
}: HeroAlertStripProps) {
  const [dismissed, setDismissed] = React.useState(false);
  if (dismissed) return null;
  if (overdueCount === 0 && vacantCount === 0) return null;

  const hasOverdue = overdueCount > 0;
  const hasVacancy = vacantCount > 0;

  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border px-4 py-3.5",
        hasOverdue
          ? "border-destructive/30 bg-destructive-tint"
          : "border-warning/30 bg-warning-tint"
      )}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div
          className={cn(
            "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-surface",
            hasOverdue ? "text-destructive-text" : "text-warning"
          )}
        >
          <AlertTriangle aria-hidden="true" className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-bold",
              hasOverdue ? "text-destructive-text" : "text-warning"
            )}
          >
            {labels.overdueTitle}
          </p>
          <ul className="mt-1 flex flex-col gap-2 text-sm text-text-primary lg:flex-row lg:flex-wrap lg:gap-x-6">
            {hasOverdue && (
              <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="tabular-nums">
                  {interpolate(labels.overdueLine, {
                    count: overdueCount,
                    amount: fmt(overdueAmount),
                    code: CURRENCY.code,
                  })}
                </span>
                <Link
                  href={invoicesHref}
                  className="inline-flex min-h-6 items-center gap-1 rounded text-sm font-semibold text-destructive-text hover:underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {labels.overdueCta}
                  <ArrowRight
                    aria-hidden="true"
                    className="h-3 w-3 rtl:rotate-180"
                  />
                </Link>
              </li>
            )}
            {hasVacancy && (
              <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="tabular-nums">
                  {interpolate(labels.vacantLine, {
                    count: vacantCount,
                    cost: fmt(vacancyCost),
                    code: CURRENCY.code,
                  })}
                </span>
                <Link
                  href={propertiesHref}
                  className="inline-flex min-h-6 items-center gap-1 rounded text-sm font-semibold text-warning hover:underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {labels.vacantCta}
                  <ArrowRight
                    aria-hidden="true"
                    className="h-3 w-3 rtl:rotate-180"
                  />
                </Link>
              </li>
            )}
          </ul>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="-m-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-secondary hover:bg-surface hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          aria-label={labels.dismiss}
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
