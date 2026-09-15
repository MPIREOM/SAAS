import crypto from "crypto";
import { safeEqual } from "@/lib/crypto/safe-compare";
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

// ────────────────────────────────────────────────────────────────────────────
// Bank Muscat API Banking adapter — SKELETON
//
// Bank Muscat has not yet sent the API documentation or sandbox credentials.
// Everything marked `ASSUMPTION` below is a placeholder modelled on typical
// bank direct-debit APIs (OAuth2 client-credentials token, JSON REST
// endpoints, HMAC-signed webhooks). When the documentation arrives:
//
//   1. Fix the endpoint paths in ENDPOINTS.
//   2. Fix the request/response field names in each method's map*() helper.
//   3. Fix verifyWebhook() to the bank's signing scheme.
//   4. Fill in mapMandateStatus()/mapCollectionStatus() with the bank's codes.
//
// Nothing outside this file needs to change. Set E_MANDATE_PROVIDER=bank_muscat
// once the adapter is finished and the env vars below are populated.
// ────────────────────────────────────────────────────────────────────────────

export interface BankMuscatEnv {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /** Our creditor / merchant id with the bank, as printed on the agreement. */
  creditorId: string;
  /** Our collection account that debits are credited to. */
  creditorAccount: string;
  webhookSecret: string;
}

export function bankMuscatEnv(): Partial<BankMuscatEnv> {
  return {
    baseUrl: process.env.BANK_MUSCAT_API_BASE_URL,
    clientId: process.env.BANK_MUSCAT_CLIENT_ID,
    clientSecret: process.env.BANK_MUSCAT_CLIENT_SECRET,
    creditorId: process.env.BANK_MUSCAT_CREDITOR_ID,
    creditorAccount: process.env.BANK_MUSCAT_CREDITOR_ACCOUNT,
    webhookSecret: process.env.BANK_MUSCAT_WEBHOOK_SECRET,
  };
}

export const BANK_MUSCAT_ENV_KEYS = [
  "BANK_MUSCAT_API_BASE_URL",
  "BANK_MUSCAT_CLIENT_ID",
  "BANK_MUSCAT_CLIENT_SECRET",
  "BANK_MUSCAT_CREDITOR_ID",
  "BANK_MUSCAT_CREDITOR_ACCOUNT",
  "BANK_MUSCAT_WEBHOOK_SECRET",
] as const;

// ASSUMPTION: paths. Replace with the ones in the bank's documentation.
const ENDPOINTS = {
  token: "/oauth2/token",
  mandates: "/direct-debit/v1/mandates",
  mandateConfirm: (id: string) => `/direct-debit/v1/mandates/${encodeURIComponent(id)}/confirm`,
  mandateResendOtp: (id: string) => `/direct-debit/v1/mandates/${encodeURIComponent(id)}/otp`,
  mandateCancel: (id: string) => `/direct-debit/v1/mandates/${encodeURIComponent(id)}/cancel`,
  collections: "/direct-debit/v1/collections",
  collection: (id: string) => `/direct-debit/v1/collections/${encodeURIComponent(id)}`,
} as const;

type Json = Record<string, unknown>;

export class BankMuscatMandateProvider implements MandateProvider {
  readonly name = "bank_muscat" as const;
  private tokenCache: { value: string; expiresAt: number } | null = null;

  private env(): BankMuscatEnv | null {
    const e = bankMuscatEnv();
    if (!e.baseUrl || !e.clientId || !e.clientSecret || !e.creditorId || !e.creditorAccount || !e.webhookSecret) {
      return null;
    }
    return e as BankMuscatEnv;
  }

  isConfigured(): boolean {
    return this.env() !== null;
  }

  // ── HTTP plumbing ──────────────────────────────────────────────────────

  private async accessToken(env: BankMuscatEnv): Promise<ProviderResult<string>> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) {
      return { ok: true, data: this.tokenCache.value };
    }
    // ASSUMPTION: OAuth2 client-credentials with HTTP Basic auth.
    const basic = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64");
    try {
      const res = await fetch(`${env.baseUrl}${ENDPOINTS.token}`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      const body = (await res.json().catch(() => ({}))) as Json;
      if (!res.ok || typeof body.access_token !== "string") {
        return { ok: false, error: `Token request failed (HTTP ${res.status})`, code: "AUTH" };
      }
      const ttl = typeof body.expires_in === "number" ? body.expires_in : 300;
      this.tokenCache = { value: body.access_token, expiresAt: Date.now() + ttl * 1000 };
      return { ok: true, data: body.access_token };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Network error", retryable: true };
    }
  }

  private async request<T extends Json>(
    method: "GET" | "POST",
    path: string,
    payload?: Json,
  ): Promise<ProviderResult<T>> {
    const env = this.env();
    if (!env) return { ok: false, error: "Bank Muscat credentials are not configured", code: "NOT_CONFIGURED" };

    const token = await this.accessToken(env);
    if (!token.ok) return token;

    try {
      const res = await fetch(`${env.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token.data}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          // ASSUMPTION: idempotency + tracing headers commonly required.
          "X-Request-Id": crypto.randomUUID(),
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const body = (await res.json().catch(() => ({}))) as T;
      if (!res.ok) {
        const errBody = body as Json;
        const message =
          (typeof errBody.message === "string" && errBody.message) ||
          (typeof errBody.error_description === "string" && errBody.error_description) ||
          `HTTP ${res.status}`;
        const code = typeof errBody.code === "string" ? errBody.code : `HTTP_${res.status}`;
        return { ok: false, error: message, code, retryable: res.status >= 500 || res.status === 429 };
      }
      return { ok: true, data: body };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Network error", retryable: true };
    }
  }

  // ── Status mapping (fill in from the bank's code tables) ───────────────

  private mapMandateStatus(raw: unknown): ConfirmMandateOutput["status"] {
    const s = String(raw ?? "").toUpperCase();
    // ASSUMPTION
    if (["ACTIVE", "ACTV", "AUTHORISED", "AUTHORIZED"].includes(s)) return "active";
    if (["REJECTED", "RJCT", "FAILED"].includes(s)) return "failed";
    return "pending_otp";
  }

  private mapCollectionStatus(raw: unknown): CollectionStatusOutput["status"] {
    const s = String(raw ?? "").toUpperCase();
    // ASSUMPTION
    if (["SETTLED", "ACSC", "SUCCESS", "COMPLETED", "PAID"].includes(s)) return "settled";
    if (["RETURNED", "REVERSED", "RTRN"].includes(s)) return "returned";
    if (["REJECTED", "RJCT", "FAILED", "UNPAID"].includes(s)) return "failed";
    return "submitted";
  }

  // ── Mandates ───────────────────────────────────────────────────────────

  async createMandate(input: CreateMandateInput): Promise<ProviderResult<CreateMandateOutput>> {
    const env = this.env();
    if (!env) return { ok: false, error: "Bank Muscat credentials are not configured", code: "NOT_CONFIGURED" };

    // ASSUMPTION: request shape.
    const payload: Json = {
      creditorId: env.creditorId,
      creditorAccount: env.creditorAccount,
      clientReference: input.reference,
      amount: input.amount.toFixed(3),
      currency: input.currency,
      frequency: "MONTHLY",
      collectionDay: input.collectionDay,
      startDate: input.startDate,
      endDate: input.endDate ?? undefined,
      debtor: {
        name: input.debtor.name,
        mobile: input.debtor.phone,
        accountNumber: input.debtor.accountNumber,
        bankCode: input.debtor.bankCode ?? undefined,
        idNumber: input.debtor.nationalId ?? undefined,
      },
      narrative: input.description,
      authorisation: "OTP",
    };

    const res = await this.request<Json>("POST", ENDPOINTS.mandates, payload);
    if (!res.ok) return res;
    const d = res.data;
    const providerMandateId = String(d.mandateId ?? d.id ?? "");
    if (!providerMandateId) return { ok: false, error: "Bank response did not include a mandate id" };
    return {
      ok: true,
      data: {
        providerMandateId,
        providerReference: typeof d.reference === "string" ? d.reference : null,
        providerStatus: typeof d.status === "string" ? d.status : null,
        otpRequired: this.mapMandateStatus(d.status) !== "active",
        otpTtlSeconds: typeof d.otpExpiresIn === "number" ? d.otpExpiresIn : null,
      },
    };
  }

  async confirmMandate(providerMandateId: string, otp: string): Promise<ProviderResult<ConfirmMandateOutput>> {
    const res = await this.request<Json>("POST", ENDPOINTS.mandateConfirm(providerMandateId), { otp });
    if (!res.ok) {
      const retryable = res.code !== "OTP_EXPIRED" && res.code !== "OTP_LOCKED"; // ASSUMPTION
      return { ...res, retryable };
    }
    return {
      ok: true,
      data: {
        status: this.mapMandateStatus(res.data.status),
        providerStatus: typeof res.data.status === "string" ? res.data.status : null,
      },
    };
  }

  async resendOtp(providerMandateId: string): Promise<ProviderResult<{ otpTtlSeconds?: number | null }>> {
    const res = await this.request<Json>("POST", ENDPOINTS.mandateResendOtp(providerMandateId), {});
    if (!res.ok) return res;
    return { ok: true, data: { otpTtlSeconds: typeof res.data.otpExpiresIn === "number" ? res.data.otpExpiresIn : null } };
  }

  async cancelMandate(providerMandateId: string, reason: string): Promise<ProviderResult<{ providerStatus?: string | null }>> {
    const res = await this.request<Json>("POST", ENDPOINTS.mandateCancel(providerMandateId), { reason });
    if (!res.ok) return res;
    return { ok: true, data: { providerStatus: typeof res.data.status === "string" ? res.data.status : null } };
  }

  // ── Collections ────────────────────────────────────────────────────────

  async collect(input: CollectInput): Promise<ProviderResult<CollectOutput>> {
    // ASSUMPTION: request shape.
    const res = await this.request<Json>("POST", ENDPOINTS.collections, {
      mandateId: input.providerMandateId,
      endToEndId: input.reference,
      amount: input.amount.toFixed(3),
      currency: input.currency,
      requestedExecutionDate: input.scheduledDate,
      narrative: input.description,
    });
    if (!res.ok) return res;
    const d = res.data;
    const providerCollectionId = String(d.collectionId ?? d.id ?? "");
    if (!providerCollectionId) return { ok: false, error: "Bank response did not include a collection id" };
    const status = this.mapCollectionStatus(d.status);
    return {
      ok: true,
      data: {
        providerCollectionId,
        providerStatus: typeof d.status === "string" ? d.status : null,
        status: status === "returned" ? "failed" : status,
        failureReason: typeof d.reasonDescription === "string" ? d.reasonDescription : null,
      },
    };
  }

  async getCollectionStatus(providerCollectionId: string): Promise<ProviderResult<CollectionStatusOutput>> {
    const res = await this.request<Json>("GET", ENDPOINTS.collection(providerCollectionId));
    if (!res.ok) return res;
    const d = res.data;
    return {
      ok: true,
      data: {
        status: this.mapCollectionStatus(d.status),
        providerStatus: typeof d.status === "string" ? d.status : null,
        failureReason: typeof d.reasonDescription === "string" ? d.reasonDescription : null,
        settledAt: typeof d.settlementDate === "string" ? d.settlementDate : null,
      },
    };
  }

  // ── Webhooks ───────────────────────────────────────────────────────────

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    const secret = process.env.BANK_MUSCAT_WEBHOOK_SECRET;
    // ASSUMPTION: hex HMAC-SHA256 of the raw body in `X-Signature`.
    const signature = headers.get("x-signature");
    if (!secret || !signature) return false;
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    return safeEqual(signature.toLowerCase(), expected);
  }

  parseWebhook(rawBody: string): ProviderEvent[] {
    // ASSUMPTION: { events: [{ eventId, type, mandateId?, collectionId?, status, reason?, settlementDate? }] }
    let parsed: Json;
    try {
      parsed = JSON.parse(rawBody) as Json;
    } catch {
      return [];
    }
    const list = Array.isArray(parsed.events) ? (parsed.events as Json[]) : [parsed];
    const out: ProviderEvent[] = [];
    for (const ev of list) {
      const providerEventId = typeof ev.eventId === "string" ? ev.eventId : null;
      const reason = typeof ev.reason === "string" ? ev.reason : null;
      if (typeof ev.collectionId === "string") {
        out.push({
          kind: "collection",
          providerEventId,
          providerCollectionId: ev.collectionId,
          status: this.mapCollectionStatus(ev.status),
          providerStatus: typeof ev.status === "string" ? ev.status : null,
          reason,
          settledAt: typeof ev.settlementDate === "string" ? ev.settlementDate : null,
        });
      } else if (typeof ev.mandateId === "string") {
        const s = String(ev.status ?? "").toUpperCase();
        const status =
          s === "SUSPENDED" ? "suspended"
          : s === "CANCELLED" || s === "REVOKED" ? "cancelled"
          : s === "EXPIRED" ? "expired"
          : this.mapMandateStatus(s) === "active" ? "active"
          : "failed";
        out.push({
          kind: "mandate",
          providerEventId,
          providerMandateId: ev.mandateId,
          status,
          providerStatus: typeof ev.status === "string" ? ev.status : null,
          reason,
        });
      }
    }
    return out;
  }
}
