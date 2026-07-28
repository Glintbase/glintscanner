/**
 * Lead capture helpers (email gate after scans).
 * Pure validation logic — no Next.js / Supabase imports so it stays testable.
 */

/** RFC-5321 practical cap on address length. */
export const MAX_EMAIL_LENGTH = 254;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface LeadEmailResult {
  ok: boolean;
  /** Normalized (trimmed, lowercased) email when ok. */
  email?: string;
  error?: string;
}

/** Normalize + validate a lead email. Returns the canonical form on success. */
export function validateLeadEmail(input: unknown): LeadEmailResult {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Email is required.' };
  }
  const email = input.trim().toLowerCase();
  if (!email) {
    return { ok: false, error: 'Email is required.' };
  }
  if (email.length > MAX_EMAIL_LENGTH) {
    return { ok: false, error: 'Email is too long.' };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  return { ok: true, email };
}
