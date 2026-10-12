import { createClient } from '@supabase/supabase-js';
(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.from('public_scans').select('id, url, score, checks, created_at').eq('is_latest', true).eq('score_version', 'ars-3.2.0');
  if (error) throw error;
  for (const r of data as any[]) {
    const c = (r.checks?.scorecard?.results || []).find((x: any) => x.checkId === 'content-no-js');
    if (c?.status === 'skip' && /Homepage could not be fetched/.test(c.message || '')) console.log(r.score, r.url, r.created_at);
  }
})();
