import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Staff: record the municipality-registered rent contract for a unit's
// current tenant - reference number, registered period and the PDF the
// municipality issued. The PDF goes in the documents bucket, attached to
// the unit. Goes through the user's RLS client.

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const schema = z.object({
  unit_id: z.string().uuid(),
  contract_number: z.string().trim().min(1).max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const parsed = schema.safeParse({
    unit_id: form.get("unit_id"),
    contract_number: form.get("contract_number"),
    start_date: form.get("start_date"),
    end_date: form.get("end_date"),
  });
  if (!parsed.success || parsed.data.end_date < parsed.data.start_date) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") {
    return NextResponse.json({ error: "pdf_required" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  const { unit_id: unitId, contract_number, start_date, end_date } = parsed.data;

  const { data: lease } = await supabase
    .from("leases")
    .select("id, tenant_id")
    .eq("unit_id", unitId)
    .eq("is_active", true)
    .maybeSingle();
  if (!lease?.tenant_id) return NextResponse.json({ error: "no_active_tenant" }, { status: 400 });

  const path = `documents/municipality-contracts/${unitId}/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, file, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    console.error("[municipality-contracts] upload failed", { unitId, error: uploadError.message });
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      entity_type: "unit",
      entity_id: unitId,
      document_type: "municipality_contract",
      file_url: path,
      file_name: file.name || `${contract_number.replace(/[^\w-]+/g, "-")}.pdf`,
      expiry_date: end_date,
      uploaded_by: user.id,
    })
    .select("id")
    .single();
  if (docError || !doc) {
    await supabase.storage.from("documents").remove([path]);
    console.error("[municipality-contracts] document insert failed", { unitId, error: docError?.message });
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  const { data: contract, error: contractError } = await supabase
    .from("municipality_contracts")
    .insert({
      tenant_id: lease.tenant_id,
      unit_id: unitId,
      lease_id: lease.id,
      contract_number,
      start_date,
      end_date,
      document_id: doc.id,
      file_url: path,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (contractError || !contract) {
    await supabase.from("documents").delete().eq("id", doc.id);
    await supabase.storage.from("documents").remove([path]);
    console.error("[municipality-contracts] insert failed", { unitId, error: contractError?.message });
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: contract.id });
}
