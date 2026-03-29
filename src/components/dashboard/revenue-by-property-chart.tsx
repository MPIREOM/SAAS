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

interface PropertyData {
  name: string;
  value: number;
  color: string;
}

const COLORS = [
  "var(--color-accent)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-info)",
  "var(--color-destructive)",
  "var(--color-warning)",
  "var(--color-success)",
];

interface RevenueByPropertyChartProps {
  propertyIds?: string[] | null;
}

export function RevenueByPropertyChart({ propertyIds }: RevenueByPropertyChartProps) {
  const [data, setData] = useState<PropertyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();

      // Fetch properties
      let propsQuery = supabase
        .from("properties")
        .select("id, name")
        .eq("is_archived", false);
      if (propertyIds !== undefined && propertyIds !== null) {
        if (propertyIds.length === 0) {
          setData([]);
          setLoading(false);
          return;
        }
        propsQuery = propsQuery.in("id", propertyIds);
      }
      const { data: properties } = await propsQuery;
      if (!properties || properties.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      // Fetch units for property mapping
      let unitsQuery = supabase.from("units").select("id, property_id");
      if (propertyIds !== undefined && propertyIds !== null) {
        unitsQuery = unitsQuery.in("property_id", propertyIds);
      }
      const { data: units } = await unitsQuery;

      // Build unit → property map
      const unitPropertyMap = new Map<string, string>();
      (units || []).forEach((u) => {
        unitPropertyMap.set(u.id, u.property_id);
      });

      // Fetch paid invoices from last 6 months
      const now = new Date();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const startDate = sixMonthsAgo.toISOString().split("T")[0];

      const { data: invoices } = await supabase
        .from("invoices")
        .select("amount, unit_id")
        .eq("status", "paid")
        .gte("due_date", startDate);

      // Aggregate by property
      const totals = new Map<string, number>();
      (invoices || []).forEach((inv) => {
        const propId = unitPropertyMap.get(inv.unit_id);
        if (propId) {
          totals.set(propId, (totals.get(propId) || 0) + parseFloat(inv.amount as string));
        }
      });

      const propNameMap = new Map(properties.map((p) => [p.id, p.name]));
      const chartData: PropertyData[] = Array.from(totals.entries())
        .map(([propId, total], idx) => ({
          name: propNameMap.get(propId) || "Unknown",
          value: Math.round(total * 100) / 100,
          color: COLORS[idx % COLORS.length],
        }))
        .sort((a, b) => b.value - a.value);

      setData(chartData);
      setLoading(false);
    };
    load();
  }, [propertyIds]);

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
        No revenue data
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
              boxShadow: "0 8px 32px color-mix(in srgb, var(--color-background) 60%, transparent)",
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
