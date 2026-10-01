// Slot maths for building-wide visits (see supabase/migrations/046).
//
// A visit runs every day from start_date to end_date, between day_start and
// day_end Muscat time, cut into slot_minutes-long slots with one apartment
// per slot. Oman has no DST, so a fixed +04:00 offset is exact. Slots are
// identified by their UTC ISO start (what visit_bookings.slot_start stores).

export const MUSCAT_TZ = "Asia/Muscat";
const MUSCAT_OFFSET = "+04:00";

/** Tenants can't book, move or cancel a slot that starts within this window. */
export const TENANT_CUTOFF_MINUTES = 60;

/** Guards against a typo (e.g. a year-long range) generating huge slot lists. */
export const MAX_VISIT_DAYS = 31;
export const MAX_VISIT_SLOTS = 2000;

export interface VisitWindow {
  start_date: string; // YYYY-MM-DD
  end_date: string;
  day_start: string; // HH:MM or HH:MM:SS
  day_end: string;
  slot_minutes: number;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function hhmm(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/** Every date (YYYY-MM-DD) the visit runs on. */
export function visitDates(w: Pick<VisitWindow, "start_date" | "end_date">): string[] {
  const dates: string[] = [];
  const end = new Date(`${w.end_date}T00:00:00Z`).getTime();
  for (
    let d = new Date(`${w.start_date}T00:00:00Z`);
    d.getTime() <= end && dates.length <= MAX_VISIT_DAYS;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** Start of every slot, as UTC ISO strings, in chronological order. */
export function generateSlots(w: VisitWindow): string[] {
  const from = minutesOf(w.day_start);
  const to = minutesOf(w.day_end);
  const step = w.slot_minutes;
  if (!(step > 0) || to <= from) return [];
  const slots: string[] = [];
  for (const date of visitDates(w)) {
    for (let m = from; m + step <= to; m += step) {
      slots.push(new Date(`${date}T${hhmm(m)}:00${MUSCAT_OFFSET}`).toISOString());
    }
  }
  return slots;
}

/** Slots that haven't started yet and aren't in `taken` (staff booking list). */
export function upcomingFreeSlots(w: VisitWindow, taken: Set<string>, now: Date = new Date()): string[] {
  return generateSlots(w).filter((s) => !taken.has(s) && new Date(s).getTime() > now.getTime());
}

/** Normalise any timestamp string (e.g. Postgres "+00:00" form) to a slot key. */
export function slotKey(timestamp: string): string {
  return new Date(timestamp).toISOString();
}

/** Muscat calendar date (YYYY-MM-DD) of an instant. */
export function muscatDate(instant: Date | string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Date(d.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** True while a tenant may still book / move / cancel this slot. */
export function isBeforeCutoff(slotStart: string, now: Date = new Date()): boolean {
  return new Date(slotStart).getTime() - now.getTime() >= TENANT_CUTOFF_MINUTES * 60 * 1000;
}

/** Validate a staff-entered window; returns an error key or null. */
export function validateWindow(w: VisitWindow): "range" | "time" | "tooManyDays" | "tooManySlots" | null {
  if (w.end_date < w.start_date) return "range";
  if (minutesOf(w.day_end) - minutesOf(w.day_start) < w.slot_minutes) return "time";
  if (visitDates(w).length > MAX_VISIT_DAYS) return "tooManyDays";
  if (generateSlots(w).length > MAX_VISIT_SLOTS) return "tooManySlots";
  return null;
}

function intlLocale(locale: string): string {
  return locale === "ar" ? "ar-OM-u-nu-latn" : "en-GB";
}

/** "Sat 4 Oct" in Muscat time. */
export function formatVisitDay(dateOrInstant: string, locale: string): string {
  // Bare dates are pinned to Muscat noon so they never shift a day.
  const instant = /^\d{4}-\d{2}-\d{2}$/.test(dateOrInstant)
    ? new Date(`${dateOrInstant}T12:00:00${MUSCAT_OFFSET}`)
    : new Date(dateOrInstant);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: MUSCAT_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(instant);
}

/** "10:20" (24h) in Muscat time. */
export function formatSlotTime(instant: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: MUSCAT_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instant));
}

/** "Sat 4 Oct, 10:20–10:30" in Muscat time. */
export function formatSlotRange(instant: string, slotMinutes: number, locale: string): string {
  const end = new Date(new Date(instant).getTime() + slotMinutes * 60 * 1000).toISOString();
  const times = `${formatSlotTime(instant, locale)}–${formatSlotTime(end, locale)}`;
  // In Arabic the LTR time range is isolated (U+2066..U+2069) so the bidi
  // algorithm can't flip it to "end–start" inside right-to-left text.
  if (locale === "ar") return `${formatVisitDay(instant, locale)}، \u2066${times}\u2069`;
  return `${formatVisitDay(instant, locale)}, ${times}`;
}

/** "Sat 4 Oct – Mon 6 Oct" or a single day. */
export function formatVisitDates(w: Pick<VisitWindow, "start_date" | "end_date">, locale: string): string {
  const from = formatVisitDay(w.start_date, locale);
  return w.start_date === w.end_date ? from : `${from} – ${formatVisitDay(w.end_date, locale)}`;
}
