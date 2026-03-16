import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const propertyIds = await getUserAccessiblePropertyIds(supabase);

    // If user has no property access at all, return empty analytics
    if (Array.isArray(propertyIds) && propertyIds.length === 0) {
      return NextResponse.json({
        monthlyCollection: [],
        propertySummary: [],
        maintenanceStats: {
          open: 0,
          inProgress: 0,
          resolved: 0,
          avgResolutionDays: 0,
        },
        chequeSummary: {
          pending: 0,
          pendingAmount: 0,
          cleared: 0,
          clearedAmount: 0,
          bounced: 0,
          bouncedAmount: 0,
        },
        documentExpiry: {
          expired: 0,
          expiringSoon: 0,
          valid: 0,
        },
      });
    }

    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const twelveMonthsAgoStr = twelveMonthsAgo.toISOString().slice(0, 10);
    const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const today = now.toISOString().slice(0, 10);
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    // Run all queries in parallel
    const [
      invoicesRes,
      propertiesRes,
      leasesRes,
      paidThisMonthRes,
      maintenanceRes,
      maintenanceResolvedRes,
      chequesRes,
      documentsRes,
    ] = await Promise.all([
      // Invoices for the last 12 months (monthly collection)
      supabase
        .from("invoices")
        .select("amount, due_date, status, unit_id, units!inner(property_id)")
        .gte("due_date", twelveMonthsAgoStr),

      // Properties with unit counts
      supabase
        .from("properties")
        .select("id, name, units(id, status)")
        .eq("is_archived", false),

      // Active leases for monthly revenue
      supabase
        .from("leases")
        .select("unit_id, monthly_rent, units!inner(property_id)")
        .eq("is_active", true),

      // Invoices paid this month (per-property collection)
      supabase
        .from("invoices")
        .select("amount, unit_id, units!inner(property_id)")
        .eq("status", "paid")
        .gte("paid_date", currentMonthStart),

      // All maintenance requests (for status counts)
      supabase
        .from("maintenance_requests")
        .select("status, unit_id, units!inner(property_id)"),

      // Resolved maintenance requests (for avg resolution time)
      supabase
        .from("maintenance_requests")
        .select("created_at, updated_at, unit_id, units!inner(property_id)")
        .eq("status", "resolved"),

      // All cheques
      supabase.from("cheques").select("status, amount, tenant_id"),

      // Documents with expiry dates
      supabase
        .from("documents")
        .select("expiry_date, entity_type, entity_id")
        .not("expiry_date", "is", null),
    ]);

    // --- Types for query results ---
    type WithPropertyUnit = { units: { property_id: string } };
    type InvoiceRow = WithPropertyUnit & {
      amount: string;
      due_date: string;
      status: string;
      unit_id: string;
    };
    type PropertyRow = {
      id: string;
      name: string;
      units: { id: string; status: string }[];
    };
    type LeaseRow = WithPropertyUnit & {
      unit_id: string;
      monthly_rent: string;
    };
    type PaidInvoiceRow = WithPropertyUnit & {
      amount: string;
      unit_id: string;
    };
    type MaintenanceRow = WithPropertyUnit & {
      status: string;
      unit_id: string;
    };
    type MaintenanceResolvedRow = WithPropertyUnit & {
      created_at: string;
      updated_at: string;
      unit_id: string;
    };
    type ChequeRow = { status: string; amount: string; tenant_id: string };
    type DocumentRow = {
      expiry_date: string;
      entity_type: string;
      entity_id: string;
    };

    // --- Filter by accessible properties ---
    const filterByProperty = <T extends WithPropertyUnit>(rows: T[]): T[] => {
      if (propertyIds === null) return rows;
      return rows.filter((r) => propertyIds.includes(r.units.property_id));
    };

    const allInvoices = filterByProperty(
      (invoicesRes.data as unknown as InvoiceRow[]) || []
    );
    const allProperties = ((propertiesRes.data as unknown as PropertyRow[]) || []).filter(
      (r) => propertyIds === null || propertyIds.includes(r.id)
    );
    const allLeases = filterByProperty(
      (leasesRes.data as unknown as LeaseRow[]) || []
    );
    const allPaidThisMonth = filterByProperty(
      (paidThisMonthRes.data as unknown as PaidInvoiceRow[]) || []
    );
    const allMaintenance = filterByProperty(
      (maintenanceRes.data as unknown as MaintenanceRow[]) || []
    );
    const allMaintenanceResolved = filterByProperty(
      (maintenanceResolvedRes.data as unknown as MaintenanceResolvedRow[]) || []
    );
    const allCheques = (chequesRes.data as unknown as ChequeRow[]) || [];
    const allDocuments = ((documentsRes.data as unknown as DocumentRow[]) || []).filter(
      (d) => {
        if (propertyIds === null) return true;
        if (d.entity_type === "property")
          return propertyIds.includes(d.entity_id);
        return true;
      }
    );

    // --- Build monthlyCollection ---
    const monthlyMap = new Map<
      string,
      { invoiced: number; collected: number }
    >();

    // Pre-fill last 12 months
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap.set(key, { invoiced: 0, collected: 0 });
    }

    for (const inv of allInvoices) {
      const month = inv.due_date.slice(0, 7); // "YYYY-MM"
      const entry = monthlyMap.get(month);
      if (!entry) continue;
      const amount = parseFloat(inv.amount) || 0;
      entry.invoiced += amount;
      if (inv.status === "paid") {
        entry.collected += amount;
      }
    }

    const monthlyCollection = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        invoiced: Math.round(data.invoiced * 100) / 100,
        collected: Math.round(data.collected * 100) / 100,
        collectionRate:
          data.invoiced > 0
            ? Math.round((data.collected / data.invoiced) * 10000) / 100
            : 0,
      }));

    // --- Build propertySummary ---
    const revenueByProperty = new Map<string, number>();
    for (const lease of allLeases) {
      const pid = lease.units.property_id;
      revenueByProperty.set(
        pid,
        (revenueByProperty.get(pid) || 0) + (parseFloat(lease.monthly_rent) || 0)
      );
    }

    const collectedByProperty = new Map<string, number>();
    for (const inv of allPaidThisMonth) {
      const pid = inv.units.property_id;
      collectedByProperty.set(
        pid,
        (collectedByProperty.get(pid) || 0) + (parseFloat(inv.amount) || 0)
      );
    }

    const propertySummary = allProperties.map((p) => {
      const unitsList = p.units || [];
      const totalUnits = unitsList.length;
      const occupiedUnits = unitsList.filter(
        (u) => u.status === "occupied"
      ).length;
      return {
        name: p.name,
        totalUnits,
        occupiedUnits,
        occupancyRate:
          totalUnits > 0
            ? Math.round((occupiedUnits / totalUnits) * 10000) / 100
            : 0,
        monthlyRevenue:
          Math.round((revenueByProperty.get(p.id) || 0) * 100) / 100,
        collectedThisMonth:
          Math.round((collectedByProperty.get(p.id) || 0) * 100) / 100,
      };
    });

    // --- Build maintenanceStats ---
    let open = 0;
    let inProgress = 0;
    let resolved = 0;

    for (const m of allMaintenance) {
      if (m.status === "open") open++;
      else if (m.status === "in_progress") inProgress++;
      else if (m.status === "resolved" || m.status === "closed") resolved++;
    }

    let avgResolutionDays = 0;
    if (allMaintenanceResolved.length > 0) {
      let totalDays = 0;
      for (const m of allMaintenanceResolved) {
        const created = new Date(m.created_at).getTime();
        const updated = new Date(m.updated_at).getTime();
        totalDays += (updated - created) / (1000 * 60 * 60 * 24);
      }
      avgResolutionDays =
        Math.round((totalDays / allMaintenanceResolved.length) * 100) / 100;
    }

    const maintenanceStats = {
      open,
      inProgress,
      resolved,
      avgResolutionDays,
    };

    // --- Build chequeSummary ---
    let pendingCount = 0;
    let pendingAmount = 0;
    let clearedCount = 0;
    let clearedAmount = 0;
    let bouncedCount = 0;
    let bouncedAmount = 0;

    for (const c of allCheques) {
      const amount = parseFloat(c.amount) || 0;
      if (c.status === "pending") {
        pendingCount++;
        pendingAmount += amount;
      } else if (c.status === "cleared") {
        clearedCount++;
        clearedAmount += amount;
      } else if (c.status === "bounced") {
        bouncedCount++;
        bouncedAmount += amount;
      }
    }

    const chequeSummary = {
      pending: pendingCount,
      pendingAmount: Math.round(pendingAmount * 100) / 100,
      cleared: clearedCount,
      clearedAmount: Math.round(clearedAmount * 100) / 100,
      bounced: bouncedCount,
      bouncedAmount: Math.round(bouncedAmount * 100) / 100,
    };

    // --- Build documentExpiry ---
    let expired = 0;
    let expiringSoon = 0;
    let valid = 0;

    for (const d of allDocuments) {
      const expiryDate = d.expiry_date;
      if (expiryDate < today) {
        expired++;
      } else if (expiryDate <= thirtyDaysFromNow) {
        expiringSoon++;
      } else {
        valid++;
      }
    }

    const documentExpiry = { expired, expiringSoon, valid };

    return NextResponse.json({
      monthlyCollection,
      propertySummary,
      maintenanceStats,
      chequeSummary,
      documentExpiry,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate analytics" },
      { status: 500 }
    );
  }
}
