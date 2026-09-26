import { describe, it, expect } from 'vitest';
import { pickBestScan } from './resolveSlug';

describe('pickBestScan', () => {
  it('returns null for empty or null candidates', () => {
    expect(pickBestScan([])).toBeNull();
    expect(pickBestScan(null as any)).toBeNull();
  });

  it('prioritizes ARS 3.0 scan marked as is_latest: true over legacy scan with is_latest: true', () => {
    const candidates = [
      { id: 'scan-ars-3', score_version: 'ars-3.0.0', is_latest: true, created_at: '2026-09-25T12:00:00Z', score: 85 },
      { id: 'scan-legacy', score_version: 'ars-1.0.0', is_latest: true, created_at: '2026-09-20T12:00:00Z', score: 40 },
    ];

    const result = pickBestScan(candidates);
    expect(result).toEqual(candidates[0]);
    expect(result.id).toBe('scan-ars-3');
  });

  it('prioritizes ARS 3.0 scan even if a legacy scan is marked is_latest and ARS 3.0 is not yet marked is_latest', () => {
    const candidates = [
      { id: 'scan-ars-3-recent', score_version: 'ars-3.0.0', is_latest: false, created_at: '2026-09-25T12:00:00Z', score: 88 },
      { id: 'scan-legacy-latest', score_version: 'ars-1.0.0', is_latest: true, created_at: '2026-09-20T12:00:00Z', score: 32 },
    ];

    const result = pickBestScan(candidates);
    expect(result.id).toBe('scan-ars-3-recent');
    expect(result.score_version).toBe('ars-3.0.0');
  });

  it('picks the newest ARS 3.0 scan when multiple ARS 3.0 scans exist', () => {
    const candidates = [
      { id: 'scan-ars-3-new', score_version: 'ars-3.0.0', is_latest: true, created_at: '2026-09-25T15:00:00Z', score: 92 },
      { id: 'scan-ars-3-old', score_version: 'ars-3.0.0', is_latest: false, created_at: '2026-09-25T10:00:00Z', score: 75 },
    ];

    const result = pickBestScan(candidates);
    expect(result.id).toBe('scan-ars-3-new');
  });

  it('falls back to is_latest when no ARS 3.0 scans exist', () => {
    const candidates = [
      { id: 'scan-v2', score_version: 'ars-2.0.0', is_latest: true, created_at: '2026-09-10T12:00:00Z', score: 60 },
      { id: 'scan-v1', score_version: 'ars-1.0.0', is_latest: false, created_at: '2026-09-05T12:00:00Z', score: 30 },
    ];

    const result = pickBestScan(candidates);
    expect(result.id).toBe('scan-v2');
  });

  it('falls back to the first candidate (newest created_at) if no is_latest flag is true', () => {
    const candidates = [
      { id: 'scan-legacy-newer', score_version: 'ars-1.0.0', is_latest: false, created_at: '2026-09-15T12:00:00Z', score: 50 },
      { id: 'scan-legacy-older', score_version: 'ars-1.0.0', is_latest: false, created_at: '2026-09-10T12:00:00Z', score: 40 },
    ];

    const result = pickBestScan(candidates);
    expect(result.id).toBe('scan-legacy-newer');
  });
});
