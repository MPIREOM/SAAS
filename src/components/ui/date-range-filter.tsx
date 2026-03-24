"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Calendar } from "lucide-react";

interface DateRangeFilterProps {
  defaultMonth?: string;
  defaultYear?: string;
}

export function DateRangeFilter({ defaultMonth, defaultYear }: DateRangeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("common");

  const now = new Date();
  const currentMonth = defaultMonth || searchParams.get("month") || String(now.getMonth() + 1).padStart(2, "0");
  const currentYear = defaultYear || searchParams.get("year") || String(now.getFullYear());

  const monthKeys = [
    "monthJan", "monthFeb", "monthMar", "monthApr", "monthMay", "monthJun",
    "monthJul", "monthAug", "monthSep", "monthOct", "monthNov", "monthDec",
  ] as const;

  const months = monthKeys.map((key, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: t(key),
  }));

  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) {
    years.push(String(y));
  }

  function updateFilter(month: string, year: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", month);
    params.set("year", year);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
      <select
        value={currentMonth}
        onChange={(e) => updateFilter(e.target.value, currentYear)}
        aria-label={t("selectMonth")}
        className="h-8 px-2 bg-surface border border-border/50 rounded-lg text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 appearance-none cursor-pointer"
      >
        {months.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
      <select
        value={currentYear}
        onChange={(e) => updateFilter(currentMonth, e.target.value)}
        aria-label={t("selectYear")}
        className="h-8 px-2 bg-surface border border-border/50 rounded-lg text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 appearance-none cursor-pointer"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
