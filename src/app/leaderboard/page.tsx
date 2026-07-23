import { Search, Trophy } from "lucide-react";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SiteNav } from "@/components/layout/SiteNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import LeaderboardClient from "./LeaderboardClient";

export const dynamic = 'force-dynamic';

export default async function Leaderboard() {
  let leaderboardData: {
    rank: number;
    company: string;
    url: string;
    score: number;
    id: string | null;
  }[] = [];

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('public_scans')
      .select('id, url, score, created_at')
      .order('score', { ascending: false });


    if (!error && data && data.length > 0) {
      // Deduplicate by domain — keep highest score per domain
      const domainMap = new Map<string, { id: string; url: string; score: number; company: string }>();

      for (const item of data) {
        let hostname = item.url;
        try {
          hostname = new URL(item.url).hostname;
        } catch {
          hostname = item.url.replace(/^https?:\/\//i, '').split('/')[0];
        }
        hostname = hostname.toLowerCase().replace(/^www\./i, '');

        const existing = domainMap.get(hostname);
        if (!existing || existing.score < item.score) {
          // Derive a display name from the hostname
          let company = hostname.split('.')[0];
          if (company === 'docs' || company === 'www' || company === 'developer' || company === 'dev') {
            company = hostname.split('.')[1] || company;
          }
          company = company.charAt(0).toUpperCase() + company.slice(1);

          domainMap.set(hostname, {
            id: item.id,
            url: item.url,
            score: item.score,
            company,
          });
        }
      }

      // Convert to sorted array
      const sorted: { id: string; url: string; score: number; company: string }[] = [];
      domainMap.forEach((val) => sorted.push(val));
      sorted.sort((a, b) => b.score - a.score);

      leaderboardData = sorted.map((item, index) => ({
        rank: index + 1,
        ...item,
      }));
    }
  } catch (err) {
    console.error('Leaderboard fetch error:', err);
  }

  const isEmpty = leaderboardData.length === 0;

  return (
    <>
      <SiteNav />
      {/* Grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(255,51,0,0.06),transparent)] pointer-events-none" />
      <main className="flex-1 flex flex-col items-center pt-32 pb-20 px-4 w-full">
      <div className="flex flex-col items-center text-center mb-6">
        <Trophy size={48} className="text-[#FF3300] drop-shadow-[0_0_20px_rgba(255,51,0,0.4)] mb-6" />
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4 text-white">
          Agent Readiness Leaderboard
        </h1>
        <p className="text-sm md:text-base text-white/40 max-w-2xl leading-relaxed">
          The top developer ecosystems, ranked by how easily AI coding agents can discover, parse, and implement against them.
          Rankings are powered by real scans — updated live.
        </p>
        {!isEmpty && (
          <p className="mt-3 text-xs text-white/25 font-mono">
            {leaderboardData.length} unique site{leaderboardData.length !== 1 ? 's' : ''} ranked
          </p>
        )}
      </div>

      {isEmpty ? (
        <div className="w-full max-w-md bg-surface-900 border border-white/5 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col items-center justify-center py-24 px-8 text-center mt-12">
          <Trophy size={40} className="text-white/10 mb-4" />
          <p className="text-white/40 font-mono text-sm mb-2">No scans yet</p>
          <p className="text-white/20 text-xs max-w-xs">
            Be the first to scan a documentation site. Results will appear here in real time.
          </p>
        </div>
      ) : (
        <LeaderboardClient initialData={leaderboardData} />
      )}

      <div className="mt-16 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-[#FF3300] text-white font-black text-xs uppercase tracking-[0.25em] px-8 py-4 rounded-xl shadow-[0_0_30px_rgba(255,51,0,0.3)] hover:shadow-[0_0_40px_rgba(255,51,0,0.5)] hover:bg-[#FF3300]/90 transition-all"
        >
          <Search size={14} />
          Scan Your Ecosystem
        </Link>
      </div>
    </main>
      <SiteFooter />
    </>
  );
}
