import { NextRequest, NextResponse } from "next/server";
import { createAgreementsAdminClient, downloadSignedPdf } from "@/lib/agreements/service";

// Public: the tenant's signed copy, behind the same private token.

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await downloadSignedPdf(createAgreementsAdminClient(), token);
  if (!found) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new NextResponse(await found.file.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${found.name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
