"use client";

import { CURRENCY } from "@/lib/currency";
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
  if (data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-text-secondary text-sm">
        No data available
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
            axisLine={{ stroke: "var(--color-border)", strokeOpacity: 0.4 }}
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
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: 500,
              boxShadow: "0 8px 32px color-mix(in srgb, var(--color-background) 60%, transparent)",
            }}
            labelStyle={{ color: "var(--color-text-primary)", fontWeight: 600 }}
            formatter={(value) => [`${Number(value).toFixed(2)} ${CURRENCY.code}`]}
            cursor={{ fill: "var(--color-surface-elevated)", opacity: 0.3 }}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", fontWeight: 500 }}
            iconType="square"
            iconSize={10}
          />
          <Bar
            dataKey="invoiced"
            name="Invoiced"
            fill="var(--color-accent)"
            radius={[4, 4, 0, 0]}
            opacity={0.35}
          />
          <Bar
            dataKey="collected"
            name="Collected"
            fill="var(--color-success)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
