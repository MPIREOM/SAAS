import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { createAdminClient, createMandate, listMandatesForTenant } from "@/lib/e-mandates/service";

// GET /api/e-mandates?tenant_id=…  → mandates + recent collections (RLS-scoped)
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = request.nextUrl.searchParams.get("tenant_id");
  if (!tenantId) return NextResponse.json({ error: "tenant_id required" }, { status: 400 });

  const data = await listMandatesForTenant(supabase, tenantId);
  return NextResponse.json(data);
}

// POST /api/e-mandates → create a mandate at the bank for a lease
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    lease_id?: string;
    amount?: number | string | null;
    collection_day?: number | string | null;
    debtor_name?: string | null;
    debtor_account?: string;
    debtor_bank_code?: string | null;
    end_date?: string | null;
  } | null;

  if (!body?.lease_id || !body.debtor_account) {
    return NextResponse.json({ error: "lease_id and debtor_account are required" }, { status: 400 });
  }

  // Authorisation: the caller must be able to see the lease under RLS.
  const { data: lease } = await supabase.from("leases").select("id").eq("id", body.lease_id).maybeSingle();
  if (!lease) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const amount = body.amount === null || body.amount === undefined || body.amount === "" ? null : Number(body.amount);
  const collectionDay = body.collection_day === null || body.collection_day === undefined || body.collection_day === "" ? null : Number(body.collection_day);
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }
  if (collectionDay !== null && (!Number.isInteger(collectionDay) || collectionDay < 1 || collectionDay > 28)) {
    return NextResponse.json({ error: "collection_day must be between 1 and 28" }, { status: 400 });
  }

  const result = await createMandate(createAdminClient(), {
    leaseId: body.lease_id,
    amount,
    collectionDay,
    debtorName: body.debtor_name ?? null,
    debtorAccount: String(body.debtor_account),
    debtorBankCode: body.debtor_bank_code ?? null,
    endDate: body.end_date ?? null,
    createdBy: user.id,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });

  await logAudit(supabase, {
    action: "create",
    entity_type: "e_mandate",
    entity_id: result.data.id,
    metadata: { lease_id: body.lease_id, amount: result.data.amount, collection_day: result.data.collection_day, provider: result.data.provider },
  });

  return NextResponse.json({ mandate: result.data });
}
