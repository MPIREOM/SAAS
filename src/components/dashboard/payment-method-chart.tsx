"use client";

import { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { CURRENCY } from "@/lib/currency";

interface MethodData {
  name: string;
  value: number;
  color: string;
}

const METHOD_COLORS: Record<string, { color: string; label: string }> = {
  cash: { color: "var(--color-success)", label: "Cash" },
  bank_transfer: { color: "var(--color-accent)", label: "Bank Transfer" },
  cheque: { color: "var(--color-warning)", label: "Cheque" },
};

export function PaymentMethodChart() {
  const [data, setData] = useState<MethodData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();

      // Fetch all payments from the last 6 months
      const now = new Date();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const startDate = sixMonthsAgo.toISOString().split("T")[0];

      const { data: payments } = await supabase
        .from("payments")
        .select("amount, method")
        .gte("payment_date", startDate);

      const totals: Record<string, number> = {};
      (payments || []).forEach((p) => {
        const method = (p.method as string) || "cash";
        totals[method] = (totals[method] || 0) + parseFloat(p.amount as string);
      });

      const chartData: MethodData[] = Object.entries(totals)
        .map(([method, total]) => ({
          name: METHOD_COLORS[method]?.label || method,
          value: Math.round(total * 100) / 100,
          color: METHOD_COLORS[method]?.color || "var(--color-text-secondary)",
        }))
        .sort((a, b) => b.value - a.value);

      setData(chartData);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="h-[200px] flex items-center justify-center">
        <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-text-secondary text-sm">
        No payment data
      </div>
    );
  }

  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: 500,
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
            formatter={(value) => [`${Number(value).toLocaleString()} ${CURRENCY.code}`]}
          />
          <Legend
            wrapperStyle={{ fontSize: "11px", fontWeight: 500 }}
            iconType="circle"
            iconSize={8}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
