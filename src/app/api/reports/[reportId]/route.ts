import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import {
  RentCollectionPDF,
  TenantRosterPDF,
  MaintenancePDF,
  ChequeTrackerPDF,
  DocumentExpiryPDF,
} from "@/lib/reports/pdf-documents";
import { format, differenceInDays, parseISO, startOfMonth, endOfMonth } from "date-fns";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let pdfBuffer: Buffer;
    let fileName: string;

    switch (reportId) {
      case "monthly-rent": {
        const today = new Date();
        const start = format(startOfMonth(today), "yyyy-MM-dd");
        const end = format(endOfMonth(today), "yyyy-MM-dd");

        const { data: invoices } = await supabase
          .from("invoices")
          .select("id, amount, due_date, status, paid_date, tenants(full_name), units(unit_number, properties(name))")
          .gte("period_start", start)
          .lte("period_start", end)
          .order("due_date", { ascending: true });

        const rows = (invoices ?? []).map((inv: Record<string, unknown>) => {
          const tenant = inv.tenants as Record<string, unknown> | null;
          const unit = inv.units as Record<string, unknown> | null;
          const prop = unit?.properties as Record<string, unknown> | null;
          return {
            id: inv.id as string,
            tenant_name: (tenant?.full_name as string) || "—",
            unit_number: (unit?.unit_number as string) || "—",
            property_name: (prop?.name as string) || "—",
            amount: parseFloat(inv.amount as string),
            due_date: inv.due_date as string,
            status: inv.status as string,
            paid_date: inv.paid_date as string | null,
          };
        });

        pdfBuffer = await renderToBuffer(
          React.createElement(RentCollectionPDF, {
            data: { invoices: rows, month: format(today, "MMMM yyyy") },
          })
        );
        fileName = `rent-collection-${format(today, "yyyy-MM")}.pdf`;
        break;
      }

      case "tenant-roster": {
        const { data: leases } = await supabase
          .from("leases")
          .select("id, start_date, end_date, monthly_rent, tenants(id, full_name, phone, email, nationality, national_id), units(unit_number, properties(name))")
          .eq("is_active", true)
          .order("start_date", { ascending: false });

        const rows = (leases ?? []).map((l: Record<string, unknown>) => {
          const tenant = l.tenants as Record<string, unknown> | null;
          const unit = l.units as Record<string, unknown> | null;
          const prop = unit?.properties as Record<string, unknown> | null;
          return {
            id: tenant?.id as string,
            full_name: (tenant?.full_name as string) || "—",
            phone: (tenant?.phone as string) || "—",
            email: (tenant?.email as string) || "—",
            nationality: (tenant?.nationality as string) || "—",
            national_id: (tenant?.national_id as string) || "—",
            unit_number: (unit?.unit_number as string) || "—",
            property_name: (prop?.name as string) || "—",
            start_date: l.start_date as string,
            end_date: l.end_date as string,
            monthly_rent: parseFloat(l.monthly_rent as string),
            status: "active",
          };
        });

        pdfBuffer = await renderToBuffer(
          React.createElement(TenantRosterPDF, { data: { tenants: rows } })
        );
        fileName = `tenant-roster-${format(new Date(), "yyyy-MM-dd")}.pdf`;
        break;
      }

      case "maintenance-summary": {
        const { data: requests } = await supabase
          .from("maintenance_requests")
          .select("id, title, category, priority, status, estimated_cost, created_at, tenants(full_name), units(unit_number)")
          .order("created_at", { ascending: false });

        const rows = (requests ?? []).map((r: Record<string, unknown>) => {
          const tenant = r.tenants as Record<string, unknown> | null;
          const unit = r.units as Record<string, unknown> | null;
          return {
            id: r.id as string,
            title: r.title as string,
            category: (r.category as string) || "—",
            priority: (r.priority as string) || "low",
            status: r.status as string,
            tenant_name: (tenant?.full_name as string) || "—",
            unit_number: (unit?.unit_number as string) || "—",
            created_at: format(parseISO(r.created_at as string), "yyyy-MM-dd"),
            estimated_cost: r.estimated_cost ? parseFloat(r.estimated_cost as string) : null,
          };
        });

        pdfBuffer = await renderToBuffer(
          React.createElement(MaintenancePDF, { data: { requests: rows } })
        );
        fileName = `maintenance-summary-${format(new Date(), "yyyy-MM-dd")}.pdf`;
        break;
      }

      case "cheque-tracker": {
        const { data: cheques } = await supabase
          .from("cheques")
          .select("id, cheque_number, bank_name, cheque_date, amount, status, notes, tenants(full_name)")
          .order("cheque_date", { ascending: false });

        const rows = (cheques ?? []).map((c: Record<string, unknown>) => {
          const tenant = c.tenants as Record<string, unknown> | null;
          return {
            id: c.id as string,
            cheque_number: c.cheque_number as string,
            bank_name: c.bank_name as string,
            cheque_date: c.cheque_date as string,
            amount: parseFloat(c.amount as string),
            status: c.status as string,
            tenant_name: (tenant?.full_name as string) || "—",
            notes: c.notes as string | null,
          };
        });

        pdfBuffer = await renderToBuffer(
          React.createElement(ChequeTrackerPDF, { data: { cheques: rows } })
        );
        fileName = `cheque-tracker-${format(new Date(), "yyyy-MM-dd")}.pdf`;
        break;
      }

      case "document-expiry": {
        const cutoff = format(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
        const { data: docs } = await supabase
          .from("documents")
          .select("id, document_type, file_name, expiry_date, entity_id")
          .eq("entity_type", "tenant")
          .not("expiry_date", "is", null)
          .lte("expiry_date", cutoff)
          .order("expiry_date", { ascending: true });

        // Fetch tenant names
        const tenantIds = [...new Set((docs ?? []).map((d: Record<string, unknown>) => d.entity_id as string))];
        const { data: tenants } = tenantIds.length > 0
          ? await supabase.from("tenants").select("id, full_name").in("id", tenantIds)
          : { data: [] };

        const tenantMap = Object.fromEntries((tenants ?? []).map((t: Record<string, unknown>) => [t.id, t.full_name]));
        const today = new Date();

        const rows = (docs ?? []).map((d: Record<string, unknown>) => ({
          id: d.id as string,
          tenant_name: (tenantMap[d.entity_id as string] as string) || "—",
          document_type: d.document_type as string,
          file_name: d.file_name as string | null,
          expiry_date: d.expiry_date as string,
          days_until_expiry: differenceInDays(parseISO(d.expiry_date as string), today),
        }));

        pdfBuffer = await renderToBuffer(
          React.createElement(DocumentExpiryPDF, { data: { documents: rows } })
        );
        fileName = `document-expiry-${format(new Date(), "yyyy-MM-dd")}.pdf`;
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown report" }, { status: 404 });
    }

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PDF generation failed" },
      { status: 500 }
    );
  }
}
