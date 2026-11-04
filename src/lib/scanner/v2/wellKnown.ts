/**
 * `.well-known` fetches with a control path (ARS 3.4, S5).
 *
 * Many sites answer every path under `/.well-known/` with the same page: an SPA shell, a
 * marketing page or a JSON stub such as `{}`. A check that accepts any non-HTML 200 then
 * passes on that catch-all. Before trusting a well-known response, the scanner requests a
 * random path under `/.well-known/` on the same origin (once per origin per scan) and rejects
 * a response that is HTML when the control was HTML, or whose body matches the control's.
 */

import { randomBytes } from 'node:crypto';
import { fetchResource, type FetchResourceOptions, type FetchResourceResult } from './fetchResource';

export interface WellKnownControl {
  url: string;
  /** The random path answered 2xx with a body, so this origin has a catch-all. */
  catchAll: boolean;
  httpStatus?: number;
  isHtml: boolean;
  /** Control body normalised for comparison (see normaliseBody). */
  fingerprint?: string;
}

/** Results reused across the probes of one scan; short, because a site can change. */
const CONTROL_TTL_MS = 2 * 60_000;
const controls = new Map<string, { at: number; control: Promise<WellKnownControl> }>();

export function resetWellKnownControlCache(): void {
  controls.clear();
}

function looksHtml(body: string | undefined, contentType?: string | null): boolean {
  if (/text\/html|application\/xhtml/i.test(contentType || '')) return true;
  return /^\s*(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(body || '');
}

/**
 * Body with volatile parts removed: the probed path itself (pages often echo it), long hex or
 * numeric runs (request ids, nonces, timestamps) and whitespace.
 */
export function normaliseBody(body: string, path?: string): string {
  let s = body.slice(0, 20_000);
  if (path) s = s.split(path).join('');
  return s
    .replace(/[0-9a-f]{8,}(?:-[0-9a-f]{4,})*/gi, '#')
    .replace(/\d+/g, '0')
    .replace(/\s+/g, ' ')
    .trim();
}

async function requestControl(origin: string): Promise<WellKnownControl> {
  const path = `/.well-known/glintbase-control-${randomBytes(6).toString('hex')}`;
  const url = `${origin}${path}`;
  const res = await fetchResource(url, { timeoutMs: 3500, maxBytes: 200_000 });
  const catchAll = Boolean(res.ok && res.body);
  return {
    url,
    catchAll,
    httpStatus: res.httpStatus,
    isHtml: catchAll && looksHtml(res.body, res.contentType),
    fingerprint: catchAll ? normaliseBody(res.body!, path) : undefined,
  };
}

/** The control response for an origin (requested once, then cached briefly). */
export function getWellKnownControl(origin: string): Promise<WellKnownControl> {
  const hit = controls.get(origin);
  if (hit && Date.now() - hit.at < CONTROL_TTL_MS) return hit.control;
  const control = requestControl(origin).catch((): WellKnownControl => ({ url: `${origin}/.well-known/`, catchAll: false, isHtml: false }));
  controls.set(origin, { at: Date.now(), control });
  return control;
}

/** True when a well-known response is the origin's catch-all page rather than the document. */
export function matchesCatchAll(res: Pick<FetchResourceResult, 'ok' | 'body' | 'contentType' | 'url'>, control: WellKnownControl): boolean {
  if (!control.catchAll || !res.ok || !res.body) return false;
  if (control.isHtml && looksHtml(res.body, res.contentType)) return true;
  let path: string | undefined;
  try {
    path = new URL(res.url).pathname;
  } catch {
    /* keep undefined */
  }
  return normaliseBody(res.body, path) === control.fingerprint;
}

export interface WellKnownResult extends FetchResourceResult {
  /** The response matched the origin's catch-all control, so it is treated as not found. */
  catchAll?: boolean;
}

/**
 * fetchResource for a `/.well-known/` URL. A response that matches the origin's catch-all
 * control comes back as `ok: false`, `status: 'soft_404'`, `catchAll: true`.
 */
export async function fetchWellKnown(url: string, options: FetchResourceOptions = {}): Promise<WellKnownResult> {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return fetchResource(url, options);
  }
  const [res, control] = await Promise.all([fetchResource(url, options), getWellKnownControl(origin)]);
  if (matchesCatchAll(res, control)) {
    return { ...res, ok: false, status: 'soft_404', catchAll: true };
  }
  return res;
}
