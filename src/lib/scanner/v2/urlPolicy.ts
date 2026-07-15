/**
 * URL policy + SSRF guards (SPEC-01).
 * Pure checks — no network DNS resolution (IP literals + hostname patterns).
 */

export type UrlPolicyCode =
  | 'OK'
  | 'EMPTY'
  | 'INVALID_URL'
  | 'SCHEME_NOT_ALLOWED'
  | 'CREDENTIALS_FORBIDDEN'
  | 'SSRF_BLOCKED'
  | 'PORT_NOT_ALLOWED';

export interface UrlPolicyResult {
  ok: boolean;
  code: UrlPolicyCode;
  message?: string;
  /** Normalized absolute URL when ok */
  url?: string;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  '0.0.0.0',
  '::1',
  '::',
]);

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === 'metadata.google.internal') return true;
  // IPv6 loopback / link-local compressed forms often appear as hostname
  if (h === '[::1]' || h.includes('::1')) return true;
  if (isPrivateIPv4(h)) return true;
  // Bracketed IPv6
  if (h.startsWith('[') && h.endsWith(']')) {
    const inner = h.slice(1, -1).toLowerCase();
    if (inner === '::1' || inner.startsWith('fe80:') || inner.startsWith('fc') || inner.startsWith('fd')) {
      return true;
    }
  }
  return false;
}

function allowedPort(protocol: string, port: string): boolean {
  if (!port) return true;
  const p = Number(port);
  if (protocol === 'https:' && (p === 443 || p === 8443)) return true;
  if (protocol === 'http:' && (p === 80 || p === 8080)) return true;
  // Disallow non-standard ports in production-style policy
  return false;
}

/**
 * Validate and normalize a scan target URL.
 * @param input raw user string
 * @param opts.allowHttp allow http in development (default: true when NODE_ENV !== production)
 */
export function validateScanUrl(
  input: string,
  opts: { allowHttp?: boolean } = {}
): UrlPolicyResult {
  const raw = (input || '').trim();
  if (!raw) {
    return { ok: false, code: 'EMPTY', message: 'URL is required' };
  }

  const allowHttp =
    opts.allowHttp ??
    (process.env.ALLOW_HTTP === 'true' || process.env.NODE_ENV !== 'production');

  let withScheme = raw;
  if (!/^https?:\/\//i.test(withScheme)) {
    withScheme = `https://${withScheme}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, code: 'INVALID_URL', message: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      ok: false,
      code: 'SCHEME_NOT_ALLOWED',
      message: 'Only http and https URLs are allowed',
    };
  }

  if (parsed.protocol === 'http:' && !allowHttp) {
    return {
      ok: false,
      code: 'SCHEME_NOT_ALLOWED',
      message: 'HTTPS is required in production',
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      code: 'CREDENTIALS_FORBIDDEN',
      message: 'URLs with embedded credentials are not allowed',
    };
  }

  if (!parsed.hostname) {
    return { ok: false, code: 'INVALID_URL', message: 'Hostname is required' };
  }

  if (isBlockedHostname(parsed.hostname)) {
    return {
      ok: false,
      code: 'SSRF_BLOCKED',
      message: 'Target host is blocked (private, loopback, or metadata address)',
    };
  }

  if (!allowedPort(parsed.protocol, parsed.port)) {
    return {
      ok: false,
      code: 'PORT_NOT_ALLOWED',
      message: 'Only standard HTTP/HTTPS ports are allowed',
    };
  }

  // Strip hash; keep path/query
  parsed.hash = '';
  return { ok: true, code: 'OK', url: parsed.toString() };
}

/** Map policy failure to stream/API error code */
export function policyToErrorCode(code: UrlPolicyCode): string {
  switch (code) {
    case 'SSRF_BLOCKED':
      return 'SSRF_BLOCKED';
    case 'EMPTY':
    case 'INVALID_URL':
    case 'SCHEME_NOT_ALLOWED':
    case 'CREDENTIALS_FORBIDDEN':
    case 'PORT_NOT_ALLOWED':
      return 'INVALID_URL';
    default:
      return 'INVALID_URL';
  }
}
