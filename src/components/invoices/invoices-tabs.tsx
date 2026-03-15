"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface InvoicesTabsProps {
  invoices: Record<string, unknown>[];
  availableMonths: string[];
  currentStatus: string;
  currentMonth: string;
  locale: string;
}

export function InvoicesTabs({
  availableMonths,
  currentStatus,
  currentMonth,
  locale,
}: InvoicesTabsProps) {
  const t = useTranslations("invoices");
  const router = useRouter();

  const tabs = [
    { key: "all", label: t("all") },
    { key: "pending", label: t("pending") },
    { key: "paid", label: t("paid") },
  ];

  function buildUrl(status: string, month: string) {
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (month) params.set("month", month);
    const qs = params.toString();
    return `/${locale}/invoices${qs ? `?${qs}` : ""}`;
  }

  function handleTabChange(tab: string) {
    router.push(buildUrl(tab, currentMonth));
  }

  function handleMonthChange(month: string) {
    router.push(buildUrl(currentStatus, month));
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      {/* Status Tabs */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              currentStatus === tab.key
                ? "bg-accent text-background"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Month Filter */}
      <select
        value={currentMonth}
        onChange={(e) => handleMonthChange(e.target.value)}
        className="h-9 bg-surface border border-border rounded-md px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
      >
        <option value="">{t("allMonths")}</option>
        {availableMonths.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
