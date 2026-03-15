import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const { token } = await request.json();

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Validate token
  const { data: tokenData, error: tokenError } = await supabase
    .from("tenant_portal_tokens")
    .select("id, tenant_id, expires_at, is_active")
    .eq("token", token)
    .eq("is_active", true)
    .single();

  if (tokenError || !tokenData) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  const tenantId = tokenData.tenant_id;

  // Fetch all tenant data in parallel
  const [tenantRes, leasesRes, invoicesRes, paymentsRes, documentsRes, chequesRes] =
    await Promise.all([
      supabase.from("tenants").select("*").eq("id", tenantId).single(),
      supabase
        .from("leases")
        .select("*, units(unit_number, floor, unit_type, property_id, properties(name, location))")
        .eq("tenant_id", tenantId)
        .order("start_date", { ascending: false }),
      supabase
        .from("invoices")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("due_date", { ascending: false }),
      supabase
        .from("payments")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("payment_date", { ascending: false }),
      supabase
        .from("documents")
        .select("*")
        .eq("entity_type", "tenant")
        .eq("entity_id", tenantId)
        .order("uploaded_at", { ascending: false }),
      supabase
        .from("cheques")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("cheque_date", { ascending: false }),
    ]);

  return NextResponse.json({
    tenant: tenantRes.data,
    leases: leasesRes.data || [],
    invoices: invoicesRes.data || [],
    payments: paymentsRes.data || [],
    documents: documentsRes.data || [],
    cheques: chequesRes.data || [],
  });
}
