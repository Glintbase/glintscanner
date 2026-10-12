/**
 * Shared persistence for scan results, used by /api/scan and scripts/rescan-leaderboard.ts.
 * Framework-free: callers pass the Supabase admin client and handle cache revalidation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScanResult } from './core/runScan';
import { scanLog } from './v2/scanLogger';

export function buildChecksPayload(result: ScanResult, scanId: string, companySlug: string) {
  return {
    surfaces: result.surfaces,
    pages: result.pages,
    framework: result.framework,
    graph: result.graph,
    journeys: result.journeys,
    dimensions: result.dimensions,
    score_version: result.score_version,
    grade: result.grade,
    gradeLabel: result.gradeLabel,
    archetype: result.archetype,
    scorecard: result.scorecard,
    meta: {
      duration_ms: result.duration_ms,
      score_version: result.score_version,
      discovery_score: result.discovery_score,
      scan_id: scanId,
      status: 'complete',
      company_slug: companySlug,
      grade: result.grade,
      archetype: result.archetype?.label || result.archetype?.archetype,
    },
  };
}

export interface PersistScanInput {
  result: ScanResult;
  /** URL as requested (may differ from result.url after redirects). */
  url: string;
  scanId: string;
  companySlug: string;
}

/**
 * Marks older scans for the company / URL as not latest, then inserts this scan.
 * Returns true when the scan row was written.
 */
export async function persistScan(supabaseAdmin: SupabaseClient, input: PersistScanInput): Promise<boolean> {
  const { result, url, scanId, companySlug } = input;
  const checksPayload = buildChecksPayload(result, scanId, companySlug);

  // Soft-mark older scans for this company / URL as not latest.
  // Update both by company_slug and url to catch legacy rows where company_slug was NULL.
  for (const [column, value] of [
    ['company_slug', companySlug],
    ['url', url],
    ...(result.url && result.url !== url ? [['url', result.url]] : []),
  ] as Array<[string, string]>) {
    try {
      await supabaseAdmin.from('public_scans').update({ is_latest: false }).eq(column, value).eq('is_latest', true);
    } catch (e: any) {
      scanLog('warn', 'soft_history_update_failed', { scanId, column, error: e?.message });
    }
  }

  const insertRow: Record<string, unknown> = {
    id: scanId,
    url: result.url,
    score: result.score,
    checks: checksPayload,
    score_version: result.score_version,
    dimension_scores: Object.fromEntries(result.dimensions.map((d) => [d.name, d.score])),
    duration_ms: result.duration_ms,
    company_slug: companySlug,
    is_latest: true,
    status: 'complete',
  };

  let { data, error: dbError } = await supabaseAdmin.from('public_scans').insert([insertRow]).select('id').single();

  // Older schemas may lack some columns: retry with progressively slimmer rows.
  if (dbError && /column|score_version|company_slug|is_latest|status|dimension/i.test(dbError.message)) {
    const attempts = [
      { id: scanId, url: result.url, score: result.score, checks: checksPayload, score_version: result.score_version, company_slug: companySlug, is_latest: true },
      { id: scanId, url: result.url, score: result.score, checks: checksPayload, company_slug: companySlug },
      { id: scanId, url: result.url, score: result.score, checks: checksPayload },
      { url: result.url, score: result.score, checks: checksPayload },
    ];
    for (const row of attempts) {
      const res = await supabaseAdmin.from('public_scans').insert([row]).select('id').single();
      if (!res.error && res.data) {
        data = res.data;
        dbError = null;
        break;
      }
      dbError = res.error;
    }
  }

  if (dbError) {
    scanLog('error', 'db_insert_failed', { scanId, error: dbError.message });
    return false;
  }
  return Boolean(data);
}
