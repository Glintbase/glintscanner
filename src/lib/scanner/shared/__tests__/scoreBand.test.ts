import { describe, it, expect } from 'vitest';
import { scoreBand, scoreBandLabel, badgeColorForScore } from '../scoreBand';

describe('scoreBand (SPEC-06 unified bands)', () => {
  it('maps elite / friendly / capable / legacy thresholds', () => {
    expect(scoreBand(95).key).toBe('elite');
    expect(scoreBand(90).key).toBe('elite');
    expect(scoreBand(89).key).toBe('friendly');
    expect(scoreBand(74).key).toBe('friendly');
    expect(scoreBand(70).key).toBe('friendly');
    expect(scoreBand(69).key).toBe('capable');
    expect(scoreBand(40).key).toBe('capable');
    expect(scoreBand(39).key).toBe('legacy');
    expect(scoreBand(0).key).toBe('legacy');
  });

  it('returns consistent labels for UI and home chips', () => {
    expect(scoreBandLabel(74)).toBe('AI-Friendly');
    expect(scoreBandLabel(95)).toBe('Agent-Native');
    expect(scoreBandLabel(38)).toBe('Legacy Ecosystem');
  });

  it('badge colors match band hex', () => {
    expect(badgeColorForScore(95)).toBe(scoreBand(95).colorHex);
    expect(badgeColorForScore(50)).toBe(scoreBand(50).colorHex);
  });
});
