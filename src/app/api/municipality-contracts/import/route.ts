import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractMunicipalityContract } from "@/lib/municipality-contracts/extract";

// One-time catch-up: municipality contracts were uploaded as tenant
// "lease_agreement" documents before municipality_contracts existed. Read
// each one not linked yet and, when it is a municipality contract, record
// it against the tenant's active unit, pointing at the file already in
// storage. Goes through the user's RLS client, so it only reaches the
// documents and units the user can access. Safe to re-run: documents
// already linked are skipped.

export const maxDuration = 300;

const CONCURRENCY = 4;

type Skip = { file_name: string; tenant: string; reason: "not_pdf" | "not_contract" | "no_active_unit" | "several_units" | "failed" };
type Imported = { file_name: string; tenant: string; unit: string; contract_number: string; end_date: string };

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [docsRes, linkedRes, leasesRes] = await Promise.all([
    supabase
      .from("documents")
      .select("id, entity_id, file_url, file_name")
      .eq("entity_type", "tenant")
      .eq("document_type", "lease_agreement"),
    supabase.from("municipality_contracts").select("document_id").not("document_id", "is", null),
    supabase
      .from("leases")
      .select("id, tenant_id, unit_id, start_date, tenants(full_name), units(unit_number, properties(name))")
      .eq("is_active", true),
  ]);
  if (docsRes.error || linkedRes.error || leasesRes.error) {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const linked = new Set((linkedRes.data || []).map((r) => r.document_id as string));
  type LeaseRow = {
    id: string;
    tenant_id: string;
    unit_id: string;
    start_date: string;
    tenants: { full_name: string } | null;
    units: { unit_number: string; properties: { name: string } | null } | null;
  };
  const leasesByTenant = new Map<string, LeaseRow[]>();
  for (const l of (leasesRes.data || []) as unknown as LeaseRow[]) {
    leasesByTenant.set(l.tenant_id, [...(leasesByTenant.get(l.tenant_id) || []), l]);
  }

  const { data: tenantRows } = await supabase
    .from("tenants")
    .select("id, full_name")
    .in("id", Array.from(new Set((docsRes.data || []).map((d) => d.entity_id as string))));
  const tenantNames = new Map((tenantRows || []).map((t) => [t.id as string, t.full_name as string]));

  const pending = (docsRes.data || []).filter((d) => !linked.has(d.id as string));
  const imported: Imported[] = [];
  const skipped: Skip[] = [];

  async function processDoc(doc: { id: string; entity_id: string; file_url: string; file_name: string | null }) {
    const fileName = doc.file_name || doc.file_url;
    const tenant = tenantNames.get(doc.entity_id) || "—";
    const leases = leasesByTenant.get(doc.entity_id) || [];
    if (leases.length === 0) return skipped.push({ file_name: fileName, tenant, reason: "no_active_unit" });
    if (leases.length > 1) return skipped.push({ file_name: fileName, tenant, reason: "several_units" });
    if (!/\.pdf$/i.test(doc.file_url) && !/\.pdf$/i.test(doc.file_name || "")) {
      return skipped.push({ file_name: fileName, tenant, reason: "not_pdf" });
    }

    try {
      const { data: blob, error } = await supabase.storage.from("documents").download(doc.file_url);
      if (error || !blob) throw new Error(error?.message || "download failed");
      const extracted = await extractMunicipalityContract(Buffer.from(await blob.arrayBuffer()).toString("base64"));
      if (!extracted.contract_number || !extracted.start_date || !extracted.end_date || extracted.end_date < extracted.start_date) {
        return skipped.push({ file_name: fileName, tenant, reason: "not_contract" });
      }

      const lease = leases[0];
      const { error: insertError } = await supabase.from("municipality_contracts").insert({
        tenant_id: lease.tenant_id,
        unit_id: lease.unit_id,
        // An older contract that ended before this lease began isn't this lease's.
        lease_id: extracted.end_date >= lease.start_date ? lease.id : null,
        contract_number: extracted.contract_number,
        start_date: extracted.start_date,
        end_date: extracted.end_date,
        document_id: doc.id,
        file_url: doc.file_url,
        created_by: user!.id,
      });
      if (insertError) throw new Error(insertError.message);

      imported.push({
        file_name: fileName,
        tenant,
        unit: `${lease.units?.properties?.name ?? ""} ${lease.units?.unit_number ?? ""}`.trim(),
        contract_number: extracted.contract_number,
        end_date: extracted.end_date,
      });
    } catch (err) {
      console.error("[municipality-contracts/import] failed", { documentId: doc.id, error: (err as Error).message });
      skipped.push({ file_name: fileName, tenant, reason: "failed" });
    }
  }

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    await Promise.all(
      pending.slice(i, i + CONCURRENCY).map((d) =>
        processDoc(d as { id: string; entity_id: string; file_url: string; file_name: string | null })
      )
    );
  }

  return NextResponse.json({ checked: pending.length, imported, skipped });
}
