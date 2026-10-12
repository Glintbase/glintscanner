/**
 * Demote "latest" scans that were scored while the target's homepage was unreachable, and
 * restore the most recent valid scan for the same company as the latest.
 *
 *   npx tsx --env-file=.env.local scripts/repair-unreachable-scans.ts            # dry run
 *   npx tsx --env-file=.env.local scripts/repair-unreachable-scans.ts --apply
 *
 * Needed once for scans saved before runScan refused unreachable targets (TARGET_UNREACHABLE).
 */

import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const UNREACHABLE = /Homepage could not be fetched/;

function homepageFailed(row: any): boolean {
  const check = (row.checks?.scorecard?.results || []).find((c: any) => c.checkId === 'content-no-js');
  // Scans saved after the TARGET_UNREACHABLE fix record targetReachable; those reached the site
  // (e.g. a bot wall) and are legitimate.
  if (row.checks?.scorecard?.evidence?.targetReachable === true) return false;
  return check?.status === 'skip' && UNREACHABLE.test(check.message || '');
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: latest, error } = await sb
    .from('public_scans')
    .select('id, url, score, score_version, company_slug, checks, created_at')
    .eq('is_latest', true);
  if (error) throw error;

  const bad = (latest || []).filter(homepageFailed);
  console.log(`${bad.length} latest scans were scored with an unreachable homepage${APPLY ? '' : ' (dry run)'}\n`);

  for (const row of bad) {
    const { data: history } = await sb
      .from('public_scans')
      .select('id, url, score, score_version, checks, created_at')
      .eq('company_slug', row.company_slug)
      .neq('id', row.id)
      .order('created_at', { ascending: false })
      .limit(20);
    const previous = (history || []).find((h: any) => !homepageFailed(h));

    console.log(`  ${row.url}: ${row.score} (${row.created_at}) -> ${previous ? `restore ${previous.score} (${previous.score_version}, ${previous.created_at})` : 'no valid earlier scan; demote only'}`);
    if (!APPLY) continue;

    await sb.from('public_scans').update({ is_latest: false }).eq('id', row.id);
    if (previous) await sb.from('public_scans').update({ is_latest: true }).eq('id', previous.id);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
