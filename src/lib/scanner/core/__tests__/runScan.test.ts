import { describe, it, expect, vi, afterEach } from 'vitest';
import { runScan } from '../runScan';
import { ARS_SCORE_VERSION } from '../../version';

// Network is blocked by test/blockNetwork.ts unless a test stubs fetch itself.
afterEach(() => vi.restoreAllMocks());

/** A reachable site that only serves a bare homepage; everything else 404s. */
function serveBareHomepage(host: string) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
    const u = new URL(String(input?.url ?? input));
    if (u.host === host && (u.pathname === '/' || u.pathname === '')) {
      return new Response('<!doctype html><html><head><title>Bare</title></head><body><main><h1>Bare site</h1><p>Hello.</p></main></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  });
}

describe('runScan (end to end, offline)', () => {
  it('refuses to score a target that never responds', async () => {
    await expect(runScan({ url: 'https://unreachable.example.com' })).rejects.toMatchObject({ code: 'TARGET_UNREACHABLE' });
  }, 60000);

  it('stamps the current scoring version and reports evidence coverage', async () => {
    serveBareHomepage('bare.example.com');
    const result = await runScan({ url: 'https://bare.example.com' });

    expect(result.score_version).toBe(ARS_SCORE_VERSION);
    expect(result.scorecard?.version).toBe(ARS_SCORE_VERSION);
    expect(result.scorecard?.evidence?.targetReachable).toBe(true);
    expect(result.scorecard?.evidence?.checksRegistered).toBeGreaterThan(100);
    expect(result.scorecard?.evidence?.checksEvaluated).toBeGreaterThan(0);
  }, 60000);

  it('awards no MCP, OpenAPI or auth points to a bare site', async () => {
    serveBareHomepage('bare.example.com');
    const result = await runScan({ url: 'https://bare.example.com' });
    const passed = (result.scorecard?.results || []).filter((c) => c.status === 'pass').map((c) => c.checkId);

    expect(passed.filter((id) => /^(mcp-|api-|auth-|oauth-)/.test(id))).toEqual([]);
    expect(result.score).toBeLessThan(40);
  }, 60000);

  it('rejects private-network targets before probing', async () => {
    await expect(runScan({ url: 'http://169.254.169.254/latest/meta-data' })).rejects.toThrow();
  });
});
