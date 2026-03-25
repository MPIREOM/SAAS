"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
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
  income: number;
  expenses: number;
  net: number;
}

interface CashFlowChartProps {
  propertyIds?: string[] | null;
}

export function CashFlowChart({ propertyIds }: CashFlowChartProps) {
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const now = new Date();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const startDate = sixMonthsAgo.toISOString().split("T")[0];

      // Resolve unit IDs for property filtering
      let unitIds: string[] | null = null;
      if (propertyIds !== undefined && propertyIds !== null) {
        if (propertyIds.length === 0) {
          setData([]);
          setLoading(false);
          return;
        }
        const { data: units } = await supabase
          .from("units")
          .select("id")
          .in("property_id", propertyIds);
        unitIds = (units || []).map((u) => u.id);
      }

      // Fetch paid invoices (income)
      let invoiceQuery = supabase
        .from("invoices")
        .select("amount, due_date, status, paid_amount")
        .gte("due_date", startDate);
      if (unitIds !== null) {
        invoiceQuery = invoiceQuery.in("unit_id", unitIds);
      }

      // Fetch expenses
      let expenseQuery = supabase
        .from("expenses")
        .select("amount, expense_date")
        .gte("expense_date", startDate);
      if (propertyIds !== undefined && propertyIds !== null) {
        expenseQuery = expenseQuery.in("property_id", propertyIds);
      }

      const [{ data: invoiceRows }, { data: expenseRows }] = await Promise.all([
        invoiceQuery,
        expenseQuery,
      ]);

      const months: MonthData[] = [];
      for (let i = 0; i < 6; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        const monthLabel = date.toLocaleDateString("en", {
          month: "short",
          year: "2-digit",
        });

        const monthInvoices = (invoiceRows || []).filter((inv) => {
          const d = new Date(inv.due_date as string);
          return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth();
        });

        const income = monthInvoices
          .filter((inv) => inv.status === "paid" || inv.status === "partial")
          .reduce((sum, inv) => {
            const paid = parseFloat((inv.paid_amount as string) || "0");
            const amt = parseFloat(inv.amount as string);
            return sum + (inv.status === "paid" ? amt : paid);
          }, 0);

        const monthExpenses = (expenseRows || []).filter((exp) => {
          const d = new Date(exp.expense_date as string);
          return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth();
        });

        const expenses = monthExpenses.reduce(
          (sum, exp) => sum + parseFloat(exp.amount as string),
          0
        );

        months.push({
          month: monthLabel,
          income: Math.round(income * 100) / 100,
          expenses: Math.round(expenses * 100) / 100,
          net: Math.round((income - expenses) * 100) / 100,
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
        <AreaChart data={data}>
          <defs>
            <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-destructive)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-destructive)" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            formatter={(value) => [`${Number(value).toLocaleString()} ${CURRENCY.code}`]}
            cursor={{ fill: "var(--color-surface-elevated)", opacity: 0.3 }}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", fontWeight: 500 }}
            iconType="square"
            iconSize={10}
          />
          <Area
            type="monotone"
            dataKey="income"
            name="Income"
            stroke="var(--color-success)"
            fill="url(#incomeGrad)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="expenses"
            name="Expenses"
            stroke="var(--color-destructive)"
            fill="url(#expenseGrad)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
