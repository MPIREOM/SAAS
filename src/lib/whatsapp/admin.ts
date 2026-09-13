import "server-only";

// Meta Graph API *management* calls behind the WhatsApp setup page: token
// inspection, phone number status, WhatsApp Business Account (WABA)
// discovery, webhook subscriptions and message templates. Sending lives in
// client.ts; nothing here messages a tenant.
//
// Every call returns a GraphResult instead of throwing so the setup page can
// render partial state (token valid but templates forbidden, and so on).

export const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface GraphFailure {
  ok: false;
  error: string;
  code: number | null;
  status: number | null;
}
export type GraphResult<T> = { ok: true; data: T } | GraphFailure;

interface GraphErrorBody {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_user_msg?: string;
    error_user_title?: string;
  };
}

function fail(error: string, code: number | null = null, status: number | null = null): GraphFailure {
  return { ok: false, error, code, status };
}

async function graph<T>(
  path: string,
  init: { token: string; method?: "GET" | "POST"; query?: Record<string, string>; json?: unknown }
): Promise<GraphResult<T>> {
  const url = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${init.token}`,
        ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
    if (!res.ok || data?.error) {
      const e = data?.error;
      const message = e?.error_user_msg ?? e?.message ?? `Meta API error (HTTP ${res.status})`;
      return fail(e?.code ? `(#${e.code}) ${message}` : message, e?.code ?? null, res.status);
    }
    return { ok: true, data };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Network error");
  }
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export interface WhatsAppAdminEnv {
  accessToken: string | null;
  phoneNumberId: string | null;
  /** Optional: skips discovery when set. */
  businessAccountId: string | null;
  appSecret: string | null;
  verifyToken: string | null;
  /** Public base URL of this deployment, for the webhook callback. */
  appUrl: string | null;
}

function clean(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 && !t.includes("your_") ? t : null;
}

export function whatsAppAdminEnv(): WhatsAppAdminEnv {
  return {
    accessToken: clean(process.env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberId: clean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    businessAccountId: clean(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID),
    appSecret: clean(process.env.WHATSAPP_APP_SECRET),
    verifyToken: clean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
    appUrl: clean(process.env.NEXT_PUBLIC_APP_URL)?.replace(/\/+$/, "") ?? null,
  };
}

function needToken(env: WhatsAppAdminEnv): GraphFailure | null {
  return env.accessToken ? null : fail("WHATSAPP_ACCESS_TOKEN is not set");
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

export interface TokenInfo {
  appId: string | null;
  type: string | null;
  /** Unix seconds; 0 = never expires (system-user tokens). */
  expiresAt: number | null;
  isValid: boolean;
  scopes: string[];
  /** WABA ids granted to the token (granular scopes). */
  wabaIds: string[];
}

export async function debugToken(env: WhatsAppAdminEnv): Promise<GraphResult<TokenInfo>> {
  const missing = needToken(env);
  if (missing) return missing;
  const r = await graph<{
    data?: {
      app_id?: string;
      type?: string;
      expires_at?: number;
      is_valid?: boolean;
      scopes?: string[];
      granular_scopes?: { scope?: string; target_ids?: string[] }[];
    };
  }>("debug_token", { token: env.accessToken!, query: { input_token: env.accessToken! } });
  if (!r.ok) return r;
  const d = r.data.data ?? {};
  const wabaIds = new Set<string>();
  for (const g of d.granular_scopes ?? []) {
    if (g.scope === "whatsapp_business_management" || g.scope === "whatsapp_business_messaging") {
      for (const id of g.target_ids ?? []) wabaIds.add(String(id));
    }
  }
  return {
    ok: true,
    data: {
      appId: d.app_id ? String(d.app_id) : null,
      type: d.type ?? null,
      expiresAt: typeof d.expires_at === "number" ? d.expires_at : null,
      isValid: Boolean(d.is_valid),
      scopes: d.scopes ?? [],
      wabaIds: Array.from(wabaIds),
    },
  };
}

// ---------------------------------------------------------------------------
// Phone number
// ---------------------------------------------------------------------------

export interface PhoneNumberInfo {
  id: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  /** CONNECTED, PENDING, FLAGGED, RESTRICTED, BANNED, ... */
  status: string | null;
  qualityRating: string | null;
  nameStatus: string | null;
  /** CLOUD_API, ON_PREMISE, NOT_APPLICABLE */
  platformType: string | null;
  messagingLimit: string | null;
}

export async function getPhoneNumber(env: WhatsAppAdminEnv): Promise<GraphResult<PhoneNumberInfo>> {
  const missing = needToken(env);
  if (missing) return missing;
  if (!env.phoneNumberId) return fail("WHATSAPP_PHONE_NUMBER_ID is not set");
  const r = await graph<{
    id?: string;
    display_phone_number?: string;
    verified_name?: string;
    status?: string;
    quality_rating?: string;
    name_status?: string;
    platform_type?: string;
    messaging_limit_tier?: string;
  }>(env.phoneNumberId, {
    token: env.accessToken!,
    query: {
      fields: "display_phone_number,verified_name,status,quality_rating,name_status,platform_type,messaging_limit_tier",
    },
  });
  if (!r.ok) return r;
  return {
    ok: true,
    data: {
      id: r.data.id ?? env.phoneNumberId,
      displayPhoneNumber: r.data.display_phone_number ?? null,
      verifiedName: r.data.verified_name ?? null,
      status: r.data.status ?? null,
      qualityRating: r.data.quality_rating ?? null,
      nameStatus: r.data.name_status ?? null,
      platformType: r.data.platform_type ?? null,
      messagingLimit: r.data.messaging_limit_tier ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// WhatsApp Business Account discovery
// ---------------------------------------------------------------------------

export interface WabaDiscovery {
  wabaId: string | null;
  notes: string[];
}

/**
 * The WABA that owns the configured phone number: WHATSAPP_BUSINESS_ACCOUNT_ID
 * when set, otherwise every WABA the token can see (granular scopes, then the
 * business portfolios it lists) checked for the phone number.
 */
export async function discoverWabaId(env: WhatsAppAdminEnv, token: TokenInfo | null): Promise<WabaDiscovery> {
  if (env.businessAccountId) return { wabaId: env.businessAccountId, notes: ["from WHATSAPP_BUSINESS_ACCOUNT_ID"] };
  if (!env.accessToken) return { wabaId: null, notes: ["no access token"] };
  const notes: string[] = [];
  const candidates = new Set<string>(token?.wabaIds ?? []);
  notes.push(`token scopes: ${candidates.size} account(s)`);

  const biz = await graph<{ data?: { id?: string }[] }>("me/businesses", {
    token: env.accessToken,
    query: { fields: "id", limit: "50" },
  });
  if (biz.ok) {
    for (const b of biz.data.data ?? []) {
      if (!b.id) continue;
      for (const edge of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
        const r = await graph<{ data?: { id?: string }[] }>(`${b.id}/${edge}`, {
          token: env.accessToken,
          query: { fields: "id", limit: "100" },
        });
        if (r.ok) for (const w of r.data.data ?? []) if (w.id) candidates.add(String(w.id));
      }
    }
    notes.push(`business portfolios: ${(biz.data.data ?? []).length}`);
  } else {
    notes.push(`business portfolios: ${biz.error}`);
  }

  const list = Array.from(candidates);
  for (const waba of list) {
    const r = await graph<{ data?: { id?: string }[] }>(`${waba}/phone_numbers`, {
      token: env.accessToken,
      query: { fields: "id", limit: "100" },
    });
    if (r.ok && (r.data.data ?? []).some((p) => String(p.id) === env.phoneNumberId)) {
      return { wabaId: waba, notes: [...notes, `${waba} owns the phone number`] };
    }
  }
  if (list.length === 1) return { wabaId: list[0], notes: [...notes, "single candidate accepted"] };
  notes.push(list.length === 0 ? "no account found" : `${list.length} candidates, none lists the phone number`);
  return { wabaId: null, notes };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export interface SubscribedApp {
  id: string | null;
  name: string | null;
  overrideCallbackUri: string | null;
}

/** Apps subscribed to the WABA — the app must be here or it receives nothing. */
export async function getWabaSubscribedApps(wabaId: string, env: WhatsAppAdminEnv): Promise<GraphResult<SubscribedApp[]>> {
  const missing = needToken(env);
  if (missing) return missing;
  const r = await graph<{
    data?: { whatsapp_business_api_data?: { id?: string; name?: string }; override_callback_uri?: string }[];
  }>(`${wabaId}/subscribed_apps`, { token: env.accessToken! });
  if (!r.ok) return r;
  return {
    ok: true,
    data: (r.data.data ?? []).map((a) => ({
      id: a.whatsapp_business_api_data?.id ? String(a.whatsapp_business_api_data.id) : null,
      name: a.whatsapp_business_api_data?.name ?? null,
      overrideCallbackUri: a.override_callback_uri ?? null,
    })),
  };
}

/** Subscribe the token's app to the WABA (idempotent). No callback override: events go to the app-level callback. */
export async function subscribeAppToWaba(wabaId: string, env: WhatsAppAdminEnv): Promise<GraphResult<{ success: boolean }>> {
  const missing = needToken(env);
  if (missing) return missing;
  const r = await graph<{ success?: boolean }>(`${wabaId}/subscribed_apps`, { token: env.accessToken!, method: "POST" });
  if (!r.ok) return r;
  return { ok: true, data: { success: Boolean(r.data.success) } };
}

export interface AppSubscription {
  object: string | null;
  callbackUrl: string | null;
  active: boolean;
  fields: string[];
}

/** App-level webhook configuration (what the Meta app dashboard shows). Needs the app secret. */
export async function getAppSubscriptions(appId: string, env: WhatsAppAdminEnv): Promise<GraphResult<AppSubscription[]>> {
  if (!env.appSecret) return fail("WHATSAPP_APP_SECRET is not set");
  const r = await graph<{
    data?: { object?: string; callback_url?: string; active?: boolean; fields?: { name?: string }[] }[];
  }>(`${appId}/subscriptions`, { token: `${appId}|${env.appSecret}` });
  if (!r.ok) return r;
  return {
    ok: true,
    data: (r.data.data ?? []).map((s) => ({
      object: s.object ?? null,
      callbackUrl: s.callback_url ?? null,
      active: Boolean(s.active),
      fields: (s.fields ?? []).map((f) => f.name ?? "").filter(Boolean),
    })),
  };
}

/** Fields the SAAS webhook route handles. */
export const WEBHOOK_FIELDS = ["messages", "account_update", "account_alerts", "phone_number_quality_update"] as const;

/**
 * Point the app's whatsapp_business_account webhook at `callbackUrl`. Meta
 * verifies the URL synchronously with a GET carrying the verify token, so
 * the deployment must already be live and configured.
 */
export async function setAppSubscription(
  appId: string,
  callbackUrl: string,
  verifyToken: string,
  env: WhatsAppAdminEnv
): Promise<GraphResult<{ success: boolean }>> {
  if (!env.appSecret) return fail("WHATSAPP_APP_SECRET is not set");
  const r = await graph<{ success?: boolean }>(`${appId}/subscriptions`, {
    token: `${appId}|${env.appSecret}`,
    method: "POST",
    json: {
      object: "whatsapp_business_account",
      callback_url: callbackUrl,
      verify_token: verifyToken,
      fields: [...WEBHOOK_FIELDS],
      include_values: true,
    },
  });
  if (!r.ok) return r;
  return { ok: true, data: { success: Boolean(r.data.success) } };
}

// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------

export interface TemplateStatus {
  id: string | null;
  name: string;
  language: string;
  status: string;
  category: string | null;
  rejectedReason: string | null;
}

export async function listTemplates(
  wabaId: string,
  names: readonly string[],
  env: WhatsAppAdminEnv
): Promise<GraphResult<TemplateStatus[]>> {
  const missing = needToken(env);
  if (missing) return missing;
  const wanted = new Set(names);
  const out: TemplateStatus[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const r = await graph<{
      data?: { id?: string; name?: string; language?: string; status?: string; category?: string; rejected_reason?: string }[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`${wabaId}/message_templates`, {
      token: env.accessToken!,
      query: { fields: "id,name,language,status,category,rejected_reason", limit: "100", ...(after ? { after } : {}) },
    });
    if (!r.ok) return r;
    for (const t of r.data.data ?? []) {
      if (!t.name || !wanted.has(t.name)) continue;
      out.push({
        id: t.id ?? null,
        name: t.name,
        language: t.language ?? "",
        status: t.status ?? "UNKNOWN",
        category: t.category ?? null,
        rejectedReason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
      });
    }
    if (!r.data.paging?.next || !r.data.paging.cursors?.after) break;
    after = r.data.paging.cursors.after;
  }
  return { ok: true, data: out };
}

export type TemplateComponent =
  | { type: "HEADER"; format: "TEXT"; text: string }
  | { type: "BODY"; text: string; example?: { body_text: string[][] } }
  | { type: "FOOTER"; text: string };

export interface TemplateCreateInput {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  components: TemplateComponent[];
}

export async function createTemplate(
  wabaId: string,
  input: TemplateCreateInput,
  env: WhatsAppAdminEnv
): Promise<GraphResult<{ id: string | null; status: string | null; category: string | null }>> {
  const missing = needToken(env);
  if (missing) return missing;
  const r = await graph<{ id?: string; status?: string; category?: string }>(`${wabaId}/message_templates`, {
    token: env.accessToken!,
    method: "POST",
    json: {
      name: input.name,
      language: input.language,
      category: input.category,
      // Let Meta re-categorise instead of rejecting outright.
      allow_category_change: true,
      components: input.components,
    },
  });
  if (!r.ok) return r;
  return { ok: true, data: { id: r.data.id ?? null, status: r.data.status ?? null, category: r.data.category ?? null } };
}
