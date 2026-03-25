import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    // Auth check — this endpoint processes PII (ID documents)
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    const allowedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const isPdf = file.type === "application/pdf";

    if (!allowedImageTypes.includes(file.type) && !isPdf) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload a JPG, PNG, WebP, GIF image, or PDF." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const extractPrompt = `You are an ID document scanner for a property management system. Extract the following details from this ID card:

- full_name: The person's full name as written on the ID
- nationality: The person's nationality/country
- national_id: The ID number on the card

Return ONLY a valid JSON object with these three fields. If a field is not visible or readable, set it to null. Do not include any other text or explanation.

Example: {"full_name": "John Smith", "nationality": "United Arab Emirates", "national_id": "784-1990-1234567-1"}`;

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
              media_type: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: base64,
            },
          },
          { type: "text", text: extractPrompt },
        ];

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: contentBlocks,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "Failed to extract text from response" }, { status: 500 });
    }

    let parsed;
    try {
      // Strip markdown code fences and extra whitespace that the model may add
      let raw = textBlock.text.trim();
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        raw = fenceMatch[1].trim();
      }
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    logAudit(supabase, {
      action: "create",
      entity_type: "document",
      metadata: { scan_type: "id_document" },
    });

    return NextResponse.json({
      full_name: parsed.full_name || null,
      nationality: parsed.nationality || null,
      national_id: parsed.national_id || null,
    });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Failed to parse AI response. Please try again." },
        { status: 500 }
      );
    }

    // Anthropic API errors
    if (error && typeof error === "object" && "status" in error) {
      const apiError = error as { status: number; message?: string };
      const msg = apiError.message || "Unknown API error";
      console.error("Anthropic API error:", apiError.status, msg);

      if (apiError.status === 401) {
        return NextResponse.json(
          { error: "AI service authentication failed. Please check your API key." },
          { status: 500 }
        );
      }
      if (apiError.status === 413 || msg.includes("too large")) {
        return NextResponse.json(
          { error: "File is too large. Please upload a smaller image or PDF." },
          { status: 400 }
        );
      }
      if (apiError.status === 429) {
        return NextResponse.json(
          { error: "AI service rate limit reached. Please wait a moment and try again." },
          { status: 429 }
        );
      }
      if (apiError.status === 400 && msg.includes("credit balance")) {
        return NextResponse.json(
          { error: "AI service credits depleted. Please top up your Anthropic API account." },
          { status: 500 }
        );
      }
    }

    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to scan ID: ${errorMsg}. Please try again or enter details manually.` },
      { status: 500 }
    );
  }
}
