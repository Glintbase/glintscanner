import { Search, Trophy } from "lucide-react";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
    <main className="flex-1 flex flex-col items-center pt-32 pb-20 px-4 max-w-4xl mx-auto w-full">
      <div className="flex flex-col items-center text-center mb-12">
        <Trophy size={48} className="text-[#FF4500] drop-shadow-[0_0_20px_rgba(255,69,0,0.4)] mb-6" />
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4 text-white">
          Agent Readiness Leaderboard
        </h1>
        <p className="text-sm md:text-base text-white/40 max-w-2xl leading-relaxed">
          The top developer documentation sites, ranked by how easily AI coding agents can discover, parse, and implement against them.
          Rankings are powered by real scans — updated live.
        </p>
        {!isEmpty && (
          <p className="mt-3 text-xs text-white/25 font-mono">
            {leaderboardData.length} unique site{leaderboardData.length !== 1 ? 's' : ''} ranked
          </p>
        )}
      </div>

      <div className="w-full bg-[#0F172A] border border-white/5 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.3)] overflow-hidden">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
            <Trophy size={40} className="text-white/10 mb-4" />
            <p className="text-white/40 font-mono text-sm mb-2">No scans yet</p>
            <p className="text-white/20 text-xs max-w-xs">
              Be the first to scan a documentation site. Results will appear here in real time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#020617] border-b border-white/5 text-white/40 uppercase text-[10px] tracking-widest font-mono">
                  <th className="py-4 px-6 font-bold">Rank</th>
                  <th className="py-4 px-6 font-bold">Company / Product</th>
                  <th className="py-4 px-6 font-bold text-right">Readiness Score</th>
                </tr>
              </thead>
              <tbody>
                {leaderboardData.map((item, index) => (
                  <tr
                    key={item.id ?? item.url + '-' + index}
                    className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-4 px-6">
                      <span className={`font-mono text-base ${index < 3 ? 'text-[#FF4500] font-black' : 'text-white/30'}`}>
                        #{item.rank}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-col">
                        {item.id ? (
                          <Link
                            href={`/scan/${item.id}`}
                            className="font-bold text-white text-base hover:text-[#FF4500] transition-colors uppercase tracking-wide"
                          >
                            {item.company}
                          </Link>
                        ) : (
                          <span className="font-bold text-white text-base uppercase tracking-wide">{item.company}</span>
                        )}
                        <span className="text-xs text-white/30 font-mono">
                          {item.url.replace(/^https?:\/\//i, '')}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className={`text-2xl font-black font-mono ${
                        item.score >= 90 ? 'text-success' :
                        item.score >= 70 ? 'text-[#22D3EE]' :
                        item.score >= 50 ? 'text-warning' : 'text-danger'
                      }`}>
                        {item.score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-12 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-[#FF4500] text-white font-black text-xs uppercase tracking-[0.2em] px-8 py-4 rounded-xl shadow-[0_0_30px_rgba(255,69,0,0.3)] hover:shadow-[0_0_40px_rgba(255,69,0,0.5)] hover:bg-[#FF4500]/90 transition-all"
        >
          <Search size={14} />
          Scan Your Docs
        </Link>
      </div>
    </main>
  );
}
