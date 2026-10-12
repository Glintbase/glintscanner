import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isCurrentArsVersion } from '@/lib/scanner/version';
import { deriveCompanySlug } from '@/lib/scanner/shared/url';
import { fetchLeaderboardScanRows, dedupeLatestBySlug } from '@/lib/leaderboardRows';

export interface CompetitiveContext {
  /** Top-scoring company excluding the scanned one (null when the user IS #1 and no runner-up exists). */
  leader: { company: string; score: number } | null;
  /** True when the scanned company holds the top spot. */
  isLeader: boolean;
  /** 1-based rank of the scanned company among deduped companies (null when unranked). */
  rank: number | null;
  /** Total deduped companies on the board. */
  total: number;
}

/**
 * Leaderboard context for the competitive banner / scorecard image.
 * Same dedupe as the leaderboard (one scan per company slug), current scoring model only.
 * Returns null when the board is unavailable or has nothing comparable: callers
 * omit the competitive line rather than show an invented rival.
 */
export async function getCompetitiveContext(scanUrl: string): Promise<CompetitiveContext | null> {
  const ownSlug = deriveCompanySlug(scanUrl);

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await fetchLeaderboardScanRows(supabase);
    if (error || !data || data.length === 0) return null;

    // Only compare scores from the current scoring model.
    const current = data.filter((row) => isCurrentArsVersion(row.score_version));
    if (current.length === 0) return null;

    const sorted = dedupeLatestBySlug(current).sort((a, b) => b.score - a.score);
    const total = sorted.length;
    const ownIndex = sorted.findIndex((d) => d.slug === ownSlug);
    const rank = ownIndex >= 0 ? ownIndex + 1 : null;
    const isLeader = ownIndex === 0;

    // Leader is the best company that ISN'T the scanned one
    const rival = sorted.find((d) => d.slug !== ownSlug);
    const leader = rival ? { company: rival.company, score: rival.score } : null;

    if (!leader && !isLeader) return null;

    return { leader, isLeader, rank, total };
  } catch (err) {
    console.error('Competitive context fetch error:', err);
    return null;
  }
}
