import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fetchModule from '../fetchResource';
import { probeAccess } from '../probes/access';

type Handler = (url: string, opts: any) => Partial<fetchModule.FetchResourceResult> | undefined;

function mockFetch(handler: Handler) {
  return vi.spyOn(fetchModule, 'fetchResource').mockImplementation(async (url: string, opts: any = {}) => {
    const r = handler(url, opts);
    if (r) return { ok: true, status: 'ok', url, httpStatus: 200, ...r } as fetchModule.FetchResourceResult;
    return { ok: false, status: 'unreachable', url, httpStatus: 404 } as fetchModule.FetchResourceResult;
  });
}

const byId = (checks: { checkId: string }[]) => new Map(checks.map((c: any) => [c.checkId, c]));
const HOMEPAGE_CHECKS = ['content-no-js', 'heading-hierarchy', 'meta-description-quality', 'cors-headers', 'etag-caching', 'code-fence-validity', 'response-latency-p95'];

describe('probeAccess when the homepage cannot be fetched', () => {
  afterEach(() => vi.restoreAllMocks());

  it('skips homepage-derived checks and the bot-challenge check instead of failing or passing them', async () => {
    mockFetch((url) =>
      url === 'https://down.example.com'
        ? { ok: false, status: 'timeout', httpStatus: undefined, body: undefined, networkError: true }
        : undefined
    );
    const { checks } = await probeAccess('https://down.example.com');
    const c = byId(checks);
    for (const id of HOMEPAGE_CHECKS) {
      expect(c.get(id)!.status, id).toBe('skip');
      expect(c.get(id)!.earnedPoints, id).toBe(0);
      expect(c.get(id)!.message).toBe('Homepage could not be fetched');
    }
    expect(c.get('status-code-accuracy')!.status).toBe('skip');
    expect(c.get('anti-crawler-challenge-free')!.status).toBe('skip');
    expect(checks.filter((x: any) => x.status === 'pass').map((x: any) => x.checkId)).not.toContain('heading-hierarchy');
  });

  it('still fails the bot-challenge check when a challenge page is served', async () => {
    mockFetch((url, opts) => {
      if (url !== 'https://cf.example.com') return undefined;
      if (opts.allowErrorBody) {
        return { ok: false, status: 'unreachable', httpStatus: 403, body: '<html><title>Just a moment...</title></html>' };
      }
      return { ok: false, status: 'unreachable', httpStatus: 403 };
    });
    const { checks } = await probeAccess('https://cf.example.com');
    expect(byId(checks).get('anti-crawler-challenge-free')!.status).toBe('fail');
  });

  it('skips anti-spa-404 when the canary request does not complete', async () => {
    mockFetch((url) => {
      if (url.includes('__glintbase_canary_')) return { ok: false, status: 'timeout', httpStatus: undefined };
      if (url === 'https://slow.example.com') return { body: '<html><body><h1>Hi</h1></body></html>', contentType: 'text/html' };
      return undefined;
    });
    const { checks } = await probeAccess('https://slow.example.com');
    expect(byId(checks).get('anti-spa-404')!.status).toBe('skip');
  });

  it('keeps scoring homepage checks normally when the homepage loads', async () => {
    mockFetch((url) => {
      if (url === 'https://ok.example.com') {
        return {
          body: '<!doctype html><html><head><meta name="description" content="x"></head><body><h1>Hi</h1></body></html>',
          contentType: 'text/html; charset=utf-8',
          headers: { etag: '"abc"' },
        };
      }
      return undefined;
    });
    const { checks } = await probeAccess('https://ok.example.com');
    const c = byId(checks);
    expect(c.get('meta-description-quality')!.status).toBe('pass');
    expect(c.get('etag-caching')!.status).toBe('pass');
    expect(c.get('cors-headers')!.status).toBe('warn');
    expect(c.get('anti-crawler-challenge-free')!.status).toBe('pass');
    expect(c.get('anti-spa-404')!.status).toBe('pass'); // canary got the mock 404
  });
});

describe('probeAccess OpenAPI discovery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('finds a spec later in the candidate list and prefers list order within a batch', async () => {
    const spec = JSON.stringify({ openapi: '3.1.0', info: { title: 'x', version: '1' }, paths: {} });
    mockFetch((url) => {
      if (url === 'https://api.example.com/swagger.json' || url === 'https://api.example.com/v3/api-docs') {
        return { body: spec, contentType: 'application/json' };
      }
      return undefined;
    });
    const { openapi } = await probeAccess('https://api.example.com');
    expect(openapi.found).toBe(true);
    expect(openapi.url).toBe('https://api.example.com/swagger.json');
  });
});
