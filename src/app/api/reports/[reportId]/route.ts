import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  const format = request.nextUrl.searchParams.get("format") || "csv";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let csvContent = "";
  let filename = "";

  switch (reportId) {
    case "monthly-rent": {
      filename = "monthly-rent-collection";
      const { data: payments } = await supabase
        .from("payments")
        .select(`
          amount, payment_date, method, reference_number,
          tenants:tenant_id(full_name),
          leases:lease_id(units(unit_number, properties(name)))
        `)
        .order("payment_date", { ascending: false });

      csvContent = "Tenant,Property,Unit,Amount (OMR),Date,Method,Reference\n";
      (payments || []).forEach((p: Record<string, unknown>) => {
        const tenant = p.tenants as Record<string, unknown> | null;
        const lease = p.leases as Record<string, unknown> | null;
        const unit = lease?.units as Record<string, unknown> | null;
        const property = unit?.properties as Record<string, unknown> | null;
        csvContent += `"${(tenant?.full_name as string) || ""}","${(property?.name as string) || ""}","${(unit?.unit_number as string) || ""}",${p.amount},"${p.payment_date}","${p.method || ""}","${p.reference_number || ""}"\n`;
      });
      break;
    }

    case "tenant-roster": {
      filename = "tenant-roster";
      const { data: tenants } = await supabase
        .from("tenants")
        .select(`
          full_name, phone, email, nationality, national_id, status,
          leases(units(unit_number, properties(name)), is_active)
        `)
        .order("full_name");

      csvContent = "Name,Phone,Email,Nationality,National ID,Status,Property,Unit\n";
      (tenants || []).forEach((t: Record<string, unknown>) => {
        const leases = t.leases as Record<string, unknown>[] | null;
        const activeLease = leases?.find((l) => l.is_active);
        const unit = activeLease?.units as Record<string, unknown> | null;
        const property = unit?.properties as Record<string, unknown> | null;
        csvContent += `"${t.full_name}","${t.phone || ""}","${t.email || ""}","${t.nationality || ""}","${t.national_id || ""}","${t.status}","${(property?.name as string) || ""}","${(unit?.unit_number as string) || ""}"\n`;
      });
      break;
    }

    case "maintenance-summary": {
      filename = "maintenance-summary";
      const { data: requests } = await supabase
        .from("maintenance_requests")
        .select(`
          *,
          units:unit_id(unit_number, properties:property_id(name)),
          tenants:tenant_id(full_name)
        `)
        .order("created_at", { ascending: false });

      csvContent = "Date,Property,Unit,Tenant,Category,Description,Urgency,Status\n";
      (requests || []).forEach((r: Record<string, unknown>) => {
        const unit = r.units as Record<string, unknown> | null;
        const property = unit?.properties as Record<string, unknown> | null;
        const tenant = r.tenants as Record<string, unknown> | null;
        csvContent += `"${new Date(r.created_at as string).toLocaleDateString()}","${(property?.name as string) || ""}","${(unit?.unit_number as string) || ""}","${(tenant?.full_name as string) || ""}","${r.category || ""}","${((r.description as string) || "").replace(/"/g, '""')}","${r.urgency || ""}","${r.status || ""}"\n`;
      });
      break;
    }

    case "cheque-tracker": {
      filename = "cheque-tracker";
      const { data: cheques } = await supabase
        .from("cheques")
        .select(`
          cheque_number, bank_name, cheque_date, amount, status,
          tenants:tenant_id(full_name)
        `)
        .order("cheque_date", { ascending: false });

      csvContent = "Cheque #,Bank,Date,Amount (OMR),Status,Tenant\n";
      (cheques || []).forEach((c: Record<string, unknown>) => {
        const tenant = c.tenants as Record<string, unknown> | null;
        csvContent += `"${c.cheque_number}","${c.bank_name}","${c.cheque_date}",${c.amount},"${c.status}","${(tenant?.full_name as string) || ""}"\n`;
      });
      break;
    }

    case "document-expiry": {
      filename = "document-expiry";
      const { data: documents } = await supabase
        .from("documents")
        .select(`
          name, document_type, expiry_date, created_at,
          tenants:tenant_id(full_name),
          properties:property_id(name)
        `)
        .not("expiry_date", "is", null)
        .order("expiry_date", { ascending: true });

      const now = new Date();
      csvContent = "Document,Type,Entity,Expiry Date,Status\n";
      (documents || []).forEach((d: Record<string, unknown>) => {
        const tenant = d.tenants as Record<string, unknown> | null;
        const property = d.properties as Record<string, unknown> | null;
        const entity = (tenant?.full_name as string) || (property?.name as string) || "";
        const expiry = new Date(d.expiry_date as string);
        const status = expiry < now ? "Expired" : "Valid";
        csvContent += `"${d.name}","${d.document_type}","${entity}","${d.expiry_date}","${status}"\n`;
      });
      break;
    }

    default:
      return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  }

  const contentType =
    format === "pdf"
      ? "text/csv; charset=utf-8"
      : "text/csv; charset=utf-8";
  const ext = "csv";

  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}.${ext}"`,
    },
  });
}
