// Client-safe phone helpers for visit bookings (049).

/**
 * Normalise a phone number typed by a tenant to international digits
 * ("96891234567"); bare 8-digit numbers are Omani. Returns null when it
 * can't be a phone number. Not checked against the unit's lease (049).
 */
export function normalizeContactPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "").replace(/^00/, "");
  if (digits.length === 8) return `968${digits}`;
  return digits.length >= 9 && digits.length <= 15 ? digits : null;
}

/** Display form of a stored contact phone: "+96891234567". */
export function displayPhone(phone: string): string {
  return /^\d{9,15}$/.test(phone) ? `+${phone}` : phone;
}
