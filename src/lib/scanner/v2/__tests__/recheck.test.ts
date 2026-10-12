import { describe, it, expect } from 'vitest';
import { recheckFromResults, parseCheckIds, partitionCheckIds } from '../probes/recheck';
import type { CheckResult } from '../probes/types';

const result = (checkId: string, status: CheckResult['status']): CheckResult => ({
  checkId,
  status,
  earnedPoints: status === 'pass' ? 2 : 0,
  maxPoints: 2,
  isBonus: false,
  message: `${checkId} ${status}`,
});

describe('recheckFromResults', () => {
  const results = [result('anti-spa-404', 'pass'), result('robots-ai-policy-quality', 'warn'), result('auth-md-structure', 'skip')];

  it('looks results up by exact check id', () => {
    const out = recheckFromResults(results, ['anti-spa-404', 'robots-ai-policy-quality', 'auth-md-structure']);
    expect(out.map((r) => [r.checkId, r.status, r.passed])).toEqual([
      ['anti-spa-404', 'pass', true],
      ['robots-ai-policy-quality', 'warn', false],
      ['auth-md-structure', 'skip', false],
    ]);
  });

  it('reports unknown ids instead of matching by substring', () => {
    const [auth, robots] = recheckFromResults(results, ['auth', 'robots.txt']);
    expect(auth).toMatchObject({ checkId: 'auth', known: false, status: 'unknown', passed: false });
    expect(robots.status).toBe('unknown');
    expect(auth.message).toMatch(/unknown check id/i);
  });

  it('flags registered checks missing from the scorecard as not evaluated', () => {
    const [r] = recheckFromResults([], ['anti-spa-404']);
    expect(r).toMatchObject({ known: true, status: 'not_evaluated', passed: false });
  });
});

describe('check id parsing', () => {
  it('parses and partitions ids', () => {
    expect(parseCheckIds(' anti-spa-404, ,auth, anti-spa-404')).toEqual(['anti-spa-404', 'auth']);
    expect(partitionCheckIds(['anti-spa-404', 'Anti-SPA-404', 'nope'])).toEqual({ known: ['anti-spa-404', 'anti-spa-404'], unknown: ['nope'] });
  });
});
