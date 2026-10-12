import { describe, it, expect, vi } from 'vitest';

vi.mock('../../v2/probes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../v2/probes')>();
  return {
    ...actual,
    runArs3Probes: vi.fn(async () => {
      throw new Error('probe engine crashed');
    }),
  };
});

import { runScan } from '../runScan';

describe('runScan when the ARS probe suite fails', () => {
  it('throws PROBES_FAILED instead of returning a discovery-only score', async () => {
    const events: any[] = [];
    const err = await runScan({ url: 'https://unreachable.example.com' }, { onProgress: (e) => events.push(e) }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('PROBES_FAILED');
    expect(events.some((e) => e.check === 'scoring')).toBe(false);
  }, 60000);

  it('rejects an unknown archetype override before probing', async () => {
    const err = await runScan({ url: 'https://unreachable.example.com', options: { archetypeOverride: 'bogus' } }).catch((e) => e);
    expect(err.code).toBe('INVALID_ARCHETYPE');
  });
});
