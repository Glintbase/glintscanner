import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface CompetitiveContext {
  /** Top-scoring domain excluding the scanned domain (null when the user IS #1 and no runner-up exists). */
  leader: { company: string; score: number } | null;
  /** True when the scanned domain holds the top spot. */
  isLeader: boolean;
  /** 1-based rank of the scanned domain among deduped domains (null when unknown). */
  rank: number | null;
  /** Total deduped domains on the board (null when unknown). */
  total: number | null;
}

/** Fallback when the DB is empty/unavailable — matches the demo EXAMPLES data. */
const FALLBACK: CompetitiveContext = {
  leader: { company: 'Stripe', score: 95 },
  isLeader: false,
  rank: null,
  total: null,
};

function toHostname(url: string): string {
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url.replace(/^https?:\/\//i, '').split('/')[0];
  }
  return hostname.toLowerCase().replace(/^www\./i, '');
}

function toCompany(hostname: string): string {
  let company = hostname.split('.')[0];
  if (company === 'docs' || company === 'www' || company === 'developer' || company === 'dev') {
    company = hostname.split('.')[1] || company;
  }
  return company.charAt(0).toUpperCase() + company.slice(1);
}

/**
 * Leaderboard context for the competitive banner on /scan/[slug].
 * Reuses the leaderboard's domain-dedup approach (highest score per domain).
 */
export async function getCompetitiveContext(scanUrl: string): Promise<CompetitiveContext> {
  const ownDomain = toHostname(scanUrl);

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('public_scans')
      .select('url, score, created_at')
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) return FALLBACK;

    // Deduplicate by domain — keep most recent scan per domain
    const domainMap = new Map<string, { hostname: string; score: number }>();
    for (const item of data) {
      const hostname = toHostname(item.url);
      if (!domainMap.has(hostname)) {
        domainMap.set(hostname, { hostname, score: item.score });
      }
    }

    const sorted = Array.from(domainMap.values()).sort((a, b) => b.score - a.score);
    const total = sorted.length;
    const ownIndex = sorted.findIndex((d) => d.hostname === ownDomain);
    const rank = ownIndex >= 0 ? ownIndex + 1 : null;
    const isLeader = ownIndex === 0;

    // Leader is the best domain that ISN'T the scanned one
    const rival = sorted.find((d) => d.hostname !== ownDomain);
    const leader = rival ? { company: toCompany(rival.hostname), score: rival.score } : null;

    if (!leader && !isLeader) return FALLBACK;

    return { leader, isLeader, rank, total };
  } catch (err) {
    console.error('Competitive context fetch error:', err);
    return FALLBACK;
  }
}
