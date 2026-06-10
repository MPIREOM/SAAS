import crypto from "crypto";

/**
 * Constant-time string comparison.
 *
 * `crypto.timingSafeEqual` throws if the two buffers differ in length, which
 * (a) leaks length via the thrown error / 500 response and (b) can crash a
 * route when an attacker sends a short value. We guard the length explicitly
 * and only call timingSafeEqual on equal-length buffers, returning false
 * otherwise without short-circuiting on content.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Validate an `Authorization: Bearer <secret>` header against an expected
 * secret in constant time. Returns false if the secret is unset or the header
 * is missing/malformed.
 */
export function checkBearer(
  authHeader: string | null,
  expectedSecret: string | undefined
): boolean {
  if (!expectedSecret || !authHeader) return false;
  return safeEqual(authHeader, `Bearer ${expectedSecret}`);
}
