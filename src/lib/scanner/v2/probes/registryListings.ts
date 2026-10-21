/**
 * Discovery-layer registry lookups: is the target listed in the official MCP Registry
 * and on skills.sh under an identity tied to its own domain?
 *
 * Matching is deliberately strict so third parties cannot earn a site these points:
 * - MCP Registry: a reverse-DNS namespace for the domain (com.stripe/…), which the registry
 *   only grants after the publisher proves control of the domain; a remote endpoint hosted on
 *   the domain; or a GitHub namespace for the brand's own GitHub owner (io.github.<brand>/…).
 *   A self-declared websiteUrl is not enough.
 * - skills.sh: skills published from the domain itself (docs.stripe.com/…) or from the
 *   brand's GitHub owner (stripe/…).
 *
 * A lookup returns 'unverified' when the registry did not answer (timeout, error, bad JSON),
 * so the check is skipped rather than failed: a registry outage never costs a site points.
 */

import { fetchResource } from '../fetchResource';

export const MCP_REGISTRY_API = 'https://registry.modelcontextprotocol.io/v0/servers';
/** skills.sh search endpoint (used by its own site; not a versioned public API). */
export const SKILLS_SH_SEARCH_API = 'https://skills.sh/api/search';

/**
 * Per-request timeout. Live scans keep it short; offline batch rescans can raise it with
 * GLINTBASE_REGISTRY_TIMEOUT_MS (the MCP Registry search can take tens of seconds to answer).
 */
export const REGISTRY_LOOKUP_TIMEOUT_MS = (() => {
  const raw = typeof process !== 'undefined' ? Number(process.env?.GLINTBASE_REGISTRY_TIMEOUT_MS) : NaN;
  return Number.isFinite(raw) && raw >= 1000 && raw <= 120_000 ? raw : 8000;
})();

export type ListingLookup =
  | { outcome: 'listed'; match: string }
  | { outcome: 'not_listed' }
  | { outcome: 'unverified'; reason: string };

/** stripe.com -> com.stripe */
export function reverseDomain(domain: string): string {
  return domain.toLowerCase().split('.').filter(Boolean).reverse().join('.');
}

function hostIsOnDomain(host: string, apexDomain: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  const apex = apexDomain.toLowerCase();
  return h === apex || h.endsWith(`.${apex}`);
}

function hostOf(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    return new URL(url.replace(/\{[^}]*\}/g, 'x')).hostname;
  } catch {
    return null;
  }
}

interface RegistryServerEntry {
  server?: { name?: unknown; remotes?: Array<{ url?: unknown }> };
  _meta?: Record<string, { status?: unknown; isLatest?: unknown } | undefined>;
}

/** First registry server that belongs to the domain/brand, or null. */
export function matchMcpRegistryServers(entries: unknown, apexDomain: string, brandName: string): string | null {
  if (!Array.isArray(entries)) return null;
  const reversed = reverseDomain(apexDomain);
  const brand = brandName.toLowerCase();
  for (const raw of entries as RegistryServerEntry[]) {
    const name = typeof raw?.server?.name === 'string' ? raw.server.name : '';
    if (!name) continue;
    const official = raw._meta?.['io.modelcontextprotocol.registry/official'];
    if (official && (official.isLatest === false || (typeof official.status === 'string' && official.status !== 'active'))) continue;

    const namespace = name.split('/')[0].toLowerCase();
    if (namespace === reversed || namespace.startsWith(`${reversed}.`)) return name;
    if (brand && namespace === `io.github.${brand}`) return name;
    for (const remote of raw.server?.remotes ?? []) {
      const host = hostOf(remote?.url);
      if (host && hostIsOnDomain(host, apexDomain)) return name;
    }
  }
  return null;
}

/** First skills.sh source that belongs to the domain/brand, or null. */
export function matchSkillsShSources(skills: unknown, apexDomain: string, brandName: string): string | null {
  if (!Array.isArray(skills)) return null;
  const brand = brandName.toLowerCase();
  for (const s of skills as Array<{ source?: unknown; id?: unknown }>) {
    const source = typeof s?.source === 'string' ? s.source.toLowerCase() : '';
    if (!source) continue;
    const owner = source.split('/')[0];
    // Domain-hosted skills (served from the site's own .well-known) carry a hostname as source.
    if (owner.includes('.')) {
      if (hostIsOnDomain(owner, apexDomain)) return String(s.id ?? source);
    } else if (brand && owner === brand) {
      return String(s.id ?? source);
    }
  }
  return null;
}

async function getJson(url: string, timeoutMs: number): Promise<{ ok: true; json: any } | { ok: false; reason: string }> {
  try {
    const res = await fetchResource(url, { timeoutMs, headers: { Accept: 'application/json' } });
    if (!res.ok || !res.body) return { ok: false, reason: `HTTP ${res.httpStatus || res.status}` };
    return { ok: true, json: JSON.parse(res.body) };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'request failed' };
  }
}

/**
 * Searches the registry by the domain's reverse-DNS namespace and by brand name. Listed if
 * either answer matches; not listed only when both searches answered without a match.
 */
export async function lookupMcpRegistry(apexDomain: string, brandName: string, timeoutMs = REGISTRY_LOOKUP_TIMEOUT_MS): Promise<ListingLookup> {
  const queries = Array.from(new Set([reverseDomain(apexDomain), brandName.toLowerCase()].filter((q) => q.length >= 3)));
  if (queries.length === 0) return { outcome: 'unverified', reason: 'no domain or brand to search for' };
  const answers = await Promise.all(
    queries.map((q) => getJson(`${MCP_REGISTRY_API}?search=${encodeURIComponent(q)}&limit=100`, timeoutMs))
  );
  for (const a of answers) {
    if (!a.ok) continue;
    const match = matchMcpRegistryServers(a.json?.servers, apexDomain, brandName);
    if (match) return { outcome: 'listed', match };
  }
  const failed = answers.find((a): a is { ok: false; reason: string } => !a.ok);
  if (failed) return { outcome: 'unverified', reason: `MCP Registry did not answer (${failed.reason})` };
  if (answers.some((a) => a.ok && !Array.isArray(a.json?.servers))) {
    return { outcome: 'unverified', reason: 'MCP Registry returned an unexpected response' };
  }
  return { outcome: 'not_listed' };
}

export async function lookupSkillsSh(apexDomain: string, brandName: string, timeoutMs = REGISTRY_LOOKUP_TIMEOUT_MS): Promise<ListingLookup> {
  const brand = brandName.toLowerCase();
  if (brand.length < 2) return { outcome: 'unverified', reason: 'no brand to search for' };
  const a = await getJson(`${SKILLS_SH_SEARCH_API}?q=${encodeURIComponent(brand)}`, timeoutMs);
  if (!a.ok) return { outcome: 'unverified', reason: `skills.sh did not answer (${a.reason})` };
  if (!Array.isArray(a.json?.skills)) return { outcome: 'unverified', reason: 'skills.sh returned an unexpected response' };
  const match = matchSkillsShSources(a.json.skills, apexDomain, brandName);
  return match ? { outcome: 'listed', match } : { outcome: 'not_listed' };
}
