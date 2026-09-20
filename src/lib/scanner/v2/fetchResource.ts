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
  method?: 'GET' | 'HEAD' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /** When true, do not download body (existence probe). Still uses GET by default. */
  probeOnly?: boolean;
  /** When true, reads the response body even for HTTP 4xx/5xx status codes instead of discarding it */
  allowErrorBody?: boolean;
}

export interface FetchResourceResult {
  ok: boolean;
  status: FetchStatus;
  httpStatus?: number;
  headers?: Record<string, string>;
  body?: string;
  contentType?: string | null;
  url: string;
  finalUrl?: string;
  bytes?: number;
  networkError?: boolean;
  error?: string;
}

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
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
    let currentUrl = safeUrl;
    let res: Response | null = null;
    const maxRedirects = 5;

    for (let hop = 0; hop <= maxRedirects; hop++) {
      res = await fetch(currentUrl, {
        method,
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': DEFAULT_UA,
          Accept: '*/*',
          ...options.headers,
        },
        body: method === 'POST' ? options.body : undefined,
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        if (!location) break;
        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).toString();
        } catch {
          break;
        }
        const nextPolicy = validateScanUrl(nextUrl, { allowHttp: true });
        if (!nextPolicy.ok || !nextPolicy.url) {
          return { ok: false, status: 'blocked', url: nextUrl };
        }
        currentUrl = nextPolicy.url;
        continue;
      }
      break;
    }

    if (!res) {
      return { ok: false, status: 'failed', url: safeUrl };
    }

    const httpStatus = res.status;
    const contentType = res.headers.get('content-type');
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });

    const isSse = Boolean(contentType?.toLowerCase().includes('text/event-stream'));
    const isError = httpStatus >= 400;
    const exists =
      (httpStatus >= 200 && httpStatus < 400) ||
      httpStatus === 401 ||
      httpStatus === 403 ||
      (options.allowErrorBody && isError);

    if (!exists) {
      return {
        ok: false,
        status: httpStatus === 404 ? 'soft_404' : 'unreachable',
        httpStatus,
        contentType,
        headers,
        url: safeUrl,
        finalUrl: currentUrl,
      };
    }

    if (options.probeOnly || method === 'HEAD') {
      return {
        ok: !isError,
        status: isError ? (httpStatus === 404 ? 'soft_404' : 'unreachable') : 'ok',
        httpStatus,
        contentType,
        headers,
        url: safeUrl,
        finalUrl: currentUrl,
      };
    }

    // Fast non-hanging SSE reader: SSE channels are persistent streams that do not reach EOF.
    if (isSse && res.body) {
      const reader = res.body.getReader();
      let sseBody = '';
      try {
        const readPromise = reader.read();
        const sseTimeout = new Promise<{ done: boolean; value?: Uint8Array }>((resolve) =>
          setTimeout(() => resolve({ done: true }), 800)
        );
        const chunk = await Promise.race([readPromise, sseTimeout]);
        if (chunk && chunk.value) {
          sseBody = new TextDecoder('utf-8', { fatal: false }).decode(chunk.value);
        }
      } catch {
        /* non-fatal stream abort */
      } finally {
        try {
          await reader.cancel();
        } catch {
          /* ignore cancel error */
        }
      }
      return {
        ok: httpStatus >= 200 && httpStatus < 400,
        status: httpStatus >= 200 && httpStatus < 400 ? 'ok' : 'unreachable',
        httpStatus,
        contentType,
        headers,
        url: safeUrl,
        finalUrl: currentUrl,
        body: sseBody,
        bytes: sseBody.length,
      };
    }

    const text = await res.text().catch(() => '');
    if (text.length > maxBytes) {
      return {
        ok: false,
        status: 'too_large',
        httpStatus,
        contentType,
        headers,
        url: safeUrl,
        finalUrl: currentUrl,
        bytes: text.length,
      };
    }
    if (isError) {
      return {
        ok: false,
        status: httpStatus === 404 ? 'soft_404' : 'unreachable',
        httpStatus,
        contentType,
        headers,
        url: safeUrl,
        finalUrl: currentUrl,
        body: text,
        bytes: text.length,
      };
    }
    if (!text.trim()) {
      return {
        ok: false,
        status: 'empty',
        httpStatus,
        contentType,
        headers,
        url: safeUrl,
        finalUrl: currentUrl,
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
        headers,
        url: safeUrl,
        finalUrl: currentUrl,
        body: text.slice(0, 500),
        bytes: text.length,
      };
    }
    return {
      ok: true,
      status: 'ok',
      httpStatus,
      contentType,
      headers,
      url: safeUrl,
      finalUrl: currentUrl,
      body: text,
      bytes: text.length,
    };
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return {
      ok: false,
      status: isAbort ? 'timeout' : 'failed',
      url: safeUrl,
      networkError: true,
      error: isAbort ? `Connection timed out after ${timeoutMs}ms` : (err?.message || String(err)),
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
