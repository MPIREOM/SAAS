import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAgreementsAdminClient, loadAgreementContext, signAgreement } from "@/lib/agreements/service";

// Public: the tenant's private signing link. GET shows the agreement, POST
// signs it with the drawn signature. Goes through the service role; the
// unguessable token is the credential.

export const maxDuration = 60;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await loadAgreementContext(createAgreementsAdminClient(), { token });
  if (!ctx || ctx.agreement.status === "cancelled") return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    reference: ctx.agreement.reference,
    status: ctx.agreement.status,
    tenant_name: ctx.tenant.full_name,
    national_id: ctx.tenant.national_id,
    unit_number: ctx.unitNumber,
    property_name: ctx.propertyName,
    lease_start: ctx.leaseStart,
    security_deposit: ctx.securityDeposit,
    electricity_meter: ctx.electricityMeter,
    water_meter: ctx.waterMeter,
    gate_keys: ctx.agreement.gate_keys,
    garbage_fee: Number(ctx.agreement.garbage_fee),
    key_fee: Number(ctx.agreement.key_fee),
    signed_at: ctx.agreement.signed_at,
    signer_name: ctx.agreement.signer_name,
  });
}

const schema = z.object({
  signer_name: z.string().trim().min(2).max(120),
  signature: z.string().max(600_000),
  accepted: z.literal(true),
});

const STATUS: Record<string, number> = {
  not_found: 404,
  already_signed: 409,
  cancelled: 410,
  invalid_signature: 400,
  failed: 500,
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  const result = await signAgreement(createAgreementsAdminClient(), token, {
    signerName: parsed.data.signer_name,
    signatureImage: parsed.data.signature,
    ip,
    userAgent: request.headers.get("user-agent"),
    fallbackOrigin: request.nextUrl.origin,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 500 });
  return NextResponse.json({ signed_at: result.signedAt });
}
