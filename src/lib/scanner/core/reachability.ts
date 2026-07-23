/**
 * Standalone URL reachability check (Phase 0 — MCP + CLI shared utility).
 * Quick single-URL probe: validates policy, fetches, detects soft-404s,
 * classifies content type. No session state required.
 */

import { validateScanUrl } from '../v2/urlPolicy';

export interface ReachabilityResult {
  url: string;
  reachable: boolean;
  statusCode: number | null;
  latencyMs: number;
  contentType: string | null;
  isSoft404: boolean;
  /** json, xml, txt, markdown content types are machine-readable */
  isMachineReadable: boolean;
  contentLength: number;
  error?: string;
}

const MACHINE_READABLE_TYPES = [
  'application/json',
  'application/xml',
  'text/xml',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/x-yaml',
  'text/yaml',
  'application/yaml',
];

const SOFT_404_SIGNALS = [
  'page not found',
  '404 not found',
  "doesn't exist",
  'does not exist',
  'cannot be found',
  'nothing here',
  'error 404',
];

function detectSoft404(body: string, httpStatus: number): boolean {
  if (httpStatus === 404) return true;
  if (httpStatus >= 400) return false; // handled as unreachable
  const lower = body.slice(0, 4000).toLowerCase();
  if (body.length < 200) return true; // suspiciously short for a 200
  if (body.length < 8000 && SOFT_404_SIGNALS.some((s) => lower.includes(s))) {
    if (lower.includes('<html') || lower.includes('<!doctype')) return true;
  }
  return false;
}

function classifyMachineReadable(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase().split(';')[0].trim();
  return MACHINE_READABLE_TYPES.some((t) => ct.includes(t));
}

/**
 * Quick reachability probe for a single URL.
 * Performs a GET with 8s timeout, reads up to 64KB for soft-404 detection.
 */
export async function checkReachability(url: string): Promise<ReachabilityResult> {
  const base: ReachabilityResult = {
    url,
    reachable: false,
    statusCode: null,
    latencyMs: 0,
    contentType: null,
    isSoft404: false,
    isMachineReadable: false,
    contentLength: 0,
  };

  // Validate URL policy first
  const policy = validateScanUrl(url, { allowHttp: true });
  if (!policy.ok || !policy.url) {
    return { ...base, error: policy.message || 'URL policy rejected' };
  }

  const safeUrl = policy.url;
  const start = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(safeUrl, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Glintscanner-V2/2.0)',
        Accept: '*/*',
      },
    });

    const latencyMs = Date.now() - start;
    const statusCode = res.status;
    const contentType = res.headers.get('content-type');

    // Non-success status
    if (statusCode >= 400) {
      return {
        ...base,
        url: safeUrl,
        statusCode,
        latencyMs,
        contentType,
        isSoft404: statusCode === 404,
        error: statusCode === 404 ? 'Not found (404)' : `HTTP ${statusCode}`,
      };
    }

    // Read body (up to 64KB) for soft-404 detection
    let body = '';
    try {
      const text = await res.text();
      body = text.slice(0, 65536);
    } catch {
      // body read failed — treat as reachable but unknown content
    }

    const isSoft404 = detectSoft404(body, statusCode);
    const contentLength = body.length;

    return {
      url: safeUrl,
      reachable: !isSoft404,
      statusCode,
      latencyMs,
      contentType,
      isSoft404,
      isMachineReadable: classifyMachineReadable(contentType),
      contentLength,
      error: isSoft404 ? 'Soft 404 detected (page returns 200 but content indicates not found)' : undefined,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const isTimeout = err?.name === 'AbortError';
    return {
      ...base,
      url: safeUrl,
      latencyMs,
      error: isTimeout ? 'Timeout (8s)' : `Fetch failed: ${err?.message || 'Unknown error'}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
