import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY } from "@/lib/currency";

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

  // Sanitize CSV values to prevent formula injection
  function csvSafe(value: unknown): string {
    const str = String(value ?? "").replace(/"/g, '""');
    // Prevent CSV injection: prefix formula-triggering characters
    if (/^[=+\-@\t\r]/.test(str)) {
      return "'" + str;
    }
    return str;
  }

  let csvContent = "";
  let filename = "";

  try {
    switch (reportId) {
      case "monthly-rent": {
        filename = "monthly-rent-collection";
        const { data: payments, error } = await supabase
          .from("payments")
          .select(`
            amount, payment_date, method, reference_number,
            tenants:tenant_id(full_name),
            leases:lease_id(units(unit_number, properties(name)))
          `)
          .order("payment_date", { ascending: false });

        if (error) {
          return NextResponse.json({ error: "Failed to fetch payments data" }, { status: 500 });
        }

        csvContent = `Tenant,Property,Unit,Amount (${CURRENCY.code}),Date,Method,Reference\n`;
        (payments || []).forEach((p: Record<string, unknown>) => {
          const tenant = p.tenants as Record<string, unknown> | null;
          const lease = p.leases as Record<string, unknown> | null;
          const unit = lease?.units as Record<string, unknown> | null;
          const property = unit?.properties as Record<string, unknown> | null;
          csvContent += `"${csvSafe(tenant?.full_name)}","${csvSafe(property?.name)}","${csvSafe(unit?.unit_number)}",${p.amount},"${p.payment_date}","${csvSafe(p.method)}","${csvSafe(p.reference_number)}"\n`;
        });
        break;
      }

      case "tenant-roster": {
        filename = "tenant-roster";
        const { data: tenants, error } = await supabase
          .from("tenants")
          .select(`
            full_name, phone, email, nationality, national_id, status,
            leases(units(unit_number, properties(name)), is_active)
          `)
          .order("full_name");

        if (error) {
          return NextResponse.json({ error: "Failed to fetch tenants data" }, { status: 500 });
        }

        csvContent = "Name,Phone,Email,Nationality,ID Number,Status,Property,Unit\n";
        (tenants || []).forEach((t: Record<string, unknown>) => {
          const leases = t.leases as Record<string, unknown>[] | null;
          const activeLease = leases?.find((l) => l.is_active);
          const unit = activeLease?.units as Record<string, unknown> | null;
          const property = unit?.properties as Record<string, unknown> | null;
          csvContent += `"${csvSafe(t.full_name)}","${csvSafe(t.phone)}","${csvSafe(t.email)}","${csvSafe(t.nationality)}","${csvSafe(t.national_id)}","${csvSafe(t.status)}","${csvSafe(property?.name)}","${csvSafe(unit?.unit_number)}"\n`;
        });
        break;
      }

      case "maintenance-summary": {
        filename = "maintenance-summary";
        const { data: requests, error } = await supabase
          .from("maintenance_requests")
          .select(`
            *,
            units:unit_id(unit_number, properties:property_id(name)),
            tenants:tenant_id(full_name)
          `)
          .order("created_at", { ascending: false });

        if (error) {
          return NextResponse.json({ error: "Failed to fetch maintenance data" }, { status: 500 });
        }

        csvContent = "Date,Property,Unit,Tenant,Category,Description,Urgency,Status\n";
        (requests || []).forEach((r: Record<string, unknown>) => {
          const unit = r.units as Record<string, unknown> | null;
          const property = unit?.properties as Record<string, unknown> | null;
          const tenant = r.tenants as Record<string, unknown> | null;
          csvContent += `"${csvSafe(new Date(r.created_at as string).toLocaleDateString())}","${csvSafe(property?.name)}","${csvSafe(unit?.unit_number)}","${csvSafe(tenant?.full_name)}","${csvSafe(r.category)}","${csvSafe(r.description)}","${csvSafe(r.urgency)}","${csvSafe(r.status)}"\n`;
        });
        break;
      }

      case "cheque-tracker": {
        filename = "cheque-tracker";
        const { data: cheques, error } = await supabase
          .from("cheques")
          .select(`
            cheque_number, bank_name, cheque_date, amount, status,
            tenants:tenant_id(full_name)
          `)
          .order("cheque_date", { ascending: false });

        if (error) {
          return NextResponse.json({ error: "Failed to fetch cheques data" }, { status: 500 });
        }

        csvContent = `Cheque #,Bank,Date,Amount (${CURRENCY.code}),Status,Tenant\n`;
        (cheques || []).forEach((c: Record<string, unknown>) => {
          const tenant = c.tenants as Record<string, unknown> | null;
          csvContent += `"${csvSafe(c.cheque_number)}","${csvSafe(c.bank_name)}","${c.cheque_date}",${c.amount},"${csvSafe(c.status)}","${csvSafe(tenant?.full_name)}"\n`;
        });
        break;
      }

      case "document-expiry": {
        filename = "document-expiry";
        const { data: documents, error } = await supabase
          .from("documents")
          .select(`
            name, document_type, expiry_date, created_at,
            tenants:tenant_id(full_name),
            properties:property_id(name)
          `)
          .not("expiry_date", "is", null)
          .order("expiry_date", { ascending: true });

        if (error) {
          return NextResponse.json({ error: "Failed to fetch documents data" }, { status: 500 });
        }

        const now = new Date();
        csvContent = "Document,Type,Entity,Expiry Date,Status\n";
        (documents || []).forEach((d: Record<string, unknown>) => {
          const tenant = d.tenants as Record<string, unknown> | null;
          const property = d.properties as Record<string, unknown> | null;
          const entity = (tenant?.full_name as string) || (property?.name as string) || "";
          const expiry = new Date(d.expiry_date as string);
          const status = expiry < now ? "Expired" : "Valid";
          csvContent += `"${csvSafe(d.name)}","${csvSafe(d.document_type)}","${csvSafe(entity)}","${d.expiry_date}","${status}"\n`;
        });
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown report" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }

  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
