"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";

interface InvoicesTabsProps {
  invoices: Record<string, unknown>[];
  availableMonths: string[];
  currentStatus: string;
  currentMonth: string;
  currentProperty?: string;
  locale: string;
}

export function InvoicesTabs({
  invoices,
  availableMonths,
  currentStatus,
  currentMonth,
  currentProperty,
  locale,
}: InvoicesTabsProps) {
  const t = useTranslations("invoices");
  const router = useRouter();

  // Compute counts for badge display
  const now = new Date();
  const allCount = invoices.length;
  const pendingCount = invoices.filter(
    (inv) =>
      (inv.status as string) === "pending" ||
      (inv.status as string) === "overdue" ||
      (inv.status as string) === "partial"
  ).length;
  const paidCount = invoices.filter(
    (inv) => (inv.status as string) === "paid"
  ).length;
  const resolvedCount = invoices.filter(
    (inv) =>
      (inv.status as string) === "written_off" ||
      (inv.status as string) === "cancelled"
  ).length;

  const tabs = [
    { key: "all", label: t("all"), count: allCount },
    { key: "pending", label: t("pending"), count: pendingCount },
    { key: "paid", label: t("paid"), count: paidCount },
    { key: "resolved", label: t("resolved"), count: resolvedCount },
  ];

  function buildUrl(status: string, month: string) {
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (month) params.set("month", month);
    if (currentProperty) params.set("property", currentProperty);
    const qs = params.toString();
    return `/${locale}/invoices${qs ? `?${qs}` : ""}`;
  }

  function handleTabChange(tab: string) {
    router.push(buildUrl(tab, currentMonth));
  }

  function handleMonthChange(month: string) {
    router.push(buildUrl(currentStatus, month));
  }

  function formatMonth(monthStr: string) {
    const [year, mon] = monthStr.split("-").map(Number);
    const date = new Date(year, mon - 1);
    return date.toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      {/* Status Tabs */}
      <div className="flex items-center gap-0.5 bg-surface border border-border/60 rounded-xl p-1">
        {tabs.map((tab) => {
          const isActive = currentStatus === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`relative flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                isActive
                  ? "bg-accent text-accent-foreground shadow-sm shadow-accent/20"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
              }`}
            >
              {tab.label}
              <span
                className={`text-[10px] font-semibold font-mono tabular-nums px-1.5 py-0.5 rounded-md ${
                  isActive
                    ? "bg-accent-foreground/15 text-accent-foreground"
                    : "bg-surface-elevated text-text-secondary"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Month Filter */}
      <div className="relative">
        <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
        <select
          value={currentMonth}
          onChange={(e) => handleMonthChange(e.target.value)}
          className="h-10 pl-9 pr-8 bg-surface border border-border/60 rounded-xl text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all duration-200 appearance-none cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238A8697' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 10px center",
          }}
        >
          <option value="">{t("allMonths")}</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
