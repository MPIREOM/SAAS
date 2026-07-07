"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, ChevronLeft, ChevronRight, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

// Steps through statement months via the ?month=YYYY-MM search param, so the
// server page re-fetches the breakdown + analysis for the chosen window.
// Bounded by the ledger start month and the current Muscat month.
export function OwnerMonthPicker({
  month,
  minMonth,
  maxMonth,
}: {
  month: string; // YYYY-MM currently selected
  minMonth: string; // YYYY-MM of the ledger start
  maxMonth: string; // YYYY-MM of the current month
}) {
  const t = useTranslations("owners.monthPicker");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const goTo = useCallback(
    (target: string) => {
      const params = new URLSearchParams(searchParams.toString());
      // Current month is the default view — keep the URL clean for it.
      if (target === maxMonth) params.delete("month");
      else params.set("month", target);
      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [searchParams, pathname, router, maxMonth],
  );

  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
        <CalendarDays aria-hidden="true" className="h-4 w-4 text-accent" />
        {t("label")}
      </div>
      <div className="flex items-center gap-1">
        {month !== maxMonth && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="me-1 text-text-secondary"
            onClick={() => goTo(maxMonth)}
          >
            <Undo2 aria-hidden="true" className="h-3.5 w-3.5 rtl:rotate-180" />
            {t("backToCurrent")}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-8 px-0"
          aria-label={t("previous")}
          disabled={prev < minMonth || isPending}
          onClick={() => goTo(prev)}
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <span
          aria-live="polite"
          className={cn(
            "min-w-36 text-center font-mono text-sm font-medium text-text-primary ltr-nums",
            isPending && "opacity-50",
          )}
        >
          {formatMonthLabel(month, locale)}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-8 px-0"
          aria-label={t("next")}
          disabled={next > maxMonth || isPending}
          onClick={() => goTo(next)}
        >
          <ChevronRight aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
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
