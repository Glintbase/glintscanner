/**
 * Rescan every leaderboard domain with the current scoring model.
 *
 *   npx tsx --env-file=.env.local scripts/rescan-leaderboard.ts            # dry run: scan + print old vs new, write nothing
 *   npx tsx --env-file=.env.local scripts/rescan-leaderboard.ts --apply    # also save results (marks them is_latest)
 *
 * Options: --limit <n>  --concurrency <n> (default 2)  --force (rescan domains already on the current version)
 *
 * Runs the scan engine directly instead of calling /api/scan, which is rate limited to 5 scans/hour per IP.
 * Only run --apply against production after the new scoring code is deployed, so the site and the
 * stored scores agree.
 */

import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { runScan } from '../src/lib/scanner/core/runScan';
import { persistScan } from '../src/lib/scanner/persistScan';
import { deriveCompanySlug } from '../src/lib/scanner/shared/url';
import { ARS_SCORE_VERSION, isCurrentArsVersion } from '../src/lib/scanner/version';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};

const APPLY = flag('apply');
const FORCE = flag('force');
const LIMIT = option('limit', Infinity);
const CONCURRENCY = Math.max(1, option('concurrency', 2));

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase().replace(/^www\./, '');
  }
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (try --env-file=.env.local).');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await supabase
    .from('public_scans')
    .select('url, score, score_version, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Latest scan per domain, same dedupe as the leaderboard page.
  const latest = new Map<string, { url: string; score: number; score_version: string | null }>();
  for (const row of data || []) {
    const host = hostOf(row.url);
    if (!latest.has(host)) latest.set(host, row);
  }

  const queue = Array.from(latest.values())
    .filter((row) => FORCE || !isCurrentArsVersion(row.score_version))
    .slice(0, LIMIT);

  console.log(`${latest.size} domains on the leaderboard; rescanning ${queue.length} with ${ARS_SCORE_VERSION}${APPLY ? '' : ' (dry run, nothing saved)'}\n`);

  const results: Array<{ url: string; old: number; oldVersion: string; score?: number; grade?: string; coverage?: number; saved?: boolean; error?: string }> = [];
  let next = 0;

  async function worker() {
    while (next < queue.length) {
      const row = queue[next++];
      const entry: (typeof results)[number] = { url: row.url, old: row.score, oldVersion: row.score_version || 'unknown' };
      try {
        const result = await runScan({ url: row.url });
        entry.score = result.score;
        entry.grade = result.grade;
        entry.coverage = result.scorecard?.evidence?.baseCoverage;
        if (APPLY) {
          entry.saved = await persistScan(supabase, {
            result,
            url: row.url,
            scanId: randomUUID(),
            companySlug: deriveCompanySlug(row.url),
          });
        }
      } catch (e: any) {
        entry.error = e?.message || String(e);
      }
      results.push(entry);
      const delta = entry.score !== undefined ? entry.score - entry.old : undefined;
      console.log(
        entry.error
          ? `  ✗ ${row.url}: ${entry.error}`
          : `  ${String(entry.old).padStart(3)} → ${String(entry.score).padStart(3)} (${delta! >= 0 ? '+' : ''}${delta}) ${entry.grade}  coverage ${Math.round((entry.coverage ?? 0) * 100)}%  ${row.url}${APPLY ? (entry.saved ? '  saved' : '  NOT SAVED') : ''}`
      );
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const scored = results.filter((r) => r.score !== undefined);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  console.log(`\nDone: ${scored.length} scanned, ${results.length - scored.length} failed.`);
  console.log(`Average score: ${avg(scored.map((r) => r.old))} → ${avg(scored.map((r) => r.score!))}`);
  if (APPLY) console.log(`Saved: ${results.filter((r) => r.saved).length}/${scored.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
