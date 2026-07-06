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
} from "recharts";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";

interface MonthData {
  month: string;
  rate: number;
}

interface OccupancyChartProps {
  propertyIds?: string[] | null;
}

export function OccupancyChart({ propertyIds }: OccupancyChartProps) {
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useTranslations("dashboard");
  const locale = useLocale();

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();

      // Get total units count for the accessible properties
      let unitsQuery = supabase.from("units").select("id", { count: "exact" });
      if (propertyIds !== undefined && propertyIds !== null) {
        if (propertyIds.length === 0) {
          setData([]);
          setLoading(false);
          return;
        }
        unitsQuery = unitsQuery.in("property_id", propertyIds);
      }
      const { count: totalUnits } = await unitsQuery;
      if (!totalUnits || totalUnits === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      // Get all leases to calculate historical occupancy
      const now = new Date();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const startDate = sixMonthsAgo.toISOString().split("T")[0];

      let leasesQuery = supabase
        .from("leases")
        .select("start_date, end_date, unit_id, is_active, vacate_date");
      if (propertyIds !== undefined && propertyIds !== null) {
        // Get unit IDs for accessible properties
        const { data: units } = await supabase
          .from("units")
          .select("id")
          .in("property_id", propertyIds);
        const unitIds = (units || []).map((u) => u.id);
        if (unitIds.length > 0) {
          leasesQuery = leasesQuery.in("unit_id", unitIds);
        }
      }

      const { data: leases } = await leasesQuery;

      const months: MonthData[] = [];
      for (let i = 0; i < 6; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        const checkDate = monthEnd.toISOString().split("T")[0];
        const monthLabel = date.toLocaleDateString(`${locale}-u-nu-latn`, {
          month: "short",
          year: "2-digit",
        });

        // Count unique units that had an active lease at end of this month
        const occupiedUnits = new Set<string>();
        (leases || []).forEach((lease) => {
          const start = lease.start_date as string;
          const end = (lease.vacate_date as string) || (lease.end_date as string);
          if (start <= checkDate && end >= checkDate) {
            occupiedUnits.add(lease.unit_id as string);
          }
        });

        const rate = Math.round((occupiedUnits.size / totalUnits) * 100);
        months.push({ month: monthLabel, rate });
      }

      setData(months);
      setLoading(false);
    };
    load();
  }, [propertyIds, locale]);

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

  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="occupancyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
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
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
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
            itemStyle={{ color: "var(--color-text-primary)" }}
            formatter={(value) => [`${value}%`]}
          />
          <Area
            type="monotone"
            dataKey="rate"
            name={t("chartOccupancy")}
            stroke="var(--color-accent)"
            fill="url(#occupancyGrad)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
