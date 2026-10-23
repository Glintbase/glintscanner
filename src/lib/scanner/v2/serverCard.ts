/**
 * MCP Server Card discovery (SEP-2127, final 2026-10-06; io.modelcontextprotocol/server-card).
 *
 * Discovery order, per modelcontextprotocol/ext-server-card docs/discovery.md:
 * 1. `/.well-known/ai-catalog.json` entries of type `application/mcp-server-card+json`, with
 *    the card at the entry's `url` or inline in `data`.
 * 2. `<streamable-http-url>/server-card`, the default hosted location.
 * 3. `/.well-known/mcp/server-card.json`, from the superseded SEP-1649 draft. The spec now
 *    advises against it, so a card found only there is reported but does not pass.
 */

import { fetchResource } from './fetchResource';

export const SERVER_CARD_MEDIA_TYPE = 'application/mcp-server-card+json';
const CARD_ACCEPT = `${SERVER_CARD_MEDIA_TYPE}, application/json;q=0.9`;

export type ServerCardLocation = 'ai-catalog' | 'endpoint' | 'legacy-well-known';

export interface ServerCardFinding {
  location: ServerCardLocation;
  url?: string;
  valid: boolean;
  /** Required fields that are missing or malformed (v1 schema: $schema, name, version, description). */
  problems: string[];
  /** Remote endpoints the card declares. */
  remotes: Array<{ type?: string; url: string }>;
}

function parseJson(body?: string): any {
  if (!body) return null;
  try {
    return JSON.parse(body.trim());
  } catch {
    return null;
  }
}

/** Checks the fields the v1 Server Card schema requires. */
export function validateServerCard(card: any): string[] {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return ['not a JSON object'];
  const problems: string[] = [];
  if (typeof card.$schema !== 'string' || !/server-card/i.test(card.$schema)) problems.push('$schema');
  for (const field of ['name', 'version', 'description']) {
    if (typeof card[field] !== 'string' || !card[field].trim()) problems.push(field);
  }
  return problems;
}

export function remotesFromCard(card: any): ServerCardFinding['remotes'] {
  if (!Array.isArray(card?.remotes)) return [];
  return card.remotes
    .filter((r: any) => r && typeof r.url === 'string' && /^https?:\/\//i.test(r.url))
    .map((r: any) => ({ type: typeof r.type === 'string' ? r.type : undefined, url: r.url }));
}

function finding(location: ServerCardLocation, card: any, url?: string): ServerCardFinding {
  const problems = validateServerCard(card);
  return { location, url, valid: problems.length === 0, problems, remotes: remotesFromCard(card) };
}

async function fetchCard(url: string): Promise<any> {
  const res = await fetchResource(url, { timeoutMs: 3500, maxBytes: 200_000, headers: { Accept: CARD_ACCEPT } });
  return res.ok ? parseJson(res.body) : null;
}

/** Server Cards listed in the domain's AI Catalog (first valid one wins, else the first found). */
export async function findCatalogServerCard(origin: string): Promise<ServerCardFinding | undefined> {
  const res = await fetchResource(`${origin}/.well-known/ai-catalog.json`, {
    timeoutMs: 3500,
    maxBytes: 500_000,
    headers: { Accept: 'application/ai-catalog+json, application/json;q=0.9' },
  });
  const catalog = res.ok ? parseJson(res.body) : null;
  const entries: any[] = Array.isArray(catalog?.entries) ? catalog.entries : [];
  const cardEntries = entries.filter((e) => e && e.type === SERVER_CARD_MEDIA_TYPE).slice(0, 3);

  let first: ServerCardFinding | undefined;
  for (const entry of cardEntries) {
    let found: ServerCardFinding | undefined;
    if (entry.data && typeof entry.data === 'object') {
      found = finding('ai-catalog', entry.data);
    } else if (typeof entry.url === 'string') {
      let url: string;
      try {
        url = new URL(entry.url, `${origin}/`).href;
      } catch {
        continue;
      }
      const card = await fetchCard(url);
      if (card) found = finding('ai-catalog', card, url);
    }
    if (found?.valid) return found;
    first = first || found;
  }
  return first;
}

/** Card at the default hosted location next to a Streamable HTTP endpoint. */
export async function findEndpointServerCard(mcpEndpoint: string): Promise<ServerCardFinding | undefined> {
  const url = `${mcpEndpoint.replace(/\/+$/, '')}/server-card`;
  const card = await fetchCard(url);
  return card ? finding('endpoint', card, url) : undefined;
}

/** Card at the superseded SEP-1649 well-known path. */
export async function findLegacyServerCard(origin: string): Promise<ServerCardFinding | undefined> {
  const url = `${origin}/.well-known/mcp/server-card.json`;
  const card = await fetchCard(url);
  return card ? finding('legacy-well-known', card, url) : undefined;
}
