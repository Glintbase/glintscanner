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
import { fetchLeaderboardScanRows, dedupeLatestBySlug } from '../src/lib/leaderboardRows';
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
// --only host1,host2 rescans just those hosts (matched against the stored URL's hostname).
const ONLY = (() => {
  const i = args.indexOf('--only');
  return i >= 0 && args[i + 1] ? args[i + 1].split(',').map((h) => h.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean) : null;
})();
const CONCURRENCY = Math.max(1, option('concurrency', 2));

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (try --env-file=.env.local).');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Pages through every row (a single response stops at 1000 rows).
  const { data, error } = await fetchLeaderboardScanRows(supabase);
  if (error) throw error;

  // Latest scan per company slug, same dedupe as the leaderboard page.
  const latest = dedupeLatestBySlug(data || []);

  const queue = latest
    .filter((row) => FORCE || ONLY !== null || !isCurrentArsVersion(row.score_version))
    .filter((row) => {
      if (!ONLY) return true;
      try {
        const host = new URL(row.url).hostname.toLowerCase().replace(/^www\./, '');
        return ONLY.some((h) => host === h || row.url.toLowerCase().includes(h));
      } catch {
        return false;
      }
    })
    .slice(0, LIMIT);

  console.log(`${latest.length} companies on the leaderboard; rescanning ${queue.length} with ${ARS_SCORE_VERSION}${APPLY ? '' : ' (dry run, nothing saved)'}\n`);

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
