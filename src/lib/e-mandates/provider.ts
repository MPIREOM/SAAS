import type { MandateProvider, MandateProviderName } from "./types";
import { MockMandateProvider } from "./providers/mock";
import { BankMuscatMandateProvider, BANK_MUSCAT_ENV_KEYS, bankMuscatEnv } from "./providers/bank-muscat";

// Provider selection:
//   E_MANDATE_PROVIDER=bank_muscat  → real adapter (must be fully configured)
//   E_MANDATE_PROVIDER=mock         → mock adapter
//   unset                           → bank_muscat if configured, else mock
//
// The name is stored on every mandate row, so a mandate created with the
// mock keeps using the mock even after the real provider is switched on.

let bankMuscat: BankMuscatMandateProvider | null = null;
let mock: MockMandateProvider | null = null;

export function getProvider(name: MandateProviderName): MandateProvider {
  if (name === "bank_muscat") {
    bankMuscat ??= new BankMuscatMandateProvider();
    return bankMuscat;
  }
  mock ??= new MockMandateProvider();
  return mock;
}

export function defaultProviderName(): MandateProviderName {
  const forced = process.env.E_MANDATE_PROVIDER;
  if (forced === "bank_muscat" || forced === "mock") return forced;
  return getProvider("bank_muscat").isConfigured() ? "bank_muscat" : "mock";
}

export interface ProviderStatus {
  active: MandateProviderName;
  forced: boolean;
  bankMuscat: { configured: boolean; missing: string[] };
  mock: { otpHint: string; collectResult: string; webhookSecretSet: boolean };
}

/** Diagnostic summary for the settings page. Never returns secret values. */
export function providerStatus(): ProviderStatus {
  const env = bankMuscatEnv();
  const missing = BANK_MUSCAT_ENV_KEYS.filter((k) => !process.env[k]);
  void env;
  return {
    active: defaultProviderName(),
    forced: process.env.E_MANDATE_PROVIDER === "bank_muscat" || process.env.E_MANDATE_PROVIDER === "mock",
    bankMuscat: { configured: missing.length === 0, missing },
    mock: {
      otpHint: process.env.E_MANDATE_MOCK_OTP ? "custom" : "123456",
      collectResult: process.env.E_MANDATE_MOCK_COLLECT_RESULT || "settled",
      webhookSecretSet: !!process.env.E_MANDATE_MOCK_WEBHOOK_SECRET,
    },
  };
}
