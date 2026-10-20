// WhatsApp template for the low gate key stock alert (stock.ts). Kept apart
// so the template list can import it without the sender.

export const GATE_KEY_LOW_STOCK_TEMPLATE = {
  name: "gate_keys_low_stock",
  language: "en" as const,
  // {{1}} property, {{2}} keys left, {{3}} reorder level
  body: [
    "Gate keys are running low at {{1}}.",
    "",
    "🔑 Keys left: {{2}}",
    "⚠️ Reorder level: {{3}}",
    "",
    "Please buy more gate keys and add them to the stock in MPIRE.",
    "",
    "MPIRE Property Management",
  ].join("\n"),
  example: ["Bousher Ameen Mosque", "20", "20"],
};
