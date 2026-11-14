/**
 * Client IP for rate limiting, read from the header the hosting platform controls.
 *
 * Which header that is depends on the host, and a header that is trustworthy on one host
 * is plain client input on another, so the choice is made per platform:
 *
 * - Render sits behind Cloudflare, which overwrites `CF-Connecting-IP` on every request.
 *   There the first `X-Forwarded-For` hop (and `X-Vercel-Forwarded-For`) is whatever the
 *   caller sent, so a caller could pick a fresh rate-limit bucket per request.
 * - Vercel sets `X-Vercel-Forwarded-For` itself; `CF-Connecting-IP` would be client input.
 */
export function platformClientIp(headers: Headers): string | null {
  if (process.env.RENDER) {
    const cf = headers.get('cf-connecting-ip')?.trim();
    if (cf) return cf;
  }
  const forwarded =
    headers.get('x-vercel-forwarded-for') ||
    headers.get('x-real-ip') ||
    headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || null;
}
