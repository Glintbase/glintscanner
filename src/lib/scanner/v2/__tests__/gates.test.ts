import { describe, it, expect, afterEach } from 'vitest';
import { runArs3ProbesDetailed, GATE_SCORE_CAP } from '../probes';

const originalFetch = global.fetch;

/** Serves `home` for the homepage, an optional robots.txt, and 404 for everything else. */
function mockSite(home: () => Response, robots?: string) {
  global.fetch = (async (input: any) => {
    const url = new URL(String(input));
    if (url.hostname === 'gated.example.com' && (url.pathname === '/' || url.pathname === '')) return home();
    if (robots && url.hostname === 'gated.example.com' && url.pathname === '/robots.txt') {
      return new Response(robots, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }) as typeof fetch;
}

describe('score gates', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('caps the score when the homepage has no content without JavaScript', async () => {
    mockSite(
      () =>
        new Response('<!doctype html><html><head><title>App</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
    );

    const { scorecard } = await runArs3ProbesDetailed('https://gated.example.com/', { kind: 'product' });

    expect(scorecard.gates?.map((g) => g.checkId)).toContain('content-no-js');
    // Every result says what kind of evidence it rests on, and the measured runtime pillar is reported.
    expect(scorecard.results.filter((r) => !r.measurement).map((r) => r.checkId)).toEqual([]);
    expect(scorecard.pillars?.runtimeMeasured).toBeDefined();
    expect(scorecard.score).toBeLessThanOrEqual(GATE_SCORE_CAP);
    expect(scorecard.uncappedScore).toBeGreaterThanOrEqual(scorecard.score);
  }, 60000);

  it('treats a challenged homepage as not observed and gates on the challenge', async () => {
    mockSite(
      () =>
        new Response('<html><body>Just a moment... /cdn-cgi/challenge-platform</body></html>', {
          status: 403,
          headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' },
        })
    );

    const { scorecard } = await runArs3ProbesDetailed('https://gated.example.com/', { kind: 'product' });
    const byId = (id: string) => scorecard.results.find((r) => r.checkId === id);

    expect(byId('anti-crawler-challenge-free')?.status).toBe('fail');
    expect(byId('content-no-js')?.status).toBe('skip');
    expect(byId('content-no-js')?.message).toMatch(/Not observed/);
    expect(scorecard.evidence?.homepageBlocked).toBe(true);
    expect(scorecard.gates?.map((g) => g.checkId)).toEqual(['anti-crawler-challenge-free']);
    expect(scorecard.score).toBeLessThanOrEqual(GATE_SCORE_CAP);
  }, 60000);

  it('gates on a plain 403 and flags robots.txt that allows agents the edge refuses', async () => {
    mockSite(
      () => new Response('<html><body><h1>Forbidden</h1></body></html>', { status: 403, headers: { 'content-type': 'text/html' } }),
      'User-agent: *\nAllow: /\n'
    );

    const { scorecard } = await runArs3ProbesDetailed('https://gated.example.com/', { kind: 'product' });
    const byId = (id: string) => scorecard.results.find((r) => r.checkId === id);

    expect(byId('anti-crawler-challenge-free')?.status).toBe('fail');
    expect(byId('anti-crawler-challenge-free')?.message).toMatch(/403/);
    expect(byId('robots-edge-consistency')?.status).toBe('warn');
    expect(byId('robots-edge-consistency')?.earnedPoints).toBe(0);
    expect(scorecard.score).toBeLessThanOrEqual(GATE_SCORE_CAP);
  }, 60000);
});
