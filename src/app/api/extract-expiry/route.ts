import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const documentType = formData.get("document_type") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    const allowedImageTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    const isPdf = file.type === "application/pdf";

    if (!allowedImageTypes.includes(file.type) && !isPdf) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload an image or PDF." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const typeHints: Record<string, string> = {
      lease_agreement:
        "This is a lease/rental agreement. Look for the lease end date, contract expiry, or termination date.",
      id_copy:
        "This is an ID card (national ID, Emirates ID, etc). Look for the expiry date or date of expiry printed on the card.",
      passport:
        "This is a passport. Look for the expiry date or date of expiration on the data page.",
      visa:
        "This is a visa document. Look for the visa expiry date, valid until date, or date of expiry.",
      insurance:
        "This is an insurance document/certificate. Look for the policy expiry date or coverage end date.",
      permit:
        "This is a permit document. Look for the permit expiry date or valid until date.",
      noc: "This is a No Objection Certificate. Look for any validity period or expiry date if present.",
      title_deed:
        "This is a title deed. These rarely expire, but check for any validity date if present.",
    };

    const hint = typeHints[documentType || ""] || "Look for any expiry, end, or validity date in this document.";

    const extractPrompt = `You are a document analyzer for a property management system. Your task is to find the expiry date or end date in this document.

Context: ${hint}

Instructions:
1. Carefully examine the entire document for dates related to expiry, end date, valid until, or termination.
2. For lease agreements: the lease end date is the expiry date.
3. For IDs/passports/visas: look for "Date of Expiry", "Expiry Date", "Valid Until", etc.
4. Return the date in ISO format (YYYY-MM-DD).
5. If multiple dates are found, return the one most relevant to document expiry.
6. If no expiry date is found, return null.

Return ONLY a valid JSON object: {"expiry_date": "YYYY-MM-DD"} or {"expiry_date": null}
Do not include any other text or explanation.`;

    const contentBlocks: Anthropic.Messages.ContentBlockParam[] = isPdf
      ? [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          { type: "text", text: extractPrompt },
        ]
      : [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: file.type as
                | "image/jpeg"
                | "image/png"
                | "image/webp"
                | "image/gif",
              data: base64,
            },
          },
          { type: "text", text: extractPrompt },
        ];

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [{ role: "user", content: contentBlocks }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ expiry_date: null });
    }

    let parsed;
    try {
      // Handle cases where model wraps JSON in markdown code blocks
      const cleaned = textBlock.text
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ expiry_date: null });
    }

    // Validate the date format
    const dateStr = parsed.expiry_date;
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return NextResponse.json({ expiry_date: dateStr });
      }
    }

    return NextResponse.json({ expiry_date: null });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "status" in error) {
      const apiError = error as { status: number; message?: string };
      if (apiError.status === 429) {
        return NextResponse.json(
          { error: "Rate limit reached. Please try again shortly." },
          { status: 429 }
        );
      }
    }

    console.error("Extract expiry error:", error);
    // Non-critical — return null so upload can proceed without auto-fill
    return NextResponse.json({ expiry_date: null });
  }
}
