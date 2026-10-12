/**
 * Shared CLI target URL handling: normalise user input, then apply the scanner's
 * URL policy (SSRF guards) before any probe runs. Invalid -> exit code 2, like `scan`.
 */

import pc from 'picocolors';
import { normalizeUrl } from '@scanner/shared/url';
import { validateScanUrl } from '@scanner/v2/urlPolicy';

export function resolveCliTarget(raw: string): { ok: true; url: string } | { ok: false; message: string } {
  const normalized = normalizeUrl(raw || '');
  if (!normalized) return { ok: false, message: 'A target URL is required' };
  const policy = validateScanUrl(normalized);
  if (!policy.ok || !policy.url) return { ok: false, message: policy.message || 'Invalid URL' };
  return { ok: true, url: policy.url };
}

/** Resolves the target or prints the policy error and exits with code 2. */
export function requireCliTarget(raw: string): string {
  const target = resolveCliTarget(raw);
  if (!target.ok) {
    console.error(pc.red(`\n  Invalid URL: ${target.message}\n`));
    process.exit(2);
  }
  return target.url;
}
