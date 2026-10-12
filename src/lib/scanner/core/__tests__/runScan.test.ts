import { describe, it, expect } from 'vitest';
import { runScan } from '../runScan';
import { ARS_SCORE_VERSION } from '../../version';

// Network is blocked by test/blockNetwork.ts, so every probe sees an unreachable site.
describe('runScan (end to end, offline)', () => {
  it('stamps the current scoring version and reports evidence coverage', async () => {
    const result = await runScan({ url: 'https://unreachable.example.com' });

    expect(result.score_version).toBe(ARS_SCORE_VERSION);
    expect(result.scorecard?.version).toBe(ARS_SCORE_VERSION);
    expect(result.scorecard?.evidence?.checksRegistered).toBeGreaterThan(100);
    expect(result.scorecard?.evidence?.checksEvaluated).toBeGreaterThan(0);
  }, 60000);

  it('awards no MCP, OpenAPI or auth points to a site it cannot reach', async () => {
    const result = await runScan({ url: 'https://unreachable.example.com' });
    const passed = (result.scorecard?.results || []).filter((c) => c.status === 'pass').map((c) => c.checkId);

    expect(passed.filter((id) => /^(mcp-|api-|auth-|oauth-)/.test(id))).toEqual([]);
    expect(result.score).toBeLessThan(30);
  }, 60000);

  it('rejects private-network targets before probing', async () => {
    await expect(runScan({ url: 'http://169.254.169.254/latest/meta-data' })).rejects.toThrow();
  });
});
