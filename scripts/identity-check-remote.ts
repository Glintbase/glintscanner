/**
 * Ask the deployed scanner to scan every leaderboard domain as each identity (browser, agent)
 * from Vercel's network, via the signed /api/internal/identity-check endpoint. Read-only.
 *
 *   npx tsx --env-file=.env.local scripts/identity-check-remote.ts --out results.jsonl [--base https://scan.glintbase.dev] [--concurrency 3] [--only host1,host2]
 *
 * Identity order alternates per domain so neither identity is always first.
 */

import { appendFileSync, writeFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { fetchLeaderboardScanRows, dedupeLatestBySlug } from '../src/lib/leaderboardRows';
import { signInternalRequest } from '../src/lib/scanner/internalAuth';

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const OUT = opt('out') || 'identity-check.jsonl';
const BASE = (opt('base') || 'https://scan.glintbase.dev').replace(/\/$/, '');
const CONCURRENCY = Number(opt('concurrency') || 3);
const ONLY = opt('only')?.split(',').map((h) => h.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean);

async function main() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await fetchLeaderboardScanRows(supabase);
  if (error) throw error;
  const rows = dedupeLatestBySlug(data || []).filter(
    (row) => !ONLY || ONLY.includes(new URL(row.url).hostname.toLowerCase().replace(/^www\./, ''))
  );
  writeFileSync(OUT, '');
  console.log(`${rows.length} domains via ${BASE}`);

  let next = 0;
  async function worker() {
    while (next < rows.length) {
      const idx = next++;
      const url = rows[idx].url;
      const body = JSON.stringify({ url, order: idx % 2 ? ['agent', 'browser'] : ['browser', 'agent'] });
      const ts = String(Date.now());
      let line: Record<string, unknown>;
      try {
        const res = await fetch(`${BASE}/api/internal/identity-check`, {
          method: 'POST',
          body,
          headers: {
            'content-type': 'application/json',
            'x-glintbase-timestamp': ts,
            'x-glintbase-signature': signInternalRequest(secret, ts, body),
          },
          signal: AbortSignal.timeout(320_000),
        });
        line = res.ok ? await res.json() : { url, error: `HTTP ${res.status}` };
      } catch (e: any) {
        line = { url, error: e?.message || String(e) };
      }
      appendFileSync(OUT, JSON.stringify(line) + '\n');
      console.log(`  ${idx + 1}/${rows.length} ${url}${line.error ? `  ERROR ${line.error}` : ''}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
