// Shared types for the bank e-mandate (direct debit) integration.
//
// The provider interface is deliberately small and bank-agnostic. Everything
// the dashboard, tenant portal, cron and webhook need goes through it, so the
// Bank Muscat adapter can be finished (or replaced) without touching callers.

export type MandateProviderName = "bank_muscat" | "mock";

export type MandateStatus =
  | "pending_otp"
  | "active"
  | "suspended"
  | "cancelled"
  | "failed"
  | "expired";

export type CollectionStatus =
  | "scheduled"
  | "submitted"
  | "settled"
  | "failed"
  | "returned"
  | "cancelled";

export type ProviderResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; retryable?: boolean };

export interface CreateMandateInput {
  /** Our own id for the mandate row; sent to the bank as the client reference. */
  reference: string;
  amount: number;
  currency: string;
  collectionDay: number;
  startDate: string; // yyyy-MM-dd
  endDate?: string | null;
  debtor: {
    name: string;
    phone: string;
    /** Full account number or IBAN. Sent to the bank, never stored. */
    accountNumber: string;
    bankCode?: string | null;
    nationalId?: string | null;
  };
  /** Free text the bank may show the tenant, e.g. "Rent — Unit 12". */
  description: string;
}

export interface CreateMandateOutput {
  providerMandateId: string;
  providerReference?: string | null;
  providerStatus?: string | null;
  /**
   * True when the bank has sent (or will send) an OTP to the tenant and we
   * must call confirmMandate. False when the bank activates immediately.
   */
  otpRequired: boolean;
  /** Seconds the OTP stays valid, when the bank tells us. */
  otpTtlSeconds?: number | null;
}

export interface ConfirmMandateOutput {
  providerStatus?: string | null;
  status: Extract<MandateStatus, "active" | "pending_otp" | "failed">;
}

export interface CollectInput {
  providerMandateId: string;
  /** Our collection row id; sent as the end-to-end reference. */
  reference: string;
  amount: number;
  currency: string;
  /** yyyy-MM-dd the debit should be executed. */
  scheduledDate: string;
  description: string;
}

export interface CollectOutput {
  providerCollectionId: string;
  providerStatus?: string | null;
  /** submitted = waiting for the bank; settled/failed = final right away. */
  status: Extract<CollectionStatus, "submitted" | "settled" | "failed">;
  failureReason?: string | null;
}

export interface CollectionStatusOutput {
  providerStatus?: string | null;
  status: Extract<CollectionStatus, "submitted" | "settled" | "failed" | "returned">;
  failureReason?: string | null;
  settledAt?: string | null;
}

/** Normalised event parsed out of a provider webhook payload. */
export type ProviderEvent =
  | {
      kind: "mandate";
      providerEventId: string | null;
      providerMandateId: string;
      status: Extract<MandateStatus, "active" | "suspended" | "cancelled" | "failed" | "expired">;
      providerStatus?: string | null;
      reason?: string | null;
    }
  | {
      kind: "collection";
      providerEventId: string | null;
      providerCollectionId: string;
      status: Extract<CollectionStatus, "submitted" | "settled" | "failed" | "returned">;
      providerStatus?: string | null;
      reason?: string | null;
      settledAt?: string | null;
    };

export interface MandateProvider {
  readonly name: MandateProviderName;
  /** True when the adapter has every credential it needs to call the bank. */
  isConfigured(): boolean;
  createMandate(input: CreateMandateInput): Promise<ProviderResult<CreateMandateOutput>>;
  confirmMandate(providerMandateId: string, otp: string): Promise<ProviderResult<ConfirmMandateOutput>>;
  resendOtp(providerMandateId: string): Promise<ProviderResult<{ otpTtlSeconds?: number | null }>>;
  cancelMandate(providerMandateId: string, reason: string): Promise<ProviderResult<{ providerStatus?: string | null }>>;
  collect(input: CollectInput): Promise<ProviderResult<CollectOutput>>;
  getCollectionStatus(providerCollectionId: string): Promise<ProviderResult<CollectionStatusOutput>>;
  /** Verify a webhook delivery. rawBody is the exact request body text. */
  verifyWebhook(rawBody: string, headers: Headers): boolean;
  /** Turn a verified webhook body into zero or more normalised events. */
  parseWebhook(rawBody: string): ProviderEvent[];
}
