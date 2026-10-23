import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fetchModule from '../fetchResource';
import type { FetchResourceResult } from '../fetchResource';
import { validatePoppyDocument, authServerMetadataUrl, findPoppyDocument } from '../poppy';

const DOC = {
  protocol_version: '0.2',
  organization: { name: 'Example Company', domain: 'example.com' },
  auth: { issuer: 'https://auth.example.com', direct: { scopes: ['poppy:read'] } },
  apis: [{ type: 'mcp', url: 'https://example.com/mcp', description: 'Tools' }],
};

function serve(routes: Record<string, unknown>) {
  vi.spyOn(fetchModule, 'fetchResource').mockImplementation(async (url) => {
    const body = routes[url];
    if (body === undefined) return { ok: false, status: 'failed', httpStatus: 404, url } as FetchResourceResult;
    return { ok: true, status: 'ok', httpStatus: 200, url, body: JSON.stringify(body) } as FetchResourceResult;
  });
}

describe('validatePoppyDocument', () => {
  it('accepts a minimal document', () => {
    expect(validatePoppyDocument({ protocol_version: '0.2', organization: { name: 'X', domain: 'example.com' }, web: {} }, 'example.com')).toEqual([]);
  });

  it('flags a domain that is not the serving host', () => {
    expect(validatePoppyDocument({ ...DOC, organization: { name: 'X', domain: 'other.com' } }, 'example.com')[0]).toMatch(/not example.com/);
  });

  it('requires auth when apis are listed, and typed HTTPS API entries', () => {
    const { auth, ...noAuth } = DOC;
    expect(validatePoppyDocument(noAuth, 'example.com').join()).toMatch(/^auth/);
    expect(validatePoppyDocument({ ...DOC, apis: [{ type: 'graphql', url: 'http://x' }] }, 'example.com').join()).toMatch(/apis entries/);
  });
});

describe('authServerMetadataUrl', () => {
  it('inserts the well-known segment before the issuer path (RFC 8414)', () => {
    expect(authServerMetadataUrl('https://auth.example.com')).toBe('https://auth.example.com/.well-known/oauth-authorization-server');
    expect(authServerMetadataUrl('https://example.com/tenant1/')).toBe('https://example.com/.well-known/oauth-authorization-server/tenant1');
  });
});

describe('findPoppyDocument', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('passes when the issuer metadata matches and lists the domain', async () => {
    serve({
      'https://example.com/.well-known/poppy.json': DOC,
      'https://auth.example.com/.well-known/oauth-authorization-server': { issuer: 'https://auth.example.com', poppy_domains: ['Example.com'] },
    });
    const found = await findPoppyDocument('https://example.com');
    expect(found?.valid).toBe(true);
    expect(found?.issuer).toBe('https://auth.example.com');
  });

  it('fails a document whose issuer does not list the domain', async () => {
    serve({
      'https://example.com/.well-known/poppy.json': DOC,
      'https://auth.example.com/.well-known/oauth-authorization-server': { issuer: 'https://auth.example.com', poppy_domains: ['someone-else.com'] },
    });
    const found = await findPoppyDocument('https://example.com');
    expect(found?.valid).toBe(false);
    expect(found?.problems.join()).toMatch(/poppy_domains/);
  });

  it('returns undefined when no document is published', async () => {
    serve({});
    expect(await findPoppyDocument('https://example.com')).toBeUndefined();
  });
});
