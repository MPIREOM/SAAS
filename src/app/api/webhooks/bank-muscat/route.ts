import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/e-mandates/provider";
import { applyProviderEvents, createAdminClient } from "@/lib/e-mandates/service";
import type { MandateProviderName } from "@/lib/e-mandates/types";

// Bank callback for mandate and collection status changes.
//
// The real Bank Muscat signature scheme is not known yet (see the adapter);
// until then the mock provider accepts `x-mock-signature` so settlements and
// bounces can be simulated with curl. Which provider verifies the request is
// chosen by header: `x-mock-signature` present → mock, otherwise bank_muscat.

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const providerName: MandateProviderName = request.headers.has("x-mock-signature") ? "mock" : "bank_muscat";
  const provider = getProvider(providerName);

  if (!provider.verifyWebhook(rawBody, request.headers)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const events = provider.parseWebhook(rawBody);
  if (events.length === 0) return NextResponse.json({ received: 0 });

  const summary = await applyProviderEvents(createAdminClient(), providerName, events);
  return NextResponse.json({ received: events.length, ...summary });
}

// Some banks probe the URL with GET during onboarding.
export async function GET() {
  return NextResponse.json({ ok: true });
}
