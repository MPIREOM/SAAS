import Anthropic from "@anthropic-ai/sdk";

// Read the reference number and registered period off a municipality rent
// contract PDF. Used when staff upload a contract and by the one-time
// import of PDFs already uploaded as tenant lease agreements.

const client = new Anthropic();

export interface ExtractedMunicipalityContract {
  contract_number: string | null;
  start_date: string | null;
  end_date: string | null;
}

export const EMPTY_EXTRACTION: ExtractedMunicipalityContract = {
  contract_number: null,
  start_date: null,
  end_date: null,
};

const extractPrompt = `This should be a rent contract registered with an Omani municipality (e.g. "Muscat Municipality in Bousher" / "بلدية مسقط"). It may be in Arabic, English or both, and digits may be Arabic-Indic (٠١٢٣٤٥٦٧٨٩).

Extract:
- contract_number: the municipality's contract reference, labelled "Reference Number" / "رقم الحفظ" or "Agreement No." / "رقم العقد", written like 36854/2026 (number/year). Not the form number, request number or receipt number.
- start_date and end_date: the contract period, as YYYY-MM-DD.

Convert any Arabic-Indic digits to Western digits. If the document is not a municipality-registered rent contract, or a value can't be found, use null.

Return ONLY a valid JSON object: {"contract_number": "36854/2026", "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD"}`;

const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v).getTime());

/** Throws on API errors; returns nulls when the PDF doesn't yield values. */
export async function extractMunicipalityContract(pdfBase64: string): Promise<ExtractedMunicipalityContract> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: extractPrompt },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") return EMPTY_EXTRACTION;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
  } catch {
    return EMPTY_EXTRACTION;
  }

  const number = typeof parsed.contract_number === "string" ? parsed.contract_number.trim().slice(0, 100) : "";
  return {
    contract_number: number || null,
    start_date: isIsoDate(parsed.start_date) ? parsed.start_date : null,
    end_date: isIsoDate(parsed.end_date) ? parsed.end_date : null,
  };
}
