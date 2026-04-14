"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Home } from "lucide-react";
import { CURRENCY } from "@/lib/currency";
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
  return n.toLocaleString("en-OM", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
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
        "animate-fade-in-up rounded-xl border p-4 sm:p-5",
        hasOverdue
          ? "border-destructive/30 bg-destructive/5"
          : "border-warning/30 bg-warning/5"
      )}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            hasOverdue
              ? "bg-destructive/15 text-destructive"
              : "bg-warning/15 text-warning"
          )}
        >
          <AlertTriangle aria-hidden="true" className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-semibold",
              hasOverdue ? "text-destructive" : "text-warning"
            )}
          >
            {labels.overdueTitle}
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-text-primary">
            {hasOverdue && (
              <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <AlertTriangle
                  aria-hidden="true"
                  className="h-3.5 w-3.5 text-destructive"
                />
                <span className="font-medium">
                  {interpolate(labels.overdueLine, {
                    count: overdueCount,
                    amount: fmt(overdueAmount),
                    code: CURRENCY.code,
                  })}
                </span>
                <Link
                  href={invoicesHref}
                  className="ms-auto inline-flex items-center gap-1 text-xs font-semibold text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 rounded"
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
                <Home
                  aria-hidden="true"
                  className="h-3.5 w-3.5 text-warning"
                />
                <span className="font-medium">
                  {interpolate(labels.vacantLine, {
                    count: vacantCount,
                    cost: fmt(vacancyCost),
                    code: CURRENCY.code,
                  })}
                </span>
                <Link
                  href={propertiesHref}
                  className="ms-auto inline-flex items-center gap-1 text-xs font-semibold text-warning hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/40 rounded"
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
          className="text-xs text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded px-1"
          aria-label={labels.dismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
}
