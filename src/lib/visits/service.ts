import { randomBytes } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TenantRecipient } from "@/lib/maintenance/whatsapp";
import { generateSlots, isBeforeCutoff, slotKey, type VisitWindow } from "./slots";

// Server-side helpers shared by the public booking routes, the staff routes
// and the reminder cron. Callers pass the Supabase client: the service role
// for public routes / cron, the user's RLS client for staff routes.

/** Service-role client for the public booking pages and the cron (bypasses RLS). */
export function createVisitsAdminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export const MAX_VERIFY_FAILURES = 5;
const VERIFY_LOCK_MINUTES = 60;

export interface VisitCampaign extends VisitWindow {
  id: string;
  property_id: string;
  title: string;
  notes: string | null;
  token: string;
  status: "open" | "closed";
  public_origin: string | null;
  created_at: string;
}

export interface VisitCampaignWithProperty extends VisitCampaign {
  property_name: string;
}

export interface OccupiedUnit {
  unit_id: string;
  unit_number: string;
  tenant: (TenantRecipient & { id: string }) | null;
}

export const CAMPAIGN_COLUMNS =
  "id, property_id, title, notes, start_date, end_date, day_start, day_end, slot_minutes, token, status, public_origin, created_at";

export function newVisitToken(): string {
  return randomBytes(16).toString("base64url");
}

export function compareUnitNumbers(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

/** Last 4 digits of a phone number, or null if it has fewer than 4. */
export function phoneLast4(phone: string | null | undefined): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** True once a visit's last day is over in Muscat (bookings no longer make sense). */
export function isVisitOver(campaign: Pick<VisitCampaign, "end_date">, now: Date = new Date()): boolean {
  const muscatToday = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return campaign.end_date < muscatToday;
}

function withPropertyName(row: Record<string, unknown>): VisitCampaignWithProperty {
  const property = row.properties as { name?: string } | null;
  const { properties: _ignored, ...rest } = row;
  void _ignored;
  return { ...(rest as unknown as VisitCampaign), property_name: property?.name ?? "" };
}

export async function getCampaignByToken(
  db: SupabaseClient,
  token: string
): Promise<VisitCampaignWithProperty | null> {
  const { data } = await db
    .from("visit_campaigns")
    .select(`${CAMPAIGN_COLUMNS}, properties(name)`)
    .eq("token", token)
    .maybeSingle();
  return data ? withPropertyName(data as Record<string, unknown>) : null;
}

export async function getCampaignById(
  db: SupabaseClient,
  id: string
): Promise<VisitCampaignWithProperty | null> {
  const { data } = await db
    .from("visit_campaigns")
    .select(`${CAMPAIGN_COLUMNS}, properties(name)`)
    .eq("id", id)
    .maybeSingle();
  return data ? withPropertyName(data as Record<string, unknown>) : null;
}

/** Units of a property with their current tenant (null for vacant units), sorted by unit number. */
export async function getPropertyUnits(db: SupabaseClient, propertyId: string): Promise<OccupiedUnit[]> {
  const { data, error } = await db
    .from("units")
    .select(
      "id, unit_number, leases(is_active, start_date, tenants(id, full_name, phone, language_preference, notifications_enabled))"
    )
    .eq("property_id", propertyId);
  if (error) throw new Error(error.message);

  return ((data || []) as Record<string, unknown>[])
    .map((u) => {
      const leases = ((u.leases as Record<string, unknown>[]) || [])
        .filter((l) => l.is_active === true)
        .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
      const tenant = (leases[0]?.tenants as (TenantRecipient & { id: string }) | null) ?? null;
      return { unit_id: u.id as string, unit_number: u.unit_number as string, tenant };
    })
    .sort((a, b) => compareUnitNumbers(a.unit_number, b.unit_number));
}

/** Slot keys already taken by live bookings, optionally ignoring one booking. */
export async function getTakenSlots(
  db: SupabaseClient,
  campaignId: string,
  exceptBookingId?: string
): Promise<Set<string>> {
  const { data, error } = await db
    .from("visit_bookings")
    .select("id, slot_start")
    .eq("campaign_id", campaignId)
    .eq("status", "booked");
  if (error) throw new Error(error.message);
  return new Set(
    ((data || []) as { id: string; slot_start: string }[])
      .filter((b) => b.id !== exceptBookingId)
      .map((b) => slotKey(b.slot_start))
  );
}

export interface SlotOption {
  start: string;
  available: boolean;
}

/** Every slot of the visit, marked unavailable when taken or past the tenant cutoff. */
export function slotOptions(campaign: VisitWindow, taken: Set<string>, now: Date = new Date()): SlotOption[] {
  return generateSlots(campaign).map((start) => ({
    start,
    available: !taken.has(start) && isBeforeCutoff(start, now),
  }));
}

/** True if this unit has hit the wrong-digits limit for this visit. */
export async function isVerificationLocked(
  db: SupabaseClient,
  campaignId: string,
  unitId: string
): Promise<boolean> {
  const since = new Date(Date.now() - VERIFY_LOCK_MINUTES * 60 * 1000).toISOString();
  const { count } = await db
    .from("visit_verification_failures")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("unit_id", unitId)
    .gte("created_at", since);
  return (count ?? 0) >= MAX_VERIFY_FAILURES;
}

export async function recordVerificationFailure(
  db: SupabaseClient,
  campaignId: string,
  unitId: string
): Promise<void> {
  await db.from("visit_verification_failures").insert({ campaign_id: campaignId, unit_id: unitId });
}

/** Postgres unique-violation code: the slot (or unit) was taken by a concurrent booking. */
export function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/** Which partial unique index a 23505 came from: the unit already has a booking, or the slot is taken. */
export function uniqueViolationKind(error: { message?: string; details?: string }): "unit" | "slot" {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  return text.includes("idx_visit_bookings_unit_unique") ? "unit" : "slot";
}
