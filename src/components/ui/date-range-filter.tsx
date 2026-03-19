"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Calendar } from "lucide-react";

interface DateRangeFilterProps {
  defaultMonth?: string;
  defaultYear?: string;
}

export function DateRangeFilter({ defaultMonth, defaultYear }: DateRangeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const now = new Date();
  const currentMonth = defaultMonth || searchParams.get("month") || String(now.getMonth() + 1).padStart(2, "0");
  const currentYear = defaultYear || searchParams.get("year") || String(now.getFullYear());

  const months = [
    { value: "01", label: "Jan" },
    { value: "02", label: "Feb" },
    { value: "03", label: "Mar" },
    { value: "04", label: "Apr" },
    { value: "05", label: "May" },
    { value: "06", label: "Jun" },
    { value: "07", label: "Jul" },
    { value: "08", label: "Aug" },
    { value: "09", label: "Sep" },
    { value: "10", label: "Oct" },
    { value: "11", label: "Nov" },
    { value: "12", label: "Dec" },
  ];

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
      <Calendar className="h-3.5 w-3.5 text-text-secondary" />
      <select
        value={currentMonth}
        onChange={(e) => updateFilter(e.target.value, currentYear)}
        className="h-8 px-2 bg-surface border border-border/50 rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent/50 appearance-none cursor-pointer"
      >
        {months.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
      <select
        value={currentYear}
        onChange={(e) => updateFilter(currentMonth, e.target.value)}
        className="h-8 px-2 bg-surface border border-border/50 rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent/50 appearance-none cursor-pointer"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
