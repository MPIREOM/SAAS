import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createTemplate,
  debugToken,
  discoverWabaId,
  getAppSubscriptions,
  getPhoneNumber,
  getWabaSubscribedApps,
  listTemplates,
  setAppSubscription,
  subscribeAppToWaba,
  whatsAppAdminEnv,
  WEBHOOK_FIELDS,
  type AppSubscription,
  type PhoneNumberInfo,
  type SubscribedApp,
  type TokenInfo,
  type WhatsAppAdminEnv,
} from "./admin";
import { allTemplateDefinitions, type TemplateDefinition } from "./template-definitions";

// Everything the WhatsApp setup page needs, gathered with tolerance: each
// Meta call that fails becomes an error string on its own section instead of
// failing the page. Used after the September 2026 ban to connect the
// replacement number, and for any future move.

export const WEBHOOK_PATH = "/api/webhooks/whatsapp";

export function webhookCallbackUrl(env: WhatsAppAdminEnv, fallbackOrigin: string | null): string | null {
  const base = env.appUrl ?? fallbackOrigin;
  return base ? `${base.replace(/\/+$/, "")}${WEBHOOK_PATH}` : null;
}

export interface EnvCheck {
  name: string;
  set: boolean;
  required: boolean;
}

export interface TemplateRow {
  name: string;
  language: string;
  category: string;
  source: TemplateDefinition["source"];
  manual: string | null;
  issues: string[];
  /** Meta's status, or null when the template does not exist on the account. */
  status: string | null;
  rejectedReason: string | null;
  bodyPreview: string;
}

export interface WhatsAppSetupStatus {
  env: EnvCheck[];
  callbackUrl: string | null;
  token: TokenInfo | null;
  tokenError: string | null;
  phone: PhoneNumberInfo | null;
  phoneError: string | null;
  wabaId: string | null;
  wabaNotes: string[];
  appId: string | null;
  subscribedApps: SubscribedApp[];
  subscribedAppsError: string | null;
  appSubscribedToWaba: boolean;
  appSubscription: AppSubscription | null;
  appSubscriptionError: string | null;
  webhookPointsHere: boolean;
  missingFields: string[];
  templates: TemplateRow[];
  templatesError: string | null;
}

function envChecks(env: WhatsAppAdminEnv): EnvCheck[] {
  return [
    { name: "WHATSAPP_ACCESS_TOKEN", set: Boolean(env.accessToken), required: true },
    { name: "WHATSAPP_PHONE_NUMBER_ID", set: Boolean(env.phoneNumberId), required: true },
    { name: "WHATSAPP_APP_SECRET", set: Boolean(env.appSecret), required: true },
    { name: "WHATSAPP_WEBHOOK_VERIFY_TOKEN", set: Boolean(env.verifyToken), required: true },
    { name: "WHATSAPP_BUSINESS_ACCOUNT_ID", set: Boolean(env.businessAccountId), required: false },
    { name: "NEXT_PUBLIC_APP_URL", set: Boolean(env.appUrl), required: false },
  ];
}

export async function loadWhatsAppSetup(
  supabase: SupabaseClient,
  fallbackOrigin: string | null
): Promise<WhatsAppSetupStatus> {
  const env = whatsAppAdminEnv();
  const callbackUrl = webhookCallbackUrl(env, fallbackOrigin);

  const [tokenRes, phoneRes, definitions] = await Promise.all([
    debugToken(env),
    getPhoneNumber(env),
    allTemplateDefinitions(supabase),
  ]);
  const token = tokenRes.ok ? tokenRes.data : null;
  const discovery = await discoverWabaId(env, token);
  const wabaId = discovery.wabaId;
  const appId = token?.appId ?? null;

  const [appsRes, subRes, templatesRes] = await Promise.all([
    wabaId ? getWabaSubscribedApps(wabaId, env) : Promise.resolve(null),
    appId ? getAppSubscriptions(appId, env) : Promise.resolve(null),
    wabaId ? listTemplates(wabaId, Array.from(new Set(definitions.map((d) => d.name))), env) : Promise.resolve(null),
  ]);

  const subscribedApps = appsRes?.ok ? appsRes.data : [];
  const appSubscription =
    subRes?.ok ? (subRes.data.find((s) => s.object === "whatsapp_business_account") ?? null) : null;
  const found = templatesRes?.ok ? templatesRes.data : [];

  const missingFields = appSubscription
    ? WEBHOOK_FIELDS.filter((f) => !appSubscription.fields.includes(f))
    : [...WEBHOOK_FIELDS];

  return {
    env: envChecks(env),
    callbackUrl,
    token,
    tokenError: tokenRes.ok ? null : tokenRes.error,
    phone: phoneRes.ok ? phoneRes.data : null,
    phoneError: phoneRes.ok ? null : phoneRes.error,
    wabaId,
    wabaNotes: discovery.notes,
    appId,
    subscribedApps,
    subscribedAppsError: appsRes && !appsRes.ok ? appsRes.error : null,
    appSubscribedToWaba: Boolean(appId && subscribedApps.some((a) => a.id === appId)),
    appSubscription,
    appSubscriptionError: subRes && !subRes.ok ? subRes.error : null,
    webhookPointsHere: Boolean(
      appSubscription?.active && callbackUrl && appSubscription.callbackUrl === callbackUrl && missingFields.length === 0
    ),
    missingFields,
    templates: definitions.map((d) => {
      const match = found.find((t) => t.name === d.name && t.language === d.language);
      const bodyComponent = d.components.find((c) => c.type === "BODY");
      return {
        name: d.name,
        language: d.language,
        category: d.category,
        source: d.source,
        manual: d.manual ?? null,
        issues: d.issues,
        status: match?.status ?? null,
        rejectedReason: match?.rejectedReason ?? null,
        bodyPreview: bodyComponent && "text" in bodyComponent ? bodyComponent.text : "",
      };
    }),
    templatesError: templatesRes && !templatesRes.ok ? templatesRes.error : null,
  };
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Register webhooks for the configured number: point the app's
 * whatsapp_business_account subscription at this deployment (Meta verifies
 * the URL synchronously) and subscribe the app to the account.
 */
export async function connectWebhooks(fallbackOrigin: string | null): Promise<ActionResult<{ callbackUrl: string; wabaId: string }>> {
  const env = whatsAppAdminEnv();
  if (!env.accessToken) return { ok: false, error: "WHATSAPP_ACCESS_TOKEN is not set in Vercel." };
  if (!env.phoneNumberId) return { ok: false, error: "WHATSAPP_PHONE_NUMBER_ID is not set in Vercel." };
  if (!env.appSecret) return { ok: false, error: "WHATSAPP_APP_SECRET is not set — the webhook would reject every delivery." };
  if (!env.verifyToken) return { ok: false, error: "WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set in Vercel." };
  const callbackUrl = webhookCallbackUrl(env, fallbackOrigin);
  if (!callbackUrl) return { ok: false, error: "Set NEXT_PUBLIC_APP_URL so the callback URL is known." };

  const token = await debugToken(env);
  if (!token.ok) return { ok: false, error: `Token check failed: ${token.error}` };
  if (!token.data.appId) return { ok: false, error: "The access token does not belong to a Meta app." };

  const discovery = await discoverWabaId(env, token.data);
  if (!discovery.wabaId) {
    return { ok: false, error: `WhatsApp Business Account not found (${discovery.notes.join("; ")}). Set WHATSAPP_BUSINESS_ACCOUNT_ID.` };
  }

  const sub = await setAppSubscription(token.data.appId, callbackUrl, env.verifyToken, env);
  if (!sub.ok) return { ok: false, error: `App webhook registration failed: ${sub.error}` };

  const waba = await subscribeAppToWaba(discovery.wabaId, env);
  if (!waba.ok) return { ok: false, error: `Subscribing the app to the account failed: ${waba.error}` };

  return { ok: true, data: { callbackUrl, wabaId: discovery.wabaId } };
}

export interface TemplateCreateOutcome {
  name: string;
  language: string;
  action: "created" | "unchanged" | "manual" | "failed";
  status: string | null;
  error: string | null;
}

/** Create every template that does not exist on the account yet. Existing ones are left alone. */
export async function createMissingTemplates(supabase: SupabaseClient): Promise<ActionResult<{ results: TemplateCreateOutcome[] }>> {
  const env = whatsAppAdminEnv();
  if (!env.accessToken) return { ok: false, error: "WHATSAPP_ACCESS_TOKEN is not set in Vercel." };
  const token = await debugToken(env);
  const discovery = await discoverWabaId(env, token.ok ? token.data : null);
  if (!discovery.wabaId) {
    return { ok: false, error: `WhatsApp Business Account not found (${discovery.notes.join("; ")}). Set WHATSAPP_BUSINESS_ACCOUNT_ID.` };
  }

  const definitions = await allTemplateDefinitions(supabase);
  const existing = await listTemplates(discovery.wabaId, Array.from(new Set(definitions.map((d) => d.name))), env);
  if (!existing.ok) return { ok: false, error: existing.error };

  const results: TemplateCreateOutcome[] = [];
  for (const def of definitions) {
    const match = existing.data.find((t) => t.name === def.name && t.language === def.language);
    if (match) {
      results.push({ name: def.name, language: def.language, action: "unchanged", status: match.status, error: null });
      continue;
    }
    if (def.manual) {
      results.push({ name: def.name, language: def.language, action: "manual", status: null, error: def.manual });
      continue;
    }
    if (def.issues.length > 0) {
      results.push({ name: def.name, language: def.language, action: "failed", status: null, error: def.issues.join("; ") });
      continue;
    }
    const r = await createTemplate(discovery.wabaId, def, env);
    results.push(
      r.ok
        ? { name: def.name, language: def.language, action: "created", status: r.data.status ?? "PENDING", error: null }
        : { name: def.name, language: def.language, action: "failed", status: null, error: r.error }
    );
  }
  return { ok: true, data: { results } };
}
