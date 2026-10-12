import { describe, it, expect } from 'vitest';
import { layerChipsFromChecks } from '../layerChips';

describe('layerChipsFromChecks', () => {
  it('builds chips from scorecard layers only', () => {
    const chips = layerChipsFromChecks({
      scorecard: {
        layers: {
          discovery: { baseEarned: 15, baseMax: 20, applicable: true },
          access: { baseEarned: 6, baseMax: 30, applicable: true },
          usability: { baseEarned: 0, baseMax: 0, applicable: false },
          payments: { baseEarned: 0, baseMax: 0, applicable: false },
        },
      },
    });
    expect(chips).toEqual([
      { label: 'Discovery 15/20', earned: 15, max: 20, passed: true },
      { label: 'Access 6/30', earned: 6, max: 30, passed: false },
    ]);
  });

  it('returns no chips for legacy payloads', () => {
    expect(layerChipsFromChecks([{ category: 'context', results: [{ id: 'llms_txt', passed: true }] }])).toEqual([]);
    expect(layerChipsFromChecks({ surfaces: [] })).toEqual([]);
    expect(layerChipsFromChecks(null)).toEqual([]);
  });
});
