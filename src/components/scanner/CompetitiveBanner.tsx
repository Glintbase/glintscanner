import Link from "next/link";
import { Trophy, ArrowRight } from "lucide-react";
import { scoreBandTextClass } from "@/lib/scanner/shared";
import type { CompetitiveContext } from "@/lib/getCompetitiveContext";

interface CompetitiveBannerProps {
  context: CompetitiveContext;
  score: number;
  company: string;
}

/**
 * Leaderboard comparison strip on /scan/[slug]:
 * "Stripe scored 95 — you scored 74" + rank chip + CTA to /leaderboard.
 * Server-safe presentational component (no client hooks).
 */
export default function CompetitiveBanner({ context, score, company }: CompetitiveBannerProps) {
  const { leader, isLeader, rank, total } = context;
  const delta = leader ? leader.score - score : 0;

  return (
    <div className="w-full max-w-3xl mx-auto mb-8">
      <div className="glint-card relative rounded-2xl border border-white/10 overflow-hidden p-6 md:p-7">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,51,0,0.08),transparent_60%)] pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center gap-6">
          {/* Scores */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-mono text-white/30 uppercase tracking-[0.35em]">
              <Trophy size={12} className="text-[#FF3300]" />
              Leaderboard Standing
            </div>

            {isLeader ? (
              <>
                <p className="text-xl md:text-2xl font-black uppercase tracking-tight text-white leading-snug">
                  <span className={scoreBandTextClass(score)}>{company}</span> leads the board
                  with <span className={scoreBandTextClass(score)}>{score}</span>
                </p>
                <p className="text-xs text-white/40">
                  {leader
                    ? `${leader.company} is closest behind at ${leader.score}. Keep the lead.`
                    : "No challengers yet — the board is yours."}
                </p>
              </>
            ) : leader ? (
              <>
                <p className="text-xl md:text-2xl font-black uppercase tracking-tight text-white leading-snug">
                  {leader.company} scored{" "}
                  <span className={scoreBandTextClass(leader.score)}>{leader.score}</span> — you
                  scored <span className={scoreBandTextClass(score)}>{score}</span>
                </p>
                <p className="text-xs text-white/40">
                  {delta > 0
                    ? `${delta} point${delta === 1 ? "" : "s"} behind ${leader.company}.`
                    : `You matched ${leader.company}'s top score.`}
                </p>
              </>
            ) : null}

            {rank !== null && total !== null && (
              <span className="inline-flex items-center gap-1.5 mt-1 border border-white/10 bg-white/5 rounded-full px-3 py-1 text-[10px] font-mono text-white/50 uppercase tracking-widest">
                #{rank} of {total} ecosystems
              </span>
            )}
          </div>

          {/* CTA */}
          <div className="flex-shrink-0">
            <Link
              href="/leaderboard"
              className="inline-flex items-center gap-2 bg-[#FF3300] text-white font-black text-xs uppercase tracking-[0.25em] px-6 py-3.5 rounded-xl shadow-[0_0_30px_rgba(255,51,0,0.3)] hover:shadow-[0_0_40px_rgba(255,51,0,0.5)] hover:bg-[#FF3300]/90 transition-all whitespace-nowrap"
            >
              See the leaderboard <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
