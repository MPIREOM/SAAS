import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Read the reference number and registered period off a municipality rent
// contract PDF so staff don't have to type them. Non-critical: on any
// failure it returns nulls and the form is filled in by hand.

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const client = new Anthropic();

const EMPTY = { contract_number: null, start_date: null, end_date: null };

const extractPrompt = `This is a rent contract registered with an Omani municipality (e.g. "Muscat Municipality in Bousher" / "بلدية مسقط"). It may be in Arabic, English or both, and digits may be Arabic-Indic (٠١٢٣٤٥٦٧٨٩).

Extract:
- contract_number: the municipality's contract reference, labelled "Reference Number" / "رقم الحفظ" or "Agreement No." / "رقم العقد", written like 36854/2026 (number/year). Not the form number, request number or receipt number.
- start_date and end_date: the contract period, as YYYY-MM-DD.

Convert any Arabic-Indic digits to Western digits. Use null for anything you can't find.

Return ONLY a valid JSON object: {"contract_number": "36854/2026", "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD"}`;

const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v).getTime());

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
      return NextResponse.json(EMPTY);
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: extractPrompt },
          ],
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") return NextResponse.json(EMPTY);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
    } catch {
      return NextResponse.json(EMPTY);
    }

    const number = typeof parsed.contract_number === "string" ? parsed.contract_number.trim().slice(0, 100) : "";
    return NextResponse.json({
      contract_number: number || null,
      start_date: isIsoDate(parsed.start_date) ? parsed.start_date : null,
      end_date: isIsoDate(parsed.end_date) ? parsed.end_date : null,
    });
  } catch (error: unknown) {
    console.error("Extract municipality contract error:", error);
    return NextResponse.json(EMPTY);
  }
}
