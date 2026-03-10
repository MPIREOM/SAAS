import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
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

    const parsed = JSON.parse(textBlock.text);

    return NextResponse.json({
      full_name: parsed.full_name || null,
      nationality: parsed.nationality || null,
      national_id: parsed.national_id || null,
    });
  } catch (error) {
    console.error("ID scan error:", error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to scan ID. Please try again or enter details manually." },
      { status: 500 }
    );
  }
}
