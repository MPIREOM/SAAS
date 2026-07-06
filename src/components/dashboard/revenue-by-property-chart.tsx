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

interface PropertySlice {
  key: string;
  name: string | null; // null = the folded "Other" slice, labeled at render
  value: number;
  color: string;
}

// Categorical slots in fixed order — never cycled. Portfolios larger than
// five properties fold the tail into a single muted "Other" slice instead
// of inventing or repeating hues.
const SERIES_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];
const OTHER_COLOR = "var(--color-text-secondary)";

interface RevenueByPropertyChartProps {
  propertyIds?: string[] | null;
}

export function RevenueByPropertyChart({ propertyIds }: RevenueByPropertyChartProps) {
  const [data, setData] = useState<PropertySlice[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useTranslations("dashboard");

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
      const ranked = Array.from(totals.entries())
        .map(([propId, total]) => ({
          propId,
          name: propNameMap.get(propId) || null,
          value: Math.round(total * 100) / 100,
        }))
        .sort((a, b) => b.value - a.value);

      // Top five named properties get a categorical slot; everything else
      // (sixth property onward + revenue from unnamed/archived properties)
      // folds into one muted "Other" slice.
      const named = ranked.filter((r) => r.name !== null);
      const top = named.slice(0, SERIES_COLORS.length);
      const otherTotal =
        named.slice(SERIES_COLORS.length).reduce((sum, r) => sum + r.value, 0) +
        ranked.filter((r) => r.name === null).reduce((sum, r) => sum + r.value, 0);

      const slices: PropertySlice[] = top.map((r, idx) => ({
        key: r.propId,
        name: r.name,
        value: r.value,
        color: SERIES_COLORS[idx],
      }));
      if (otherTotal > 0) {
        slices.push({
          key: "__other__",
          name: null,
          value: Math.round(otherTotal * 100) / 100,
          color: OTHER_COLOR,
        });
      }

      setData(slices);
      setLoading(false);
    };
    load();
  }, [propertyIds]);

  if (loading) {
    return (
      <Spinner
        label={t("chartLoading")}
        sizeClassName="h-5 w-5"
        className="h-[200px]"
      />
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-sm text-text-secondary">
        {t("noChartData")}
      </div>
    );
  }

  const labeled = data.map((slice) => ({
    ...slice,
    name: slice.name ?? t("otherProperties"),
  }));

  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={labeled}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={3}
            dataKey="value"
          >
            {labeled.map((entry) => (
              <Cell key={entry.key} fill={entry.color} />
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
