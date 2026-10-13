import { describe, it, expect } from 'vitest';
import {
  normalizeHistoryRows,
  groupHistoryByVersion,
  layoutHistoryChart,
  scoreVersionLabel,
  type ScanHistoryRow,
} from './scanHistory';
import { ARS_SCORE_VERSION } from './scanner/version';

const row = (over: Partial<ScanHistoryRow> & { id: string; created_at: string }): ScanHistoryRow => ({
  score: 50,
  score_version: ARS_SCORE_VERSION,
  is_latest: false,
  status: 'complete',
  grade: null,
  ...over,
});

describe('normalizeHistoryRows', () => {
  it('returns [] for null / non-array input', () => {
    expect(normalizeHistoryRows(null)).toEqual([]);
    expect(normalizeHistoryRows(undefined)).toEqual([]);
    expect(normalizeHistoryRows({} as any)).toEqual([]);
  });

  it('sorts newest first with a deterministic id tiebreak', () => {
    const out = normalizeHistoryRows([
      row({ id: 'b', created_at: '2026-09-01T00:00:00Z' }),
      row({ id: 'c', created_at: '2026-10-01T00:00:00Z' }),
      row({ id: 'a2', created_at: '2026-09-01T00:00:00Z' }),
    ]);
    expect(out.map((e) => e.id)).toEqual(['c', 'a2', 'b']);
  });

  it('drops failed, incomplete and malformed rows and duplicate ids', () => {
    const out = normalizeHistoryRows([
      row({ id: 'ok', created_at: '2026-10-01T00:00:00Z' }),
      row({ id: 'failed', created_at: '2026-10-02T00:00:00Z', status: 'failed' }),
      row({ id: 'running', created_at: '2026-10-03T00:00:00Z', status: 'running' }),
      row({ id: 'noscore', created_at: '2026-10-04T00:00:00Z', score: null }),
      row({ id: 'nan', created_at: '2026-10-04T00:00:00Z', score: Number.NaN }),
      row({ id: 'baddate', created_at: 'not-a-date' }),
      row({ id: 'ok', created_at: '2026-10-05T00:00:00Z' }),
      // No status column (older schema) counts as complete.
      { id: 'legacy', score: 70, score_version: 'ars-1.0.0', created_at: '2026-07-01T00:00:00Z' },
    ]);
    expect(out.map((e) => e.id)).toEqual(['ok', 'legacy']);
    expect(out[0].createdAt).toBe('2026-10-01T00:00:00Z');
  });

  it('maps fields and only keeps a stored grade', () => {
    const [e] = normalizeHistoryRows([
      row({ id: 'x', created_at: '2026-10-01T00:00:00Z', score: 81, grade: ' B ', is_latest: true }),
    ]);
    expect(e).toEqual({
      id: 'x',
      score: 81,
      scoreVersion: ARS_SCORE_VERSION,
      createdAt: '2026-10-01T00:00:00Z',
      isLatest: true,
      grade: 'B',
    });
    const [legacy] = normalizeHistoryRows([row({ id: 'y', created_at: '2026-10-01T00:00:00Z', score_version: null, grade: '' })]);
    expect(legacy.grade).toBeNull();
    expect(legacy.scoreVersion).toBeNull();
  });

  it('caps the number of rows, keeping the newest', () => {
    const rows = Array.from({ length: 60 }, (_, i) =>
      row({ id: `s${i}`, created_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() })
    );
    const out = normalizeHistoryRows(rows, 50);
    expect(out).toHaveLength(50);
    expect(out[0].id).toBe('s59');
    expect(out[49].id).toBe('s10');
  });
});

describe('groupHistoryByVersion', () => {
  const entries = normalizeHistoryRows([
    row({ id: 'v1-a', created_at: '2026-07-01T00:00:00Z', score_version: 'ars-1.0.0', score: 82 }),
    row({ id: 'v1-b', created_at: '2026-07-02T00:00:00Z', score_version: 'ars-1.0.0', score: 67 }),
    row({ id: 'v3-a', created_at: '2026-09-15T00:00:00Z', score_version: 'ars-3.0.0', score: 83 }),
    row({ id: 'cur-a', created_at: '2026-10-12T00:00:00Z', score: 81 }),
    row({ id: 'cur-b', created_at: '2026-10-13T00:00:00Z', score: 80 }),
    row({ id: 'nov', created_at: '2026-06-01T00:00:00Z', score_version: null, score: 40 }),
  ]);

  it('groups by score_version, newest group first, entries oldest first', () => {
    const groups = groupHistoryByVersion(entries);
    expect(groups.map((g) => g.key)).toEqual([ARS_SCORE_VERSION, 'ars-3.0.0', 'ars-1.0.0', 'unknown']);
    expect(groups[0].isCurrent).toBe(true);
    expect(groups.slice(1).every((g) => !g.isCurrent)).toBe(true);
    expect(groups[0].entries.map((e) => e.id)).toEqual(['cur-a', 'cur-b']);
    expect(groups[2].entries.map((e) => e.id)).toEqual(['v1-a', 'v1-b']);
    expect(groups[3].label).toBe('Unversioned');
  });

  it('never mixes versions inside a group', () => {
    for (const g of groupHistoryByVersion(entries)) {
      for (const e of g.entries) expect(e.scoreVersion || 'unknown').toBe(g.key);
    }
  });
});

describe('layoutHistoryChart', () => {
  it('places scans left-to-right oldest first and never joins different versions', () => {
    // Interleaved versions: current, legacy, current — the current-version line must break.
    const entries = normalizeHistoryRows([
      row({ id: 'c1', created_at: '2026-10-01T00:00:00Z', score: 80 }),
      row({ id: 'l1', created_at: '2026-10-02T00:00:00Z', score_version: 'ars-1.0.0', score: 60 }),
      row({ id: 'c2', created_at: '2026-10-03T00:00:00Z', score: 90 }),
      row({ id: 'c3', created_at: '2026-10-04T00:00:00Z', score: 100 }),
    ]);
    const chart = layoutHistoryChart(groupHistoryByVersion(entries), { width: 100, height: 100, padX: 0, padY: 0 });
    const cur = chart.series.find((s) => s.groupKey === ARS_SCORE_VERSION)!;
    const legacy = chart.series.find((s) => s.groupKey === 'ars-1.0.0')!;

    expect(cur.points.map((p) => [p.entry.id, Math.round(p.x)])).toEqual([
      ['c1', 0],
      ['c2', 67],
      ['c3', 100],
    ]);
    expect(legacy.points.map((p) => Math.round(p.x))).toEqual([33]);
    // c1 stands alone; c2–c3 form one segment.
    expect(cur.segments.map((s) => s.length)).toEqual([1, 2]);
    expect(legacy.segments.map((s) => s.length)).toEqual([1]);
    // y axis is a fixed 0–100 scale (top = 100).
    expect(cur.points[2].y).toBe(0);
    expect(cur.points[0].y).toBeCloseTo(20);
  });

  it('centres a single point', () => {
    const entries = normalizeHistoryRows([row({ id: 'only', created_at: '2026-10-01T00:00:00Z', score: 50 })]);
    const chart = layoutHistoryChart(groupHistoryByVersion(entries), { width: 200, height: 100, padX: 0, padY: 0 });
    expect(chart.series[0].points[0].x).toBe(100);
    expect(chart.series[0].points[0].y).toBe(50);
  });
});

describe('scoreVersionLabel', () => {
  it('formats ARS versions', () => {
    expect(scoreVersionLabel('ars-3.2.0')).toBe('ARS 3.2');
    expect(scoreVersionLabel('ars-1.0.0')).toBe('ARS 1.0');
    expect(scoreVersionLabel('ars-3.1.4')).toBe('ARS 3.1.4');
    expect(scoreVersionLabel(null)).toBe('Unversioned');
    expect(scoreVersionLabel('custom')).toBe('custom');
  });
});
