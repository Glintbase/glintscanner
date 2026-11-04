/**
 * Agent Resource Discovery (ARD) manifest discovery, per the IETF drafts of 2026-10-30:
 * - draft-jimenez-dawn-ard-initial-contact-00 (how a client finds the manifest):
 *   GET https://<domain>/.well-known/ard.json following at most one redirect (§4.3.1);
 *   if that yields no manifest, HEAD https://<domain>/ and read the `ard` link relation from
 *   the Link header field whatever the status, after at most one redirect (§4.3.2). A publisher
 *   that cannot set headers may use an HTML `<link rel="ard">`, read only from a GET of the root.
 * - draft-bu-dawn-ard-discovery-00 (the manifest): media type `application/ard+json` (§8.1.1),
 *   a top-level `entries` array (§3.6); each entry has `identifier`, `displayName` and `type`
 *   and exactly one of `url` or `data` (§3.2.1).
 *
 * DNS discovery (SVCB, DNS-SD) is not probed.
 */

import { fetchResource } from './fetchResource';
import { fetchWellKnown } from './wellKnown';
import { parseLinkHeader } from './probes/access';

export const ARD_MEDIA_TYPE = 'application/ard+json';
const ARD_ACCEPT = `${ARD_MEDIA_TYPE}, application/json;q=0.9`;

export type ArdVia = 'well-known' | 'link-header' | 'html-link' | 'local';

export interface ArdFinding {
  url?: string;
  via: ArdVia;
  /** The manifest has an `entries` array and every entry is well-formed. */
  valid: boolean;
  problems: string[];
  /** Content-Type the manifest was served with (draft: application/ard+json). */
  mediaType?: string;
  entryCount: number;
  manifest: any;
}

function parseJsonObject(body?: string): any {
  if (!body) return null;
  try {
    const v = JSON.parse(body.trim());
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

/** Problems that keep a document from being a draft-00 ARD manifest (empty when valid). */
export function validateArdManifest(doc: any): string[] {
  if (!doc || typeof doc !== 'object') return ['not a JSON object'];
  if (!Array.isArray(doc.entries)) {
    // v0.91-era files (urn:air ids, an `endpoints` object) have no entries array.
    return [doc.endpoints || /urn:air/.test(JSON.stringify(doc).slice(0, 5000)) ? 'pre-draft ARD shape (no entries array; urn:air / endpoints)' : 'no top-level entries array'];
  }
  const problems: string[] = [];
  doc.entries.slice(0, 50).forEach((e: any, i: number) => {
    const missing = ['identifier', 'displayName', 'type'].filter((k) => !nonEmpty(e?.[k]));
    if (missing.length) problems.push(`entries[${i}] missing ${missing.join(', ')}`);
    const hasUrl = e?.url !== undefined;
    const hasData = e?.data !== undefined;
    if (hasUrl === hasData) problems.push(`entries[${i}] needs exactly one of url or data`);
  });
  return problems.slice(0, 5);
}

function finding(doc: any, via: ArdVia, url?: string, contentType?: string | null): ArdFinding {
  const problems = validateArdManifest(doc);
  return {
    url,
    via,
    valid: problems.length === 0,
    problems,
    mediaType: contentType ? contentType.split(';')[0].trim().toLowerCase() : undefined,
    entryCount: Array.isArray(doc?.entries) ? doc.entries.length : 0,
    manifest: doc,
  };
}

/** href of `<link rel="ard" ...>` in a page, if any. */
export function findArdHtmlLink(html: string): string | undefined {
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = tag.match(/\brel\s*=\s*["']?([^"'>]+)/i)?.[1] || '';
    if (!/(^|\s)ard(\s|$)/i.test(rel)) continue;
    return tag.match(/\bhref\s*=\s*["']?([^"'\s>]+)/i)?.[1];
  }
  return undefined;
}

async function fetchManifest(url: string, via: ArdVia): Promise<ArdFinding | undefined> {
  const res = await fetchResource(url, { timeoutMs: 3500, maxBytes: 500_000, maxRedirects: 1, headers: { Accept: ARD_ACCEPT } });
  const doc = res.ok ? parseJsonObject(res.body) : null;
  return doc ? finding(doc, via, res.finalUrl || url, res.contentType) : undefined;
}

/** Finds the origin's ARD manifest the way the initial-contact draft describes, or undefined. */
export async function findArdManifest(origin: string): Promise<ArdFinding | undefined> {
  const wkUrl = `${origin}/.well-known/ard.json`;
  const wk = await fetchWellKnown(wkUrl, { timeoutMs: 3500, maxBytes: 500_000, maxRedirects: 1, headers: { Accept: ARD_ACCEPT } });
  const wkDoc = wk.ok ? parseJsonObject(wk.body) : null;
  if (wkDoc) return finding(wkDoc, 'well-known', wk.finalUrl || wkUrl, wk.contentType);

  const root = `${origin}/`;
  const head = await fetchResource(root, { method: 'HEAD', timeoutMs: 3500, maxRedirects: 1 });
  const linked = parseLinkHeader(head.headers?.link).find((l) => l.rels.includes('ard'));
  if (linked) {
    try {
      const found = await fetchManifest(new URL(linked.href, head.finalUrl || root).href, 'link-header');
      if (found) return found;
    } catch {
      /* invalid href */
    }
  }

  // HTML <link rel="ard">: only from a GET of the root (draft §4.3.2).
  const page = await fetchResource(root, { timeoutMs: 5000, maxBytes: 1_000_000, maxRedirects: 1 });
  const href = page.ok && page.body ? findArdHtmlLink(page.body) : undefined;
  if (href) {
    try {
      return await fetchManifest(new URL(href, page.finalUrl || root).href, 'html-link');
    } catch {
      /* invalid href */
    }
  }
  return undefined;
}

/** A manifest from local codebase context. */
export function ardFromContent(content: string): ArdFinding | undefined {
  const doc = parseJsonObject(content);
  return doc ? finding(doc, 'local') : undefined;
}
