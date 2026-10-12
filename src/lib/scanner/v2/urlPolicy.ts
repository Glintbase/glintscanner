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
  'instance-data',
  '0.0.0.0',
  '::1',
  '::',
]);

/**
 * Parses any valid IPv4 representation (dotted, hex, octal, integer, shortened)
 * into an unsigned 32-bit integer, or returns null if not an IPv4 address.
 */
function parseIpv4ToNumber(host: string): number | null {
  const parts = host.split('.');
  if (parts.length > 4 || parts.length === 0) return null;

  const numbers: number[] = [];
  for (const part of parts) {
    let num: number;
    if (/^0x[0-9a-f]+$/i.test(part)) {
      num = parseInt(part, 16);
    } else if (/^0[0-7]+$/.test(part) && part.length > 1) {
      num = parseInt(part, 8);
    } else if (/^\d+$/.test(part)) {
      num = parseInt(part, 10);
    } else {
      return null;
    }
    if (isNaN(num) || num < 0) return null;
    numbers.push(num);
  }

  let intVal = 0;
  if (numbers.length === 1) {
    if (numbers[0] > 0xffffffff) return null;
    intVal = numbers[0];
  } else if (numbers.length === 2) {
    if (numbers[0] > 0xff || numbers[1] > 0xffffff) return null;
    intVal = ((numbers[0] << 24) >>> 0) + numbers[1];
  } else if (numbers.length === 3) {
    if (numbers[0] > 0xff || numbers[1] > 0xff || numbers[2] > 0xffff) return null;
    intVal = ((numbers[0] << 24) >>> 0) + (numbers[1] << 16) + numbers[2];
  } else if (numbers.length === 4) {
    if (numbers.some((n) => n > 0xff)) return null;
    intVal = ((numbers[0] << 24) >>> 0) + (numbers[1] << 16) + (numbers[2] << 8) + numbers[3];
  }
  return intVal >>> 0;
}

function isPrivateOrReservedIpv4(intVal: number): boolean {
  const a = (intVal >>> 24) & 0xff;
  const b = (intVal >>> 16) & 0xff;
  const c = (intVal >>> 8) & 0xff;

  if (a === 0) return true; // 0.0.0.0/8 (This host on this network)
  if (a === 10) return true; // 10.0.0.0/8 (Private-Use)
  if (a === 127) return true; // 127.0.0.0/8 (Loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (Link-Local / Cloud Metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (Private-Use)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (Private-Use)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (Shared Address Space / CGNAT)
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 (TEST-NET-1)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 (TEST-NET-3)
  if (a >= 224 && a <= 239) return true; // 224.0.0.0/4 (Multicast)
  if (a >= 240) return true; // 240.0.0.0/4 (Reserved / Future Use / Broadcast)

  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === 'metadata.google.internal' || h === 'instance-data') return true;

  // Check IPv4 representations (standard, hex, octal, single integer, shortened)
  const ipv4Int = parseIpv4ToNumber(h);
  if (ipv4Int !== null) {
    return isPrivateOrReservedIpv4(ipv4Int);
  }

  // IPv6 bracketed checks
  if (h.startsWith('[') && h.endsWith(']')) {
    const inner = h.slice(1, -1).toLowerCase();
    if (inner === '::1' || inner === '::') return true;
    if (inner.startsWith('fe80:') || inner.startsWith('fc') || inner.startsWith('fd')) return true;
    if (inner.startsWith('2001:db8:')) return true;

    // IPv4-mapped IPv6 [::ffff:127.0.0.1]
    if (inner.startsWith('::ffff:')) {
      const mapped = inner.slice(7);
      const mappedInt = parseIpv4ToNumber(mapped);
      if (mappedInt !== null) {
        return isPrivateOrReservedIpv4(mappedInt);
      }
      return true;
    }
  }

  // IPv6 unbracketed loopback forms
  if (h === '::1' || h.includes('::1') || h === '::') return true;

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

  const cleanRaw = raw.replace(/^(https?:\/\/)+/gi, '');
  let withScheme = `https://${cleanRaw}`;
  if (/^http:\/\//i.test(raw)) {
    withScheme = `http://${cleanRaw}`;
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

  if (isBlockedHostname(parsed.hostname)) {
    return {
      ok: false,
      code: 'SSRF_BLOCKED',
      message: 'Target host is blocked (private, loopback, or metadata address)',
    };
  }

  const isIpv6 = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']');
  if (!parsed.hostname || (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost' && !isIpv6)) {
    return {
      ok: false,
      code: 'INVALID_URL',
      message: `Invalid target domain "${parsed.hostname || ''}". Please provide a valid domain name (e.g. yourproduct.com).`,
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
