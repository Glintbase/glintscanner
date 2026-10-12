import { describe, it, expect } from 'vitest';
import { fetchAllPages, dedupeLatestBySlug, type LeaderboardScanRow } from '../leaderboardRows';

const row = (id: string, url: string, score: number, extra: Partial<LeaderboardScanRow> = {}): LeaderboardScanRow => ({
  id,
  url,
  score,
  score_version: '3.2',
  created_at: '2026-01-01',
  ...extra,
});

describe('fetchAllPages', () => {
  it('keeps requesting ranges until a short page arrives', async () => {
    const all = Array.from({ length: 2500 }, (_, i) => i);
    const ranges: Array<[number, number]> = [];
    const { data, error } = await fetchAllPages<number>(async (from, to) => {
      ranges.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(2500);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('surfaces errors', async () => {
    const { error } = await fetchAllPages<number>(async () => ({ data: null, error: { message: 'boom' } }));
    expect(error?.message).toBe('boom');
  });
});

describe('dedupeLatestBySlug', () => {
  it('keeps the newest non-superseded scan per company slug', () => {
    const rows = [
      row('override', 'https://stripe.com', 99, { is_latest: false }),
      row('new', 'https://docs.stripe.com', 80, { is_latest: true }),
      row('old', 'https://stripe.com', 70, { is_latest: true }),
      row('evil', 'https://stripe.attacker.com', 100),
      row('next', 'https://github.com/vercel/next.js', 60),
    ];
    const out = dedupeLatestBySlug(rows);
    expect(out.map((r) => [r.slug, r.id, r.company])).toEqual([
      ['stripe', 'new', 'Stripe'],
      ['attacker', 'evil', 'Attacker'],
      ['next-js', 'next', 'Next-js'],
    ]);
  });
});
