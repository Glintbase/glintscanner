import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fetchModule from '../fetchResource';
import { probeDiscovery, robotsDirectiveLines, looksLikeHtmlDocument } from '../probes/discovery';

function mockFetch(handler: (url: string) => Partial<fetchModule.FetchResourceResult> | undefined) {
  return vi.spyOn(fetchModule, 'fetchResource').mockImplementation(async (url: string) => {
    const r = handler(url);
    if (r) return { ok: true, status: 'ok', url, httpStatus: 200, ...r } as fetchModule.FetchResourceResult;
    return { ok: false, status: 'unreachable', url, httpStatus: 404 } as fetchModule.FetchResourceResult;
  });
}

describe('robots.txt parsing helpers', () => {
  it('strips whole-line and trailing comments', () => {
    expect(robotsDirectiveLines('# hello\nUser-agent: GPTBot # openai\nDisallow: /   # block all\n\n')).toEqual([
      'user-agent: gptbot',
      'disallow: /',
    ]);
  });

  it('detects HTML documents', () => {
    expect(looksLikeHtmlDocument('<!DOCTYPE html><html></html>')).toBe(true);
    expect(looksLikeHtmlDocument('User-agent: *', 'text/html; charset=utf-8')).toBe(true);
    expect(looksLikeHtmlDocument('User-agent: *\nAllow: /', 'text/plain')).toBe(false);
  });
});

describe('probeDiscovery robots.txt', () => {
  afterEach(() => vi.restoreAllMocks());

  it('treats an HTML page served at /robots.txt as no robots.txt', async () => {
    mockFetch((url) =>
      url === 'https://spa.example.com/robots.txt'
        ? { body: '<!doctype html><html><body>User-agent: GPTBot Allow: /</body></html>', contentType: 'text/html' }
        : undefined
    );
    const { robotsPolicy, checks } = await probeDiscovery('https://spa.example.com');
    expect(robotsPolicy.found).toBe(false);
    expect(checks.find((c) => c.checkId === 'robots-ai-policy-quality')!.status).not.toBe('pass');
  });

  it('reads directives that carry trailing comments', async () => {
    mockFetch((url) =>
      url === 'https://acme.example.com/robots.txt'
        ? { body: 'User-agent: GPTBot # OpenAI\nDisallow: / # no training\n\nUser-agent: *\nAllow: /\n', contentType: 'text/plain' }
        : undefined
    );
    const { robotsPolicy } = await probeDiscovery('https://acme.example.com');
    expect(robotsPolicy.found).toBe(true);
    expect(robotsPolicy.botsBlocked).toContain('gptbot');
    expect(robotsPolicy.botsAllowed).toContain('claudebot');
  });
});
