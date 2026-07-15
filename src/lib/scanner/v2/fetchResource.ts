/**
 * Centralized resource fetch (SPEC-01 / SPEC-03).
 * GET-first, size caps, timeouts, soft status taxonomy.
 * Applies URL policy SSRF guards before network I/O.
 */

import { validateScanUrl } from './urlPolicy';

export type FetchStatus =
  | 'ok'
  | 'unreachable'
  | 'timeout'
  | 'blocked'
  | 'soft_404'
  | 'empty'
  | 'too_large'
  | 'invalid_spec'
  | 'needs_render'
  | 'failed';

export interface FetchResourceOptions {
  timeoutMs?: number;
  maxBytes?: number;
  method?: 'GET' | 'HEAD';
  headers?: Record<string, string>;
  /** When true, do not download body (existence probe). Still uses GET by default. */
  probeOnly?: boolean;
}

export interface FetchResourceResult {
  ok: boolean;
  status: FetchStatus;
  httpStatus?: number;
  body?: string;
  contentType?: string | null;
  url: string;
  finalUrl?: string;
  bytes?: number;
}

const DEFAULT_UA = 'Mozilla/5.0 (compatible; Glintscanner-V2/2.0)';
const DEFAULT_TIMEOUT = 8000;
const DEFAULT_MAX_BYTES = 2_000_000;

function looksLikeSoft404(body: string, httpStatus: number): boolean {
  if (httpStatus === 404) return true;
  const lower = body.slice(0, 4000).toLowerCase();
  const softSignals = [
    'page not found',
    '404 not found',
    "doesn't exist",
    'does not exist',
    'cannot be found',
    'nothing here',
    'error 404',
  ];
  if (body.length < 8000 && softSignals.some((s) => lower.includes(s))) {
    if (lower.includes('<html') || lower.includes('<!doctype')) return true;
  }
  return false;
}

export async function fetchResource(
  url: string,
  options: FetchResourceOptions = {}
): Promise<FetchResourceResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const method = options.method ?? 'GET';

  const policy = validateScanUrl(url, { allowHttp: true });
  if (!policy.ok || !policy.url) {
    return { ok: false, status: 'blocked', url };
  }
  const safeUrl = policy.url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(safeUrl, {
      method,
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: '*/*',
        ...options.headers,
      },
    });

    const httpStatus = res.status;
    const contentType = res.headers.get('content-type');
    const exists =
      (httpStatus >= 200 && httpStatus < 400) || httpStatus === 401 || httpStatus === 403;

    if (!exists) {
      return {
        ok: false,
        status: httpStatus === 404 ? 'soft_404' : 'unreachable',
        httpStatus,
        contentType,
        url: safeUrl,
        finalUrl: res.url,
      };
    }

    if (options.probeOnly || method === 'HEAD') {
      return {
        ok: true,
        status: 'ok',
        httpStatus,
        contentType,
        url: safeUrl,
        finalUrl: res.url,
      };
    }

    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text().catch(() => '');
      if (text.length > maxBytes) {
        return {
          ok: false,
          status: 'too_large',
          httpStatus,
          contentType,
          url: safeUrl,
          finalUrl: res.url,
          bytes: text.length,
        };
      }
      if (!text.trim()) {
        return {
          ok: false,
          status: 'empty',
          httpStatus,
          contentType,
          url: safeUrl,
          finalUrl: res.url,
          body: text,
          bytes: 0,
        };
      }
      if (looksLikeSoft404(text, httpStatus)) {
        return {
          ok: false,
          status: 'soft_404',
          httpStatus,
          contentType,
          url: safeUrl,
          finalUrl: res.url,
          body: text.slice(0, 500),
          bytes: text.length,
        };
      }
      return {
        ok: true,
        status: 'ok',
        httpStatus,
        contentType,
        url: safeUrl,
        finalUrl: res.url,
        body: text,
        bytes: text.length,
      };
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          try {
            reader.cancel();
          } catch {
            /* ignore */
          }
          return {
            ok: false,
            status: 'too_large',
            httpStatus,
            contentType,
            url: safeUrl,
            finalUrl: res.url,
            bytes: total,
          };
        }
        chunks.push(value);
      }
    }

    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    const body = new TextDecoder('utf-8', { fatal: false }).decode(merged);

    if (!body.trim()) {
      return {
        ok: false,
        status: 'empty',
        httpStatus,
        contentType,
        url: safeUrl,
        finalUrl: res.url,
        body,
        bytes: 0,
      };
    }

    if (looksLikeSoft404(body, httpStatus)) {
      return {
        ok: false,
        status: 'soft_404',
        httpStatus,
        contentType,
        url: safeUrl,
        finalUrl: res.url,
        body: body.slice(0, 500),
        bytes: body.length,
      };
    }

    return {
      ok: true,
      status: 'ok',
      httpStatus,
      contentType,
      url: safeUrl,
      finalUrl: res.url,
      body,
      bytes: body.length,
    };
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return {
      ok: false,
      status: isAbort ? 'timeout' : 'failed',
      url: safeUrl,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** True if URL is reachable (GET), including auth walls. */
export async function verifyUrlExists(url: string | null, timeoutMs = 5000): Promise<boolean> {
  if (!url) return false;
  const result = await fetchResource(url, { timeoutMs, probeOnly: false, maxBytes: 64_000 });
  if (result.status === 'blocked') return false;
  if (result.httpStatus === 401 || result.httpStatus === 403) return true;
  return result.ok || result.status === 'too_large';
}
