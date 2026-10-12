import { describe, it, expect } from 'vitest';
import { scoreBand, scoreBandLabel, badgeColorForScore, getArsGrade } from '../scoreBand';

describe('scoreBand (SPEC-06 unified bands)', () => {
  it('maps elite / friendly / capable / legacy thresholds', () => {
    expect(scoreBand(95).key).toBe('elite');
    expect(scoreBand(86).key).toBe('elite');
    expect(scoreBand(85).key).toBe('friendly');
    expect(scoreBand(70).key).toBe('friendly');
    expect(scoreBand(69).key).toBe('capable');
    expect(scoreBand(48).key).toBe('capable');
    expect(scoreBand(47).key).toBe('legacy');
    expect(scoreBand(0).key).toBe('legacy');
  });

  it('never disagrees with the letter grade', () => {
    const bandForGrade: Record<string, string> = { 'A+': 'elite', A: 'elite', B: 'friendly', C: 'capable', D: 'legacy', F: 'legacy' };
    for (let score = 0; score <= 100; score++) {
      expect(scoreBand(score).key).toBe(bandForGrade[getArsGrade(score).grade]);
    }
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
