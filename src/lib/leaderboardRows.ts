/**
 * Shared leaderboard data access: pages through public_scans (PostgREST caps a
 * single response at 1000 rows) and keeps one scan per company slug.
 * Framework-free: used by the leaderboard page, the competitive banner and
 * scripts/rescan-leaderboard.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveCompanySlug, deriveCompany } from './scanner/shared/url';

export const SUPABASE_PAGE_SIZE = 1000;
/** Hard stop so a runaway table never turns one page view into hundreds of requests. */
const MAX_ROWS = 100_000;

export interface LeaderboardScanRow {
  id: string;
  url: string;
  score: number;
  score_version: string | null;
  created_at: string;
  /** Absent on schemas without the column. */
  is_latest?: boolean | null;
}

export interface LeaderboardEntry extends LeaderboardScanRow {
  slug: string;
  company: string;
}

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Calls makePage(from, to) for consecutive ranges until a short page is returned.
 * makePage must build a fresh, deterministically ordered query for each call.
 */
export async function fetchAllPages<T>(
  makePage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = SUPABASE_PAGE_SIZE,
  maxRows = MAX_ROWS
): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await makePage(from, from + pageSize - 1);
    if (error) return { data: rows.length ? rows : null, error };
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { data: rows, error: null };
}

/** Every scan row needed for ranking, newest first, across all pages. */
export async function fetchLeaderboardScanRows(supabase: SupabaseClient): Promise<PageResult<LeaderboardScanRow>> {
  const withLatest = await fetchAllPages<LeaderboardScanRow>((from, to) =>
    supabase
      .from('public_scans')
      .select('id, url, score, score_version, created_at, is_latest')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<PageResult<LeaderboardScanRow>>
  );
  if (!withLatest.error || !/is_latest/i.test(withLatest.error.message)) return withLatest;

  // Older schema without is_latest.
  return fetchAllPages<LeaderboardScanRow>((from, to) =>
    supabase
      .from('public_scans')
      .select('id, url, score, score_version, created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<PageResult<LeaderboardScanRow>>
  );
}

/**
 * One entry per company slug (deriveCompanySlug), keeping the newest scan that is
 * not explicitly superseded (is_latest = false marks history and non-canonical runs).
 * Input must be ordered newest first.
 */
export function dedupeLatestBySlug(rows: LeaderboardScanRow[]): LeaderboardEntry[] {
  const bySlug = new Map<string, LeaderboardEntry>();
  for (const row of rows) {
    if (!row?.url || typeof row.score !== 'number') continue;
    if (row.is_latest === false) continue;
    const slug = deriveCompanySlug(row.url);
    if (bySlug.has(slug)) continue;
    bySlug.set(slug, { ...row, slug, company: deriveCompany(row.url) });
  }
  return Array.from(bySlug.values());
}
