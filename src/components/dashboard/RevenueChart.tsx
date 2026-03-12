"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface MonthData {
  month: string;
  paid: number;
  pending: number;
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
      <p className="font-medium text-text-primary mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }} className="font-mono ltr-nums">
          {entry.name}: {entry.value.toFixed(2)} OMR
        </p>
      ))}
    </div>
  );
};

export default function RevenueChart({ data }: { data: MonthData[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} barCategoryGap="30%" barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12, fill: "var(--color-text-secondary)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "var(--color-text-secondary)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}`}
          width={55}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-surface-elevated)", opacity: 0.6 }} />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
          formatter={(value) => (
            <span style={{ color: "var(--color-text-secondary)" }}>{value}</span>
          )}
        />
        <Bar dataKey="paid" name="Paid" fill="var(--color-success)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="pending" name="Pending / Overdue" fill="var(--color-warning)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
