import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerMonthlyReport } from "@/lib/owners/monthly-report-data";
import { renderMonthlyReportPdf } from "@/lib/owners/monthly-report-pdf";

export const maxDuration = 30;

// Preview endpoint for the weekly owner WhatsApp report — generates the
// same PDF the cron sends and streams it back inline so the operator can
// see exactly what the owner will receive. Auth is whatever guards the
// dashboard routes (Supabase session via createClient).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  // Confirm the caller is signed in. RLS on the owners read below also
  // gates this, but rejecting up-front keeps the error message clean.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await getOwnerMonthlyReport(supabase, id);
  if (!report) {
    return NextResponse.json({ error: "Owner not found" }, { status: 404 });
  }

  try {
    const pdfBuffer = await renderMonthlyReportPdf(report);

    const filename = `MPIRE-${report.ownerName.replace(/[^A-Za-z0-9]+/g, "-")}-${report.monthLabel.replace(/\s+/g, "-")}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // Surface the actual error in the HTTP response so it doesn't get
    // truncated in Vercel's first-stdout-line-only log view. This route
    // is only reachable by signed-in operators, so leaking the message
    // is acceptable here.
    const message = err instanceof Error ? `${err.message}\n\n${err.stack ?? ""}` : String(err);
    console.error("[monthly-report] render failed:", message);
    return new NextResponse(`Failed to render PDF:\n\n${message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
