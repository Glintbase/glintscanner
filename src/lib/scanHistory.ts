/**
 * Per-company score history for scorecard pages.
 *
 * Scores produced by different score_versions use different rules and are NOT
 * comparable, so everything here keeps versions apart: entries are grouped by
 * score_version and chart segments only ever join scans of the same version.
 *
 * The pure helpers (normalize / group / chart layout) are framework-free so they
 * can be unit tested without Supabase; fetchScanHistory is the only I/O.
 */

import { createAdminSupabaseClient } from '@/lib/supabase/service';
import { ARS_SCORE_VERSION } from '@/lib/scanner/version';

export const SCAN_HISTORY_LIMIT = 50;

/** Row shape returned by the public_scans history query. */
export interface ScanHistoryRow {
  id: string;
  score: number | null;
  score_version: string | null;
  created_at: string;
  is_latest?: boolean | null;
  status?: string | null;
  grade?: string | null;
}

export interface ScanHistoryEntry {
  id: string;
  score: number;
  /** Raw score_version, or null when the row predates versioning. */
  scoreVersion: string | null;
  createdAt: string;
  isLatest: boolean;
  /** checks.scorecard.grade when the scan stored one; never derived. */
  grade: string | null;
}

export interface ScanHistoryGroup {
  /** Grouping key: score_version, or 'unknown'. */
  key: string;
  label: string;
  isCurrent: boolean;
  /** Oldest first, ready to draw left-to-right. */
  entries: ScanHistoryEntry[];
}

export const UNKNOWN_VERSION_KEY = 'unknown';

/** 'ars-3.2.0' -> 'ARS 3.2'; null -> 'Unversioned'. */
export function scoreVersionLabel(version: string | null | undefined): string {
  if (!version) return 'Unversioned';
  const m = /^ars-(\d+)\.(\d+)(?:\.(\d+))?$/i.exec(version);
  if (!m) return version;
  return m[3] && m[3] !== '0' ? `ARS ${m[1]}.${m[2]}.${m[3]}` : `ARS ${m[1]}.${m[2]}`;
}

function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

/** Newest first; ties broken by id so ordering is deterministic. */
function compareNewestFirst(a: ScanHistoryEntry, b: ScanHistoryEntry): number {
  const d = timeOf(b.createdAt) - timeOf(a.createdAt);
  if (d !== 0) return d;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Drops failed / incomplete / malformed rows, de-duplicates by id, sorts newest
 * first and caps the list. Rows without a status column are treated as complete
 * (older schemas only stored finished scans).
 */
export function normalizeHistoryRows(rows: ScanHistoryRow[] | null | undefined, limit = SCAN_HISTORY_LIMIT): ScanHistoryEntry[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: ScanHistoryEntry[] = [];
  for (const r of rows) {
    if (!r || typeof r.id !== 'string' || !r.id || seen.has(r.id)) continue;
    if (r.status != null && r.status !== 'complete') continue;
    if (typeof r.score !== 'number' || !Number.isFinite(r.score)) continue;
    if (typeof r.created_at !== 'string' || !Number.isFinite(timeOf(r.created_at))) continue;
    seen.add(r.id);
    out.push({
      id: r.id,
      score: r.score,
      scoreVersion: r.score_version || null,
      createdAt: r.created_at,
      isLatest: r.is_latest === true,
      grade: typeof r.grade === 'string' && r.grade.trim() ? r.grade.trim() : null,
    });
  }
  out.sort(compareNewestFirst);
  return out.slice(0, Math.max(0, limit));
}

/**
 * Groups entries by score_version. Groups are ordered by their most recent scan
 * (newest group first); entries inside a group are oldest first.
 */
export function groupHistoryByVersion(entries: ScanHistoryEntry[]): ScanHistoryGroup[] {
  const sorted = [...entries].sort(compareNewestFirst);
  const groups = new Map<string, ScanHistoryGroup>();
  for (const e of sorted) {
    const key = e.scoreVersion || UNKNOWN_VERSION_KEY;
    let g = groups.get(key);
    if (!g) {
      g = { key, label: scoreVersionLabel(e.scoreVersion), isCurrent: e.scoreVersion === ARS_SCORE_VERSION, entries: [] };
      groups.set(key, g);
    }
    g.entries.push(e);
  }
  return Array.from(groups.values()).map((g) => ({ ...g, entries: g.entries.reverse() }));
}

export interface HistoryChartPoint {
  entry: ScanHistoryEntry;
  groupKey: string;
  x: number;
  y: number;
}

export interface HistoryChartSeries {
  groupKey: string;
  points: HistoryChartPoint[];
  /** Polyline segments; each only contains points of this version. */
  segments: Array<Array<{ x: number; y: number }>>;
}

export interface HistoryChartLayout {
  width: number;
  height: number;
  padX: number;
  padY: number;
  series: HistoryChartSeries[];
}

/**
 * Lays scans out on an ordinal time axis (oldest left) with a fixed 0–100 y axis.
 * A version's line is broken wherever a scan of another version sits between two
 * of its scans, so a line never implies comparability across versions.
 */
export function layoutHistoryChart(
  groups: ScanHistoryGroup[],
  opts: { width?: number; height?: number; padX?: number; padY?: number } = {}
): HistoryChartLayout {
  const width = opts.width ?? 600;
  const height = opts.height ?? 160;
  const padX = opts.padX ?? 16;
  const padY = opts.padY ?? 14;

  const all: Array<{ entry: ScanHistoryEntry; groupKey: string }> = [];
  for (const g of groups) for (const entry of g.entries) all.push({ entry, groupKey: g.key });
  all.sort((a, b) => -compareNewestFirst(a.entry, b.entry)); // oldest first

  const n = all.length;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const xAt = (i: number) => (n <= 1 ? padX + innerW / 2 : padX + (innerW * i) / (n - 1));
  const yAt = (score: number) => padY + innerH * (1 - Math.max(0, Math.min(100, score)) / 100);

  const byGroup = new Map<string, HistoryChartSeries>();
  for (const g of groups) byGroup.set(g.key, { groupKey: g.key, points: [], segments: [] });

  let prevKey: string | null = null;
  all.forEach(({ entry, groupKey }, i) => {
    const s = byGroup.get(groupKey)!;
    const point = { entry, groupKey, x: xAt(i), y: yAt(entry.score) };
    s.points.push(point);
    // Continue the current segment only if the previous scan was the same version.
    if (prevKey === groupKey && s.segments.length > 0) {
      s.segments[s.segments.length - 1].push({ x: point.x, y: point.y });
    } else {
      s.segments.push([{ x: point.x, y: point.y }]);
    }
    prevKey = groupKey;
  });

  return { width, height, padX, padY, series: Array.from(byGroup.values()) };
}

/**
 * All complete scans for a company, newest first (capped). Returns [] on any error
 * or missing configuration — never invents data.
 */
export async function fetchScanHistory(companySlug: string, limit = SCAN_HISTORY_LIMIT): Promise<ScanHistoryEntry[]> {
  if (!companySlug || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const supabase = createAdminSupabaseClient();
    const query = (columns: string) =>
      supabase
        .from('public_scans')
        .select(columns)
        .eq('company_slug', companySlug.toLowerCase())
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .limit(limit);

    let { data, error } = await query('id, score, score_version, created_at, is_latest, status, grade:checks->scorecard->>grade');
    // Older schemas may lack status / is_latest: retry with the minimal column set.
    if (error && /status|is_latest|column/i.test(error.message)) {
      ({ data, error } = await query('id, score, score_version, created_at, grade:checks->scorecard->>grade'));
    }
    if (error) {
      console.error('fetchScanHistory error:', error.message);
      return [];
    }
    return normalizeHistoryRows(data as unknown as ScanHistoryRow[], limit);
  } catch (e: any) {
    console.error('fetchScanHistory failed:', e?.message || e);
    return [];
  }
}
