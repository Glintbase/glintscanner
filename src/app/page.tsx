"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Activity, Zap, ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import LiveTerminal from "@/components/scanner/LiveTerminal";
import ResultsReport from "@/components/scanner/ResultsReport";
import { supabase } from "@/lib/supabase/client";

// ─── URL Normalization ─────────────────────────────────────────────────────
function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  // Already has a protocol
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Has www or a recognisable TLD — assume https
  return `https://${trimmed}`;
}

// ─── Pre-scanned examples ─────────────────────────────────────────────────
const EXAMPLES = [
  { name: "Stripe", url: "docs.stripe.com", score: 95, band: "Agent-Native" },
  { name: "Twilio", url: "www.twilio.com/docs", score: 88, band: "Agent-Native" },
  { name: "Supabase", url: "supabase.com/docs", score: 74, band: "AI-Friendly" },
  { name: "Vercel", url: "vercel.com/docs", score: 38, band: "Legacy Docs" },
];

function scoreBandColor(score: number) {
  if (score >= 76) return "text-success"; // Agent-Native
  if (score >= 41) return "text-warning"; // AI-Friendly
  return "text-danger"; // Legacy Docs
}

// ─── Logo ─────────────────────────────────────────────────────────────────
function GlintbaseLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="10" fill="#FF4500" />
      <rect
        x="10.5"
        y="10.5"
        width="11"
        height="11"
        rx="2.5"
        fill="#020617"
        transform="rotate(12, 16, 16)"
      />
    </svg>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────
function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] border-b border-white/5 bg-[#020617]/80 backdrop-blur-xl px-6 py-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <a
          href="https://glintbase.xyz"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 group"
        >
          <div className="transition-transform duration-500 group-hover:rotate-12">
            <GlintbaseLogo size={28} />
          </div>
          <span className="text-sm font-black tracking-[0.25em] uppercase text-[#F1F5F9]">
            Glint<span className="text-white/25">base</span>
          </span>
        </a>
        <div className="flex items-center gap-6">
          <Link
            href="/leaderboard"
            className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
          >
            Leaderboard
          </Link>
          <span className="hidden md:block text-[10px] font-mono text-white/20 uppercase tracking-widest">
            Scanner_v1
          </span>
          <a
            href="https://glintbase.xyz"
            target="_blank"
            rel="noreferrer"
            className="bg-[#FF4500] text-white font-black text-[10px] uppercase tracking-widest px-4 py-2 rounded-lg hover:bg-[#FF4500]/90 transition-all shadow-[0_0_20px_rgba(255,69,0,0.25)] flex items-center gap-2"
          >
            Join Waitlist <ArrowRight size={12} />
          </a>
        </div>
      </div>
    </nav>
  );
}

// ─── Waitlist CTA Banner ──────────────────────────────────────────────────
function WaitlistCTA() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="w-full max-w-3xl mx-auto mt-16"
    >
      <div className="relative rounded-2xl overflow-hidden border border-[#FF4500]/30 bg-gradient-to-br from-[#FF4500]/10 via-[#0F172A] to-[#8B5CF6]/10 p-8 md:p-10">
        {/* Glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,69,0,0.12),transparent_60%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.08),transparent_60%)] pointer-events-none" />

        <div className="relative flex flex-col md:flex-row items-center gap-8">
          {/* Icon cluster */}
          <div className="flex-shrink-0 flex items-center justify-center gap-3">
            <div className="h-16 w-16 rounded-2xl bg-[#FF4500] shadow-[0_0_40px_rgba(255,69,0,0.5)] flex items-center justify-center rotate-3">
              <div className="h-8 w-8 bg-[#020617] rounded-md rotate-12" />
            </div>
          </div>

          {/* Copy */}
          <div className="flex-1 text-center md:text-left space-y-3">
            <div className="text-[10px] font-mono text-[#FF4500] uppercase tracking-[0.4em]">
              Agent-Ready Documentation
            </div>
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-white leading-tight">
              Fix this automatically{" "}
              <span className="text-white/30 italic">with Glintbase</span>
            </h2>
            <p className="text-sm text-white/40 leading-relaxed max-w-md">
              Glintbase watches your codebase, detects documentation drift, and
              opens pull requests to keep your docs agent-ready — automatically,
              on every git push.
            </p>
          </div>

          {/* CTA */}
          <div className="flex-shrink-0">
            <a
              href="https://glintbase.xyz"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-[#FF4500] text-white font-black text-xs uppercase tracking-[0.25em] px-7 py-4 rounded-xl shadow-[0_0_40px_rgba(255,69,0,0.4)] hover:shadow-[0_0_50px_rgba(255,69,0,0.6)] hover:bg-[#FF4500]/90 transition-all whitespace-nowrap"
            >
              Join Waitlist <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function Home() {
  const [rawInput, setRawInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [score, setScore] = useState<number>(0);
  const [checks, setChecks] = useState<any[]>([]);
  const [scanId, setScanId] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [topRankings, setTopRankings] = useState<any[]>([]);

  useEffect(() => {
    async function loadScans() {
      try {
        const { data: recentData, error: recentErr } = await supabase
          .from("public_scans")
          .select("id, url, score")
          .order("created_at", { ascending: false })
          .limit(4);

        if (!recentErr && recentData && recentData.length > 0) {
          setRecentScans(
            recentData.map((item) => {
              let domain = item.url;
              try {
                domain = new URL(item.url).hostname;
              } catch {
                domain = item.url.replace(/^https?:\/\//i, "").split("/")[0];
              }
              let company = domain.split(".")[0];
              if (company === "www" || company === "docs") {
                company = domain.split(".")[1] || company;
              }
              company = company.charAt(0).toUpperCase() + company.slice(1);

              return {
                id: item.id,
                name: company,
                url: domain,
                score: item.score,
                band:
                  item.score >= 76
                    ? "Agent-Native"
                    : item.score >= 41
                    ? "AI-Friendly"
                    : "Legacy Docs",
              };
            })
          );
        } else {
          setRecentScans(EXAMPLES);
        }

        const { data: topData, error: topErr } = await supabase
          .from("public_scans")
          .select("id, url, score")
          .order("score", { ascending: false })
          .limit(100);

        if (!topErr && topData && topData.length > 0) {
          const uniqueDomains = new Map<string, typeof topData[0]>();
          for (const item of topData) {
            let domain = item.url;
            try {
              domain = new URL(item.url).hostname;
            } catch {
              domain = item.url.replace(/^https?:\/\//i, "").split("/")[0];
            }
            const existing = uniqueDomains.get(domain);
            if (!existing || existing.score < item.score) {
              uniqueDomains.set(domain, item);
            }
          }

          const top5 = Array.from(uniqueDomains.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map((item, index) => {
              let domain = item.url;
              try {
                domain = new URL(item.url).hostname;
              } catch {
                domain = item.url.replace(/^https?:\/\//i, "").split("/")[0];
              }
              let company = domain.split(".")[0];
              if (company === "www" || company === "docs") {
                company = domain.split(".")[1] || company;
              }
              company = company.charAt(0).toUpperCase() + company.slice(1);

              return {
                id: item.id,
                rank: index + 1,
                company,
                url: domain,
                score: item.score,
              };
            });

          setTopRankings(top5);
        } else {
          setTopRankings([
            { rank: 1, company: "Stripe", url: "docs.stripe.com", score: 95 },
            { rank: 2, company: "Twilio", url: "www.twilio.com/docs", score: 88 },
            { rank: 3, company: "Supabase", url: "supabase.com/docs", score: 74 },
            { rank: 4, company: "Vercel", url: "vercel.com/docs", score: 38 },
          ]);
        }
      } catch (err) {
        console.error("Error loading dynamic dashboard scans:", err);
        setRecentScans(EXAMPLES);
        setTopRankings([
          { rank: 1, company: "Stripe", url: "docs.stripe.com", score: 95 },
          { rank: 2, company: "Twilio", url: "www.twilio.com/docs", score: 88 },
          { rank: 3, company: "Supabase", url: "supabase.com/docs", score: 74 },
          { rank: 4, company: "Vercel", url: "vercel.com/docs", score: 38 },
        ]);
      }
    }

    loadScans();
  }, []);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = normalizeUrl(rawInput);
    if (!url) return;

    setIsScanning(true);
    setScanComplete(false);
    setLogs([]);
    setScore(0);
    setChecks([]);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n").filter((l) => l.trim());
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              data.id = data.id || Math.random().toString(36).substr(2, 9);
              if (data.type === "complete") {
                setScore(data.score);
                setChecks(data.checks);
                if (data.id) setScanId(data.id);
                setScanComplete(true);
              }
              setLogs((prev) => [...prev, data]);
            } catch {}
          }
        }
      }
    } catch (error: any) {
      setLogs((prev) => [
        ...prev,
        { id: "err", type: "error", message: error.message },
      ]);
    } finally {
      setIsScanning(false);
      setScanComplete(true);
    }
  };

  const handleReset = () => {
    setRawInput("");
    setIsScanning(false);
    setScanComplete(false);
    setLogs([]);
    setScore(0);
    setChecks([]);
    setScanId(null);
  };

  return (
    <>
      <Navbar />

      {/* Grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#1e293b10_1px,transparent_1px),linear-gradient(to_bottom,#1e293b10_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(255,69,0,0.06),transparent)] pointer-events-none" />

      <main className="flex-1 flex flex-col items-center pt-32 pb-20 px-4">

        {/* ── Hero ────────────────────────────────────────── */}
        <AnimatePresence>
          {!isScanning && !scanComplete && (
            <motion.div
              key="hero"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full max-w-3xl flex flex-col items-center text-center mb-12"
            >
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-white/5 bg-white/[0.02] text-[10px] font-mono text-white/40 uppercase tracking-widest mb-8">
                <Activity className="h-3 w-3 text-[#FF4500]" />
                Free Public Tool · Powered by Glintbase
              </div>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[0.9] text-white mb-6">
                Agent{" "}
                <span className="text-[#FF4500] drop-shadow-[0_0_30px_rgba(255,69,0,0.5)]">
                  Readiness
                </span>
                <br />
                Scanner
              </h1>

              <p className="text-base md:text-lg text-white/40 mb-10 max-w-xl leading-relaxed">
                Discover how well AI coding agents can use your documentation.
                Get an instant score and copy-paste fix prompts.
              </p>

              {/* URL Input */}
              <form onSubmit={handleScan} className="w-full">
                <div className="relative group w-full">
                  <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-white/20 group-focus-within:text-[#FF4500] transition-colors duration-300">
                    <Search size={18} />
                  </div>
                  <input
                    type="text"
                    value={rawInput}
                    onChange={(e) => setRawInput(e.target.value)}
                    placeholder="docs.yourproduct.com"
                    required
                    className="w-full bg-white/[0.03] border-2 border-white/10 text-white text-base rounded-xl pl-12 pr-36 py-5 focus:outline-none focus:border-[#FF4500]/60 focus:bg-white/[0.05] transition-all font-mono placeholder:text-white/20"
                  />
                  <button
                    type="submit"
                    className="absolute inset-y-2 right-2 bg-[#FF4500] text-white font-black text-xs uppercase tracking-[0.2em] px-5 rounded-lg shadow-[0_0_20px_rgba(255,69,0,0.3)] hover:shadow-[0_0_30px_rgba(255,69,0,0.5)] hover:bg-[#FF4500]/90 transition-all"
                  >
                    Scan
                  </button>
                </div>
                <p className="mt-3 text-[11px] text-white/20 font-mono">
                  Paste any URL — we&apos;ll handle the rest. No https:// needed.
                </p>
              </form>

              {/* Real-time lists: Recently Scanned & Top 5 Rankings */}
              <div className="mt-16 w-full grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                
                {/* Column 1: Recently Scanned */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <h3 className="text-[10px] text-white/40 uppercase tracking-[0.3em] font-mono font-bold">
                      Recently Scanned Docs
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {recentScans.map((ex, idx) => (
                      <button
                        key={ex.name + '-' + idx}
                        type="button"
                        onClick={() => setRawInput(ex.url)}
                        className="group bg-white/[0.01] border border-white/5 hover:border-[#FF4500]/30 hover:bg-white/[0.03] rounded-xl p-4 flex flex-col gap-1.5 text-left transition-all duration-300 cursor-pointer w-full"
                      >
                        <span className="font-black text-xs text-white/70 group-hover:text-white transition-colors uppercase tracking-wider">
                          {ex.name}
                        </span>
                        <div className="flex items-baseline justify-between w-full">
                          <span className={`text-xl font-black font-mono ${scoreBandColor(ex.score)}`}>
                            {ex.score}
                          </span>
                          <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">
                            {ex.band}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Column 2: Top 5 rankings */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <h3 className="text-[10px] text-white/40 uppercase tracking-[0.3em] font-mono font-bold">
                      Top 5 Agent-Native Docs
                    </h3>
                    <Link
                      href="/leaderboard"
                      className="text-[9px] font-mono text-[#FF4500] hover:text-[#FF4500]/80 uppercase tracking-wider font-bold transition-colors"
                    >
                      Leaderboard →
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {topRankings.slice(0, 5).map((rankEx, index) => (
                      <button
                        key={rankEx.company + '-' + index}
                        onClick={() => setRawInput(rankEx.url)}
                        className="w-full flex items-center justify-between bg-white/[0.01] border border-white/5 hover:border-[#FF4500]/30 hover:bg-white/[0.03] rounded-xl p-3 text-left transition-all duration-300 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-black text-white/20">#{index + 1}</span>
                          <div className="flex flex-col">
                            <span className="font-bold text-xs text-white uppercase tracking-wide">
                              {rankEx.company}
                            </span>
                            <span className="text-[9px] text-white/30 font-mono">
                              {rankEx.url}
                            </span>
                          </div>
                        </div>
                        <span className={`font-mono font-black text-base ${scoreBandColor(rankEx.score)}`}>
                          {rankEx.score}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Live Terminal ───────────────────────────────── */}
        {(isScanning || (logs.length > 0 && !scanComplete)) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-3xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[10px] font-mono text-white/30 uppercase tracking-widest">
                <Zap size={12} className="text-[#FF4500]" />
                Scanning: {normalizeUrl(rawInput)}
              </div>
              {scanComplete && (
                <button
                  onClick={handleReset}
                  className="text-[10px] font-mono text-white/30 hover:text-[#FF4500] uppercase tracking-widest transition-colors"
                >
                  ← New Scan
                </button>
              )}
            </div>
            <LiveTerminal logs={logs} isComplete={scanComplete} />
          </motion.div>
        )}

        {/* ── Results ─────────────────────────────────────── */}
        {scanComplete && checks.length > 0 && (
          <>
            <ResultsReport score={score} checks={checks} scanId={scanId || undefined} />
            <WaitlistCTA />
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6 flex flex-col md:flex-row items-center justify-between gap-4 bg-black/20 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <GlintbaseLogo size={20} />
          <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">
            © 2025 Glintbase Protocol
          </span>
        </div>
        <a
          href="https://glintbase.xyz"
          target="_blank"
          rel="noreferrer"
          className="text-[10px] font-mono text-white/20 hover:text-[#FF4500] uppercase tracking-widest transition-colors"
        >
          glintbase.xyz →
        </a>
      </footer>
    </>
  );
}
