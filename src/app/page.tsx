"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Activity, Zap, ExternalLink, Settings, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Ars3LiveHud from "@/components/scanner/Ars3LiveHud";
import ResultsReport from "@/components/scanner/ResultsReport";
import EmailGateModal from "@/components/scanner/EmailGateModal";
import { SiteNav } from "@/components/layout/SiteNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { supabase } from "@/lib/supabase/client";
import {
  normalizeUrl,
  deriveCompanySlug,
  scoreBandLabel,
  scoreBandTextClass,
} from "@/lib/scanner/shared";

// Email gate: once per browser — presence of this key means the user already
// left their email, so future scans link silently and skip the modal.
const LEAD_STORAGE_KEY = "glintbase_lead_email";

// ─── Pre-scanned examples ─────────────────────────────────────────────────
const EXAMPLES = [
  { name: "Stripe", url: "docs.stripe.com", score: 95, band: scoreBandLabel(95) },
  { name: "Twilio", url: "www.twilio.com/docs", score: 88, band: scoreBandLabel(88) },
  { name: "Supabase", url: "supabase.com/docs", score: 74, band: scoreBandLabel(74) },
  { name: "Vercel", url: "vercel.com/docs", score: 38, band: scoreBandLabel(38) },
];

// Site chrome (logo, nav, footer) lives in src/components/layout/

// ─── Waitlist CTA Banner ──────────────────────────────────────────────────
function WaitlistCTA() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="w-full max-w-3xl mx-auto mt-16"
    >
      <div className="relative rounded-2xl overflow-hidden border border-[#FF3300]/30 bg-gradient-to-br from-[#FF3300]/10 via-black to-[#8B5CF6]/10 p-8 md:p-10">
        {/* Glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,51,0,0.12),transparent_60%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.08),transparent_60%)] pointer-events-none" />
 
        <div className="relative flex flex-col md:flex-row items-center gap-8">
          {/* Icon cluster */}
          <div className="flex-shrink-0 flex items-center justify-center gap-3">
            <div className="h-16 w-16 rounded-2xl bg-[#FF3300] shadow-[0_0_40px_rgba(255,51,0,0.5)] flex items-center justify-center rotate-3">
              <div className="h-8 w-8 bg-black rounded-md rotate-12" />
            </div>
          </div>
 
          {/* Copy */}
          <div className="flex-1 text-center md:text-left space-y-3">
            <div className="text-[10px] font-mono text-[#FF3300] uppercase tracking-[0.4em]">
              Agent-Ready Ecosystems
            </div>
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-white leading-tight">
              Fix this automatically{" "}
              <span className="text-white/30 italic">with Glintbase</span>
            </h2>
            <p className="text-sm text-white/40 leading-relaxed max-w-md">
              Glintbase watches your codebase, detects documentation drift, and
              opens pull requests to keep your ecosystem agent-ready — automatically,
              on every git push.
            </p>
          </div>
 
          {/* CTA */}
          <div className="flex-shrink-0">
            <a
              href="https://glintbase.dev"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-[#FF3300] text-white font-black text-xs uppercase tracking-[0.25em] px-7 py-4 rounded-xl shadow-[0_0_40px_rgba(255,51,0,0.4)] hover:shadow-[0_0_50px_rgba(255,51,0,0.6)] hover:bg-[#FF3300]/90 transition-all whitespace-nowrap"
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
  const router = useRouter();
  const [rawInput, setRawInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [score, setScore] = useState<number>(0);
  const [checks, setChecks] = useState<any>([]);
  const [scanId, setScanId] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [topRankings, setTopRankings] = useState<any[]>([]);
  const [gateOpen, setGateOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingLead, setPendingLead] = useState<{
    slug: string;
    scanId: string | null;
    url: string;
    score: number;
  } | null>(null);

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
                band: scoreBandLabel(item.score),
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

  // Shared completion path for both stream-parse sites in handleScan.
  // Known lead → silently link scan + redirect; new visitor → open the gate.
  const completeScan = (data: any, url: string) => {
    setIsScanning(false);
    setScore(data.score);
    setChecks({
      ...data.checks,
      score_version: data.score_version || data.checks?.score_version,
    });
    const freshScanId = data.id || data.scanId || null;
    if (freshScanId) setScanId(freshScanId);
    setScanComplete(true);
    const slug = deriveCompanySlug(url);
    const targetUrl = freshScanId ? `/scan/${slug}?id=${freshScanId}` : `/scan/${slug}`;

    let storedEmail: string | null = null;
    try {
      storedEmail = localStorage.getItem(LEAD_STORAGE_KEY);
    } catch {
      // Storage unavailable (private mode) — fall through to the gate
    }

    if (storedEmail) {
      // Fire-and-forget: link the known email to this new scan
      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: storedEmail,
          scanId: freshScanId || undefined,
          companySlug: slug,
          url,
          score: data.score,
        }),
      }).catch(() => {});
      router.push(targetUrl);
      router.refresh();
    } else {
      setPendingLead({ slug, scanId: freshScanId, url, score: data.score });
      setGateOpen(true);
    }
  };

  const handleGateUnlocked = (email: string) => {
    try {
      localStorage.setItem(LEAD_STORAGE_KEY, email);
    } catch {
      // Non-fatal — the gate simply reappears next scan
    }
    setGateOpen(false);
    if (pendingLead) {
      const targetUrl = pendingLead.scanId
        ? `/scan/${pendingLead.slug}?id=${pendingLead.scanId}`
        : `/scan/${pendingLead.slug}`;
      router.push(targetUrl);
      router.refresh();
    }
  };

  const startScan = async (targetUrl?: string) => {
    const url = normalizeUrl(targetUrl || rawInput);
    if (!url) return;
    setRawInput(url);
    setErrorMsg(null);

    setIsScanning(true);
    setScanComplete(false);
    setLogs([]);
    setScore(0);
    setChecks([]);

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 35000);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        signal: abortController.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        let errMessage = `Scan request failed (${response.status})`;
        try {
          const errData = await response.json();
          if (errData?.error) errMessage = errData.error;
        } catch {
          // ignore json parse error
        }
        throw new Error(errMessage);
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = "";

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split("\n");
          // The last element is the remaining incomplete line (or empty if it ended with a newline)
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const data = JSON.parse(trimmed);
              data.id = data.id || Math.random().toString(36).substr(2, 9);
              if (data.type === "error") {
                setErrorMsg(data.message || "An error occurred during scan");
              }
              if (data.type === "complete") {
                completeScan(data, url);
              }
              setLogs((prev) => [...prev, data]);
            } catch (err) {
              console.error("Error parsing stream line:", err);
            }
          }
        }
      }

      // Parse any remaining content in the buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer.trim());
          data.id = data.id || Math.random().toString(36).substr(2, 9);
          if (data.type === "error") {
            setErrorMsg(data.message || "An error occurred during scan");
          }
          if (data.type === "complete") {
            completeScan(data, url);
          }
          setLogs((prev) => [...prev, data]);
        } catch (err) {
          console.error("Error parsing final stream buffer:", err);
        }
      }
    } catch (error: any) {
      const isAbort = error?.name === "AbortError";
      const errorMsgText = isAbort
        ? "Scan timed out: Target server took too long to respond."
        : error.message || "Failed to initiate scan";
      setErrorMsg(errorMsgText);
      setLogs((prev) => [
        ...prev,
        { id: "err", type: "error", message: errorMsgText },
      ]);
    } finally {
      clearTimeout(timeoutId);
      setIsScanning(false);
      setScanComplete(true);
    }
  };

  const handleScan = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    await startScan();
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const search = new URLSearchParams(window.location.search);
      const urlParam = search.get("url") || search.get("rescan");
      const isRescan = search.get("rescan") === "true" || search.get("auto") === "true";
      if (urlParam) {
        setRawInput(urlParam);
        if (isRescan) {
          startScan(urlParam);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReset = () => {
    setRawInput("");
    setIsScanning(false);
    setScanComplete(false);
    setErrorMsg(null);
    setLogs([]);
    setScore(0);
    setChecks([]);
    setScanId(null);
    setGateOpen(false);
    setPendingLead(null);
  };

  return (
    <>
      <SiteNav />

      {/* Grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(255,51,0,0.06),transparent)] pointer-events-none" />

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
                <Activity className="h-3 w-3 text-[#FF3300]" />
                Free Public Tool · Powered by Glintbase
              </div>
 
              <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.15] text-white mb-6">
                Analyze How{" "}
                <span className="text-[#FF3300] drop-shadow-[0_0_30px_rgba(255,51,0,0.5)]">
                  AI Agents
                </span>
                <br />
                Experience Your Product
              </h1>

              <p className="text-sm sm:text-base md:text-lg text-white/40 mb-8 sm:mb-10 max-w-xl leading-relaxed">
                Discover your machine-readable entrypoints, build product context maps, and measure execution confidence.
              </p>

              {/* URL Input */}
              <form onSubmit={handleScan} className="w-full">
                <div className="relative group w-full">
                  <div className="absolute inset-y-0 left-0 pl-4 sm:pl-5 flex items-center pointer-events-none text-white/20 group-focus-within:text-[#FF3300] transition-colors duration-300">
                    <Search size={18} />
                  </div>
                  <input
                    type="text"
                    value={rawInput}
                    onChange={(e) => setRawInput(e.target.value)}
                    placeholder="https://yourproduct.com"
                    required
                    disabled={isScanning}
                    className="w-full bg-white/[0.03] border-2 border-white/10 text-white text-sm sm:text-base rounded-xl pl-11 sm:pl-12 pr-28 sm:pr-36 py-4 sm:py-5 focus:outline-none focus:border-[#FF3300]/60 focus:bg-white/[0.05] transition-all font-mono placeholder:text-white/20 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isScanning}
                    className="absolute inset-y-2 right-2 bg-[#FF3300] text-white font-black text-[10px] sm:text-xs uppercase tracking-[0.15em] sm:tracking-[0.2em] px-3.5 sm:px-5 rounded-lg shadow-[0_0_20px_rgba(255,51,0,0.3)] hover:shadow-[0_0_30px_rgba(255,51,0,0.5)] hover:bg-[#FF3300]/90 transition-all disabled:bg-white/10 disabled:text-white/40 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    {isScanning ? "Scanning..." : "Scan"}
                  </button>
                </div>
                {/* Sub-bar: Auto-detection indicator & Flight Simulator Launcher */}
                <div className="mt-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1 font-mono text-[10px]">
                  <span className="text-white/35 flex items-center gap-1.5 text-left">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF3300]" />
                    ARS 3.0 Platform Auto-Detection & Dynamic Denominator
                  </span>
                  <Link
                    href="/simulate"
                    className="inline-flex items-center gap-1.5 text-[#FF3300] hover:text-white font-bold uppercase tracking-wider transition-colors self-start sm:self-auto"
                  >
                    <Zap size={11} />
                    <span>Launch Flight Simulator Cockpit →</span>
                  </Link>
                </div>
              </form>

              {/* Real-time lists: Recently Scanned & Top 5 Rankings */}
              <div className="mt-16 w-full grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                
                {/* Column 1: Recently Scanned */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <h3 className="text-[10px] text-white/40 uppercase tracking-[0.3em] font-mono font-bold">
                      Recently Scanned Ecosystems
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {recentScans.map((ex, idx) => (
                      <button
                        key={ex.name + '-' + idx}
                        type="button"
                        onClick={() => setRawInput(ex.url)}
                        className="group bg-white/[0.01] border border-white/5 hover:border-[#FF3300]/30 hover:bg-white/[0.03] rounded-xl p-4 flex flex-col gap-1.5 text-left transition-all duration-300 cursor-pointer w-full"
                      >
                        <span className="font-black text-xs text-white/70 group-hover:text-white transition-colors uppercase tracking-wider">
                          {ex.name}
                        </span>
                        <div className="flex items-baseline justify-between w-full">
                          <span className={`text-xl font-black font-mono ${scoreBandTextClass(ex.score)}`}>
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
                      Top 5 Agent-Native Ecosystems
                    </h3>
                    <Link
                      href="/leaderboard"
                      className="text-[9px] font-mono text-[#FF3300] hover:text-[#FF3300]/80 uppercase tracking-wider font-bold transition-colors"
                    >
                      Leaderboard →
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {topRankings.slice(0, 5).map((rankEx, index) => (
                      <button
                        key={rankEx.company + '-' + index}
                        onClick={() => setRawInput(rankEx.url)}
                        className="w-full flex items-center justify-between bg-white/[0.01] border border-white/5 hover:border-[#FF3300]/30 hover:bg-white/[0.03] rounded-xl p-3 text-left transition-all duration-300 cursor-pointer"
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
                        <span className={`font-mono font-black text-base ${scoreBandTextClass(rankEx.score)}`}>
                          {rankEx.score}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* ─── ARS 3.0 Standard Walkthrough & Capabilities ─────────────────── */}
              <div className="mt-24 pt-16 border-t border-white/5 w-full text-left space-y-12">
                <div className="text-center space-y-4 max-w-xl mx-auto">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-[#FF3300]/20 bg-[#FF3300]/[0.02] text-[9px] font-mono text-[#FF3300] uppercase tracking-widest">
                    ARS 3.0 Architecture
                  </div>
                  <h2 className="text-3xl font-black uppercase tracking-tight text-white font-mono">
                    Sub-5s Machine Readiness Standard
                  </h2>
                  <p className="text-sm text-white/40 leading-relaxed font-sans">
                    Deterministic 119-check parallel probe suite, dynamic archetype denominator scaling, and autonomous flight simulation.
                  </p>
                </div>

                {/* Step Cards Sequential Timeline */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 w-full">
                  
                  {/* Step 1 */}
                  <div className="flex-1 w-full bg-white/[0.01] border border-white/5 hover:border-[#FF3300]/30 p-6 rounded-2xl space-y-3 transition-all duration-300 group min-h-[190px] flex flex-col justify-between">
                    <div>
                      <div className="text-2xl font-black font-mono text-[#FF3300]/50 group-hover:text-[#FF3300] transition-colors">01</div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono mt-2">Parallel 4-Layer Probing</h3>
                    </div>
                    <p className="text-xs text-white/45 leading-relaxed font-sans mt-2">
                      Sub-5-second concurrent probe suite testing 119 discrete checks across Discovery, Access, Usability, and Payments without slow HTML crawler latency.
                    </p>
                  </div>

                  {/* Arrow 1 */}
                  <div className="flex shrink-0 items-center justify-center py-2 md:py-0">
                    <svg className="w-10 h-6 text-[#FF3300]/40 animate-pulse hidden md:block" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10 25 H 90 M 75 12 L 90 25 L 75 38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  {/* Step 2 */}
                  <div className="flex-1 w-full bg-white/[0.01] border border-white/5 hover:border-[#FF3300]/30 p-6 rounded-2xl space-y-3 transition-all duration-300 group min-h-[190px] flex flex-col justify-between">
                    <div>
                      <div className="text-2xl font-black font-mono text-[#FF3300]/50 group-hover:text-[#FF3300] transition-colors">02</div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono mt-2">Dynamic Archetype Scaling</h3>
                    </div>
                    <p className="text-xs text-white/45 leading-relaxed font-sans mt-2">
                      Calculates ARS score using dynamic denominator scaling (D<sub>active</sub> = D<sub>base</sub> + S<sub>bonus</sub>), eliminating unfair penalties for non-payment or documentation sites.
                    </p>
                  </div>

                  {/* Arrow 2 */}
                  <div className="flex shrink-0 items-center justify-center py-2 md:py-0">
                    <svg className="w-10 h-6 text-[#FF3300]/40 animate-pulse hidden md:block" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10 25 H 90 M 75 12 L 90 25 L 75 38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  {/* Step 3 */}
                  <div className="flex-1 w-full bg-white/[0.01] border border-white/5 hover:border-[#FF3300]/30 p-6 rounded-2xl space-y-3 transition-all duration-300 group min-h-[190px] flex flex-col justify-between">
                    <div>
                      <div className="text-2xl font-black font-mono text-[#FF3300]/50 group-hover:text-[#FF3300] transition-colors">03</div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono mt-2">Autonomous Flight Simulator</h3>
                    </div>
                    <p className="text-xs text-white/45 leading-relaxed font-sans mt-2">
                      Zero-cost deterministic trajectory replay across Claude Code, Cursor, and Perplexity with BPE token tax counters and counterfactual What-If fix proofs.
                    </p>
                  </div>

                </div>

                {/* Dashboard Snapshots Display */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-8">
                  {/* Left Snapshot: Hero scorecard */}
                  <div className="flex flex-col gap-3 group">
                    <div className="relative rounded-2xl overflow-hidden border border-white/10 group-hover:border-[#FF3300]/40 transition-all duration-500 bg-black shadow-[0_0_30px_rgba(0,0,0,0.8)] shadow-black">
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-65 z-10" />
                      <img 
                        src="/images/real_dashboard_hero.png" 
                        alt="Ecosystem Readiness Dashboard" 
                        className="w-full h-auto object-cover opacity-90 group-hover:scale-[1.02] transition-transform duration-500"
                      />
                    </div>
                    <div className="px-2 space-y-1 font-mono text-left">
                      <div className="text-[10px] font-black uppercase text-white/80 tracking-wider">Ecosystem Scorecard Report</div>
                      <div className="text-[9px] text-white/40">Visualizes initial Agent Readiness Index, active repository surfaces, and crawl corpus sizes.</div>
                    </div>
                  </div>

                  {/* Right Snapshot: Dimensions overview */}
                  <div className="flex flex-col gap-3 group">
                    <div className="relative rounded-2xl overflow-hidden border border-white/10 group-hover:border-[#22D3EE]/40 transition-all duration-500 bg-black shadow-[0_0_30px_rgba(0,0,0,0.8)] shadow-black">
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-65 z-10" />
                      <img 
                        src="/images/real_dimensions_section.png" 
                        alt="Collapsible Diagnostic Dimensions" 
                        className="w-full h-auto object-cover opacity-90 group-hover:scale-[1.02] transition-transform duration-500"
                      />
                    </div>
                    <div className="px-2 space-y-1 font-mono text-left">
                      <div className="text-[10px] font-black uppercase text-white/80 tracking-wider">Interactive Dimensions breakdown</div>
                      <div className="text-[9px] text-white/40">Expandable categories checking discoverability, token efficiency, runtime validity, and context drift.</div>
                    </div>
                  </div>
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Docked Command Bar (during scan / results / error) ────────────────────── */}
        {(isScanning || scanComplete || logs.length > 0 || Boolean(errorMsg)) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-4xl mb-6 sticky top-20 z-30 backdrop-blur-md bg-black/60 p-3 rounded-2xl border border-white/10 shadow-2xl"
          >
            <form onSubmit={handleScan} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-white/30">
                  <Search size={15} />
                </div>
                <input
                  type="text"
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder="https://yourproduct.com"
                  required
                  disabled={isScanning}
                  className="w-full bg-white/[0.04] border border-white/10 text-white text-xs sm:text-sm rounded-xl pl-10 pr-4 py-2.5 sm:py-3 focus:outline-none focus:border-[#FF3300]/60 focus:bg-white/[0.07] transition-all font-mono placeholder:text-white/20 disabled:opacity-50"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="submit"
                  disabled={isScanning}
                  className="bg-[#FF3300] text-white font-black text-[10px] sm:text-xs uppercase tracking-wider px-5 py-2.5 sm:py-3 rounded-xl shadow-[0_0_15px_rgba(255,51,0,0.3)] hover:shadow-[0_0_25px_rgba(255,51,0,0.5)] hover:bg-[#FF3300]/90 transition-all disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {isScanning ? "Scanning..." : "Scan"}
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="bg-white/[0.03] hover:bg-white/[0.08] text-white/60 hover:text-white border border-white/10 text-[10px] sm:text-xs font-mono uppercase tracking-wider px-3.5 py-2.5 sm:py-3 rounded-xl transition-all cursor-pointer shrink-0"
                  title="Reset to home"
                >
                  Reset
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* ── ARS 3.0 Live HUD ─────────────────────────────── */}
        {(isScanning || Boolean(errorMsg) || (logs.length > 0 && (!scanComplete || (Array.isArray(checks) ? checks.length === 0 : (checks?.surfaces?.length ?? 0) === 0)))) && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-4xl"
          >
            <div className="flex items-center justify-between mb-2 px-1 font-mono">
              <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-widest">
                <Zap size={12} className="text-[#FF3300]" />
                Scanning: {normalizeUrl(rawInput)}
              </div>
              {scanComplete && (
                <button
                  onClick={handleReset}
                  className="text-[10px] text-white/40 hover:text-[#FF3300] uppercase tracking-widest transition-colors cursor-pointer"
                >
                  ← New Scan
                </button>
              )}
            </div>
            <Ars3LiveHud
              url={normalizeUrl(rawInput)}
              isScanning={isScanning}
              logs={logs}
              error={errorMsg}
              onRetry={() => {
                const syntheticEvent = { preventDefault: () => {} } as React.FormEvent;
                handleScan(syntheticEvent);
              }}
            />
          </motion.div>
        )}

        {/* ── Results ─────────────────────────────────────── */}
        {scanComplete && !gateOpen && (Array.isArray(checks) ? checks.length > 0 : (checks?.surfaces?.length ?? 0) > 0) && (
          <>
            <ResultsReport score={score} checks={checks} scanId={scanId || undefined} url={normalizeUrl(rawInput)} />
            <WaitlistCTA />
          </>
        )}
      </main>

      {/* Email gate — blocks the report until the visitor leaves an email */}
      <EmailGateModal
        open={gateOpen}
        scanId={pendingLead?.scanId}
        companySlug={pendingLead?.slug}
        url={pendingLead?.url}
        score={pendingLead?.score}
        onUnlocked={handleGateUnlocked}
      />

      {/* Footer */}
      <SiteFooter />
    </>
  );
}

