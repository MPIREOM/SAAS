"use client";

import { CURRENCY, formatAmount } from "@/lib/currency";
import { useTranslations } from "next-intl";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

export interface MonthlyCollectionData {
  month: string;
  invoiced: number;
  collected: number;
}

interface CollectionChartProps {
  data: MonthlyCollectionData[];
}

export function CollectionChart({ data }: CollectionChartProps) {
  const t = useTranslations("reports");

  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-text-secondary">
        {t("noReportData")}
      </div>
    );
  }

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="20%">
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border)"
            strokeOpacity={0.4}
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tick={{ fill: "var(--color-text-secondary)", fontSize: 11, fontWeight: 500 }}
            axisLine={{ stroke: "var(--color-border-strong)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--color-text-secondary)", fontSize: 11, fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: 500,
              boxShadow: "var(--shadow-overlay)",
            }}
            labelStyle={{ color: "var(--color-text-primary)", fontWeight: 600 }}
            formatter={(value) => [`${formatAmount(Number(value))} ${CURRENCY.code}`]}
            cursor={{ fill: "var(--color-sunken)", opacity: 0.6 }}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", fontWeight: 500 }}
            iconType="square"
            iconSize={10}
          />
          <Bar
            dataKey="invoiced"
            name={t("invoicedLabel")}
            fill="var(--color-chart-3)"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="collected"
            name={t("collectedLabel")}
            fill="var(--color-chart-1)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
