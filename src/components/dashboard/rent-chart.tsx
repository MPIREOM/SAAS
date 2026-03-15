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
import { CURRENCY } from "@/lib/currency";

interface MonthData {
  month: string;
  paid: number;
  pending: number;
}

interface RentChartProps {
  propertyIds?: string[] | null;
}

export function RentChart({ propertyIds }: RentChartProps) {
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();

      const now = new Date();
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const startDate = twelveMonthsAgo.toISOString().split("T")[0];

      // If propertyIds is provided (non-null), first get unit IDs for those properties
      let unitIds: string[] | null = null;
      if (propertyIds !== undefined && propertyIds !== null) {
        if (propertyIds.length === 0) {
          // User has no property access — show empty chart
          setData([]);
          setLoading(false);
          return;
        }
        const { data: units } = await supabase
          .from("units")
          .select("id")
          .in("property_id", propertyIds);
        unitIds = (units || []).map((u) => u.id);
        if (unitIds.length === 0) {
          setData([]);
          setLoading(false);
          return;
        }
      }

      // Fetch invoices within the last 12 months, filtered by unit if needed
      let query = supabase
        .from("invoices")
        .select("amount, due_date, status")
        .gte("due_date", startDate)
        .order("due_date", { ascending: true });

      if (unitIds !== null) {
        query = query.in("unit_id", unitIds);
      }

      const { data: invoiceRows } = await query;

      const months: MonthData[] = [];
      for (let i = 0; i < 12; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
        const monthLabel = date.toLocaleDateString("en", {
          month: "short",
          year: "2-digit",
        });

        const monthInvoices = (invoiceRows || []).filter((inv) => {
          const d = new Date(inv.due_date as string);
          return (
            d.getFullYear() === date.getFullYear() &&
            d.getMonth() === date.getMonth()
          );
        });

        const paid = monthInvoices
          .filter((inv) => inv.status === "paid")
          .reduce((sum, inv) => sum + parseFloat(inv.amount as string), 0);

        const pending = monthInvoices
          .filter((inv) => inv.status === "pending" || inv.status === "overdue")
          .reduce((sum, inv) => sum + parseFloat(inv.amount as string), 0);

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
  }, [propertyIds]);

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
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
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
            dataKey="paid"
            name="Paid"
            fill="var(--color-success)"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="pending"
            name="Pending"
            fill="var(--color-warning)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
