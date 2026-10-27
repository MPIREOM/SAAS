import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EMPTY_EXTRACTION, extractMunicipalityContract } from "@/lib/municipality-contracts/extract";

// Prefill for the add-contract form. Non-critical: on any failure it
// returns nulls and the form is filled in by hand.

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.type !== "application/pdf" || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(EMPTY_EXTRACTION);
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    return NextResponse.json(await extractMunicipalityContract(base64));
  } catch (error: unknown) {
    console.error("Extract municipality contract error:", error);
    return NextResponse.json(EMPTY_EXTRACTION);
  }
}
