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
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { CURRENCY } from "@/lib/currency";
import { Spinner } from "@/components/ui/spinner";

interface MethodTotal {
  method: string;
  value: number;
}

// Fixed method → categorical-slot mapping so a method keeps its color
// regardless of rank or which methods appear. Status colors stay
// reserved for status; series identity uses the chart tokens.
const METHOD_COLORS: Record<string, string> = {
  cash: "var(--color-chart-1)",
  bank_transfer: "var(--color-chart-2)",
  cheque: "var(--color-chart-3)",
};
const FALLBACK_COLOR = "var(--color-chart-4)";
const KNOWN_METHODS = new Set(Object.keys(METHOD_COLORS));

export function PaymentMethodChart() {
  const [totals, setTotals] = useState<MethodTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useTranslations("dashboard");
  const tInvoices = useTranslations("invoices");

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

      const sums: Record<string, number> = {};
      (payments || []).forEach((p) => {
        const method = (p.method as string) || "cash";
        sums[method] = (sums[method] || 0) + parseFloat(p.amount as string);
      });

      setTotals(
        Object.entries(sums)
          .map(([method, total]) => ({
            method,
            value: Math.round(total * 100) / 100,
          }))
          .sort((a, b) => b.value - a.value)
      );
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <Spinner
        label={t("chartLoading")}
        sizeClassName="h-5 w-5"
        className="h-[200px]"
      />
    );
  }

  if (totals.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-sm text-text-secondary">
        {t("noChartData")}
      </div>
    );
  }

  const data = totals.map((entry) => ({
    ...entry,
    name: KNOWN_METHODS.has(entry.method)
      ? tInvoices(`methods.${entry.method}`)
      : entry.method,
    color: METHOD_COLORS[entry.method] || FALLBACK_COLOR,
  }));

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
            {data.map((entry) => (
              <Cell key={entry.method} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: 500,
              boxShadow: "0 8px 32px color-mix(in srgb, var(--color-background) 60%, transparent)",
            }}
            itemStyle={{ color: "var(--color-text-primary)" }}
            formatter={(value) => [`${Number(value).toLocaleString()} ${CURRENCY.code}`]}
          />
          <Legend
            wrapperStyle={{ fontSize: "11px", fontWeight: 500 }}
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span style={{ color: "var(--color-text-secondary)" }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
