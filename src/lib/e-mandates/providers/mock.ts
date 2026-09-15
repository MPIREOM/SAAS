import crypto from "crypto";
import type {
  CollectInput,
  CollectOutput,
  CollectionStatusOutput,
  ConfirmMandateOutput,
  CreateMandateInput,
  CreateMandateOutput,
  MandateProvider,
  ProviderEvent,
  ProviderResult,
} from "../types";

// Stateless stand-in for a real bank so the whole mandate flow (create →
// tenant OTP → monthly collection → payment) can be exercised before Bank
// Muscat's sandbox exists. Behaviour is driven by env so it can be pointed at
// failure paths without code changes:
//
//   E_MANDATE_MOCK_OTP             OTP the portal accepts   (default 123456)
//   E_MANDATE_MOCK_COLLECT_RESULT  settled | submitted | failed (default settled)
//
// Webhooks: any POST to /api/webhooks/bank-muscat with header
// `x-mock-signature: <E_MANDATE_MOCK_WEBHOOK_SECRET>` and a body of
// { events: ProviderEvent[] } is accepted, which lets you simulate a
// settlement or a bounce with curl.

const MOCK_OTP_DEFAULT = "123456";

function mockOtp(): string {
  return process.env.E_MANDATE_MOCK_OTP || MOCK_OTP_DEFAULT;
}

function collectResult(): CollectOutput["status"] {
  const v = process.env.E_MANDATE_MOCK_COLLECT_RESULT;
  if (v === "submitted" || v === "failed") return v;
  return "settled";
}

export class MockMandateProvider implements MandateProvider {
  readonly name = "mock" as const;

  isConfigured(): boolean {
    return true;
  }

  async createMandate(input: CreateMandateInput): Promise<ProviderResult<CreateMandateOutput>> {
    if (!/^[A-Za-z0-9]{8,34}$/.test(input.debtor.accountNumber.replace(/\s+/g, ""))) {
      return { ok: false, error: "Account number must be 8–34 letters or digits", code: "INVALID_ACCOUNT" };
    }
    return {
      ok: true,
      data: {
        providerMandateId: `mock_mnd_${crypto.randomBytes(6).toString("hex")}`,
        providerReference: input.reference,
        providerStatus: "PENDING_AUTHORISATION",
        otpRequired: true,
        otpTtlSeconds: 15 * 60,
      },
    };
  }

  async confirmMandate(_providerMandateId: string, otp: string): Promise<ProviderResult<ConfirmMandateOutput>> {
    void _providerMandateId;
    if (otp.trim() === mockOtp()) {
      return { ok: true, data: { status: "active", providerStatus: "ACTIVE" } };
    }
    return { ok: false, error: "Incorrect OTP", code: "OTP_MISMATCH", retryable: true };
  }

  async resendOtp(): Promise<ProviderResult<{ otpTtlSeconds?: number | null }>> {
    return { ok: true, data: { otpTtlSeconds: 15 * 60 } };
  }

  async cancelMandate(): Promise<ProviderResult<{ providerStatus?: string | null }>> {
    return { ok: true, data: { providerStatus: "CANCELLED" } };
  }

  async collect(_input: CollectInput): Promise<ProviderResult<CollectOutput>> {
    void _input;
    const status = collectResult();
    return {
      ok: true,
      data: {
        providerCollectionId: `mock_col_${crypto.randomBytes(6).toString("hex")}`,
        providerStatus: status.toUpperCase(),
        status,
        failureReason: status === "failed" ? "Insufficient funds (mock)" : null,
      },
    };
  }

  async getCollectionStatus(): Promise<ProviderResult<CollectionStatusOutput>> {
    const status = collectResult();
    return {
      ok: true,
      data: {
        status: status === "submitted" ? "submitted" : status,
        providerStatus: status.toUpperCase(),
        settledAt: status === "settled" ? new Date().toISOString() : null,
      },
    };
  }

  verifyWebhook(_rawBody: string, headers: Headers): boolean {
    void _rawBody;
    const secret = process.env.E_MANDATE_MOCK_WEBHOOK_SECRET;
    if (!secret) return false;
    return headers.get("x-mock-signature") === secret;
  }

  parseWebhook(rawBody: string): ProviderEvent[] {
    try {
      const parsed = JSON.parse(rawBody) as { events?: ProviderEvent[] };
      return Array.isArray(parsed.events) ? parsed.events : [];
    } catch {
      return [];
    }
  }
}
