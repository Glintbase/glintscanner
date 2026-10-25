import { createHmac, timingSafeEqual } from 'crypto';

/** Requests older or newer than this are rejected (replay window). */
export const INTERNAL_SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;

/** HMAC-SHA256 over `${timestamp}.${body}`, hex-encoded. */
export function signInternalRequest(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/**
 * Verifies an internal request signed by a holder of `secret` (the Supabase service role key,
 * which the scanner deployment and the operator's machine both have). The key itself is never
 * sent over the wire.
 */
export function verifyInternalRequest(
  secret: string | undefined,
  timestamp: string | null,
  signature: string | null,
  body: string,
  now = Date.now()
): boolean {
  if (!secret || !timestamp || !signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > INTERNAL_SIGNATURE_MAX_SKEW_MS) return false;
  const expected = Buffer.from(signInternalRequest(secret, timestamp, body), 'hex');
  const given = Buffer.from(signature, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
