import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fetchModule from '../fetchResource';
import type { FetchResourceResult } from '../fetchResource';
import {
  validateServerCard,
  findCatalogServerCard,
  findEndpointServerCard,
  findLegacyServerCard,
  SERVER_CARD_MEDIA_TYPE,
} from '../serverCard';

const CARD = {
  $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
  name: 'example-org/weather',
  version: '1.2.0',
  description: 'Weather forecasts',
  remotes: [
    { type: 'streamable-http', url: 'https://example.com/mcp' },
    { type: 'sse', url: 'https://example.com/sse' },
  ],
};

function serve(routes: Record<string, unknown>) {
  const seen: Array<{ url: string; accept?: string }> = [];
  vi.spyOn(fetchModule, 'fetchResource').mockImplementation(async (url, opts) => {
    seen.push({ url, accept: opts?.headers?.Accept });
    const body = routes[url];
    if (body === undefined) return { ok: false, status: 'failed', httpStatus: 404, url } as FetchResourceResult;
    return { ok: true, status: 'ok', httpStatus: 200, url, body: typeof body === 'string' ? body : JSON.stringify(body) } as FetchResourceResult;
  });
  return seen;
}

describe('validateServerCard', () => {
  it('accepts a card with the required v1 fields', () => {
    expect(validateServerCard(CARD)).toEqual([]);
  });

  it('lists missing required fields', () => {
    expect(validateServerCard({ name: 'x', version: '1' })).toEqual(['$schema', 'description']);
    expect(validateServerCard([])).toEqual(['not a JSON object']);
  });
});

describe('Server Card discovery', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('follows an AI Catalog entry url with the Server Card media type', async () => {
    const seen = serve({
      'https://example.com/.well-known/ai-catalog.json': {
        specVersion: '1.0',
        entries: [
          { identifier: 'urn:air:example.com:agent', type: 'application/a2a-agent-card+json', url: 'https://example.com/agent.json' },
          { identifier: 'urn:air:example.com:mcp:weather', type: SERVER_CARD_MEDIA_TYPE, url: 'https://example.com/mcp/server-card' },
        ],
      },
      'https://example.com/mcp/server-card': CARD,
    });

    const card = await findCatalogServerCard('https://example.com');

    expect(card?.valid).toBe(true);
    expect(card?.location).toBe('ai-catalog');
    expect(card?.remotes.map((r) => r.url)).toEqual(['https://example.com/mcp', 'https://example.com/sse']);
    expect(seen.find((s) => s.url.endsWith('/server-card'))?.accept).toContain(SERVER_CARD_MEDIA_TYPE);
    expect(seen.some((s) => s.url.endsWith('agent.json'))).toBe(false);
  });

  it('accepts a card inlined in the catalog entry', async () => {
    serve({
      'https://example.com/.well-known/ai-catalog.json': { entries: [{ type: SERVER_CARD_MEDIA_TYPE, data: CARD }] },
    });
    const card = await findCatalogServerCard('https://example.com');
    expect(card?.valid).toBe(true);
    expect(card?.url).toBeUndefined();
  });

  it('reports an invalid card rather than passing it', async () => {
    serve({
      'https://example.com/.well-known/ai-catalog.json': { entries: [{ type: SERVER_CARD_MEDIA_TYPE, data: { name: 'x' } }] },
    });
    const card = await findCatalogServerCard('https://example.com');
    expect(card?.valid).toBe(false);
    expect(card?.problems).toContain('version');
  });

  it('finds the card at <endpoint>/server-card', async () => {
    serve({ 'https://example.com/mcp/server-card': CARD });
    const card = await findEndpointServerCard('https://example.com/mcp/');
    expect(card?.location).toBe('endpoint');
    expect(card?.url).toBe('https://example.com/mcp/server-card');
  });

  it('labels a card at the superseded well-known path as legacy', async () => {
    serve({ 'https://example.com/.well-known/mcp/server-card.json': CARD });
    const card = await findLegacyServerCard('https://example.com');
    expect(card?.location).toBe('legacy-well-known');
  });

  it('returns undefined when no catalog exists', async () => {
    serve({});
    expect(await findCatalogServerCard('https://example.com')).toBeUndefined();
  });
});
