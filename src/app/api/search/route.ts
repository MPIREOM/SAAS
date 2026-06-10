import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserAccessiblePropertyIds } from "@/lib/access-control";

/**
 * Global quick-jump search.
 *
 * The previous implementation queried Supabase directly from the topbar
 * client component, which bypassed property-level access control —
 * any signed-in user could surface tenants/properties/units they had
 * no right to see. This server route applies the same access scoping
 * the rest of the app uses, then returns a small grouped result set
 * for the command palette / topbar dropdown to render.
 *
 * Each section is capped (5 records typically) so the UI stays scannable.
 * Total result set is still small enough to send in one round-trip.
 */

const PER_SECTION_LIMIT = 5;

interface SearchHit {
  type: "tenant" | "property" | "unit" | "invoice" | "maintenance";
  id: string;
  title: string;
  subtitle?: string;
  // The href is built by the client to keep locale-awareness on the
  // page side; the route only returns enough data to identify the row.
  payload: Record<string, unknown>;
}

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ results: [] satisfies SearchHit[] });
  }

  const supabase = await createClient();
  const propertyIds = await getUserAccessiblePropertyIds(supabase);

  // Resolve the unit IDs the user can see. Tenants and invoices are
  // scoped through these, since they don't carry property_id directly.
  let scopedUnitIds: string[] | null = null;
  if (propertyIds !== null) {
    if (propertyIds.length === 0) {
      // No property access at all — return empty without hitting the DB.
      return NextResponse.json({ results: [] satisfies SearchHit[] });
    }
    const { data: units } = await supabase
      .from("units")
      .select("id")
      .in("property_id", propertyIds);
    scopedUnitIds = (units || []).map((u) => u.id);
  }

  // Tenants accessible through the user's units — restrict the tenant
  // search to that set when the caller is not a super_admin.
  let scopedTenantIds: string[] | null = null;
  if (scopedUnitIds !== null) {
    const { data: leases } = await supabase
      .from("leases")
      .select("tenant_id")
      .in(
        "unit_id",
        scopedUnitIds.length > 0 ? scopedUnitIds : ["__no_access__"]
      );
    scopedTenantIds = Array.from(
      new Set((leases || []).map((l) => l.tenant_id as string).filter(Boolean))
    );
  }

  // Sanitise the term for use inside PostgREST filter strings. Beyond the LIKE
  // wildcards (% _), strip the characters that are significant in the
  // `.or()` / `.ilike()` filter grammar — comma, parentheses, colon, dot,
  // backslash, and the PostgREST wildcard `*` — so a crafted query can't
  // inject additional filter clauses.
  const escaped = q
    .replace(/[,()*:.\\]/g, " ")
    .replace(/[%_]/g, (m) => `\\${m}`)
    .trim();
  if (escaped.length < 2) {
    return NextResponse.json({ results: [] satisfies SearchHit[] });
  }

  // ─── Tenants ──────────────────────────────────────────────────────
  let tenantQ = supabase
    .from("tenants")
    .select("id, full_name, phone")
    .or(`full_name.ilike.%${escaped}%,phone.ilike.%${escaped}%`)
    .limit(PER_SECTION_LIMIT);
  if (scopedTenantIds !== null) {
    tenantQ = tenantQ.in(
      "id",
      scopedTenantIds.length > 0 ? scopedTenantIds : ["__no_access__"]
    );
  }

  // ─── Properties ───────────────────────────────────────────────────
  let propertyQ = supabase
    .from("properties")
    .select("id, name, location")
    .eq("is_archived", false)
    .or(`name.ilike.%${escaped}%,location.ilike.%${escaped}%`)
    .limit(PER_SECTION_LIMIT);
  if (propertyIds !== null) {
    propertyQ = propertyQ.in(
      "id",
      propertyIds.length > 0 ? propertyIds : ["__no_access__"]
    );
  }

  // ─── Units ────────────────────────────────────────────────────────
  let unitQ = supabase
    .from("units")
    .select("id, unit_number, property_id, properties(name)")
    .ilike("unit_number", `%${escaped}%`)
    .limit(PER_SECTION_LIMIT);
  if (propertyIds !== null) {
    unitQ = unitQ.in(
      "property_id",
      propertyIds.length > 0 ? propertyIds : ["__no_access__"]
    );
  }

  // ─── Maintenance ──────────────────────────────────────────────────
  let mainQ = supabase
    .from("maintenance_requests")
    .select("id, category, status, description")
    .ilike("description", `%${escaped}%`)
    .limit(PER_SECTION_LIMIT);
  if (scopedUnitIds !== null) {
    mainQ = mainQ.in(
      "unit_id",
      scopedUnitIds.length > 0 ? scopedUnitIds : ["__no_access__"]
    );
  }

  const [tenantsRes, propertiesRes, unitsRes, mainRes] = await Promise.all([
    tenantQ,
    propertyQ,
    unitQ,
    mainQ,
  ]);

  const results: SearchHit[] = [];

  (tenantsRes.data || []).forEach((t) =>
    results.push({
      type: "tenant",
      id: t.id as string,
      title: (t.full_name as string) || "(unnamed)",
      subtitle: (t.phone as string) || undefined,
      payload: { id: t.id },
    })
  );

  (propertiesRes.data || []).forEach((p) =>
    results.push({
      type: "property",
      id: p.id as string,
      title: (p.name as string) || "(unnamed)",
      subtitle: (p.location as string) || undefined,
      payload: { id: p.id },
    })
  );

  (unitsRes.data || []).forEach((u) => {
    const prop = u.properties as unknown as { name?: string } | null;
    results.push({
      type: "unit",
      id: u.id as string,
      title: `Unit ${u.unit_number}`,
      subtitle: prop?.name || undefined,
      payload: { id: u.id, property_id: u.property_id },
    });
  });

  (mainRes.data || []).forEach((m) => {
    const desc = (m.description as string) || "";
    results.push({
      type: "maintenance",
      id: m.id as string,
      title:
        (m.category as string)?.charAt(0).toUpperCase() +
          (m.category as string)?.slice(1) || "Request",
      subtitle: desc.length > 60 ? `${desc.slice(0, 60)}…` : desc,
      payload: { id: m.id },
    });
  });

  return NextResponse.json({ results });
}
