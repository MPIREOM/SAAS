"use client";

import { useEffect, useState } from "react";
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
import { createClient } from "@/lib/supabase/client";

interface MonthData {
  month: string;
  paid: number;
  pending: number;
}

export function RentChart() {
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();

      // Get all active leases with their monthly rent
      const { data: leases } = await supabase
        .from("leases")
        .select("id, monthly_rent, start_date, end_date, is_active")
        .eq("is_active", true);

      // Get all payments from the last 12 months
      const now = new Date();
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const startDate = twelveMonthsAgo.toISOString().split("T")[0];

      const { data: payments } = await supabase
        .from("payments")
        .select("amount, payment_date, lease_id")
        .gte("payment_date", startDate)
        .order("payment_date", { ascending: true });

      // Build monthly data
      const months: MonthData[] = [];
      for (let i = 0; i < 12; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const monthLabel = date.toLocaleDateString("en", {
          month: "short",
          year: "2-digit",
        });

        // Sum paid amounts for this month
        const paid = (payments || [])
          .filter((p) => {
            const pDate = new Date(p.payment_date as string);
            return (
              pDate.getFullYear() === date.getFullYear() &&
              pDate.getMonth() === date.getMonth()
            );
          })
          .reduce((sum, p) => sum + parseFloat(p.amount as string), 0);

        // Calculate expected rent for this month
        const expected = (leases || [])
          .filter((l) => {
            const start = new Date(l.start_date as string);
            const end = new Date(l.end_date as string);
            return start <= new Date(date.getFullYear(), date.getMonth() + 1, 0) && end >= date;
          })
          .reduce((sum, l) => sum + parseFloat(l.monthly_rent as string), 0);

        const pending = Math.max(0, expected - paid);

        months.push({
          month: monthLabel,
          paid: Math.round(paid * 100) / 100,
          pending: Math.round(pending * 100) / 100,
        });
      }

      setData(months);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
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
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tick={{ fill: "var(--color-text-secondary)", fontSize: 11 }}
            axisLine={{ stroke: "var(--color-border)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--color-text-secondary)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "var(--color-text-primary)", fontWeight: 500 }}
            formatter={(value) => [`${Number(value).toFixed(2)} OMR`]}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px" }}
            iconType="square"
            iconSize={10}
          />
          <Bar
            dataKey="paid"
            name="Paid"
            fill="var(--color-success)"
            radius={[3, 3, 0, 0]}
          />
          <Bar
            dataKey="pending"
            name="Pending"
            fill="var(--color-warning)"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
