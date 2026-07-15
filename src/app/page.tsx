"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Activity, Zap, ArrowRight, ExternalLink, Settings, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LiveTerminal from "@/components/scanner/LiveTerminal";
import ResultsReport from "@/components/scanner/ResultsReport";
import { supabase } from "@/lib/supabase/client";
import {
  normalizeUrl,
  deriveCompanySlug,
  scoreBandLabel,
  scoreBandTextClass,
} from "@/lib/scanner/shared";

// ─── Pre-scanned examples ─────────────────────────────────────────────────
const EXAMPLES = [
  { name: "Stripe", url: "docs.stripe.com", score: 95, band: scoreBandLabel(95) },
  { name: "Twilio", url: "www.twilio.com/docs", score: 88, band: scoreBandLabel(88) },
  { name: "Supabase", url: "supabase.com/docs", score: 74, band: scoreBandLabel(74) },
  { name: "Vercel", url: "vercel.com/docs", score: 38, band: scoreBandLabel(38) },
];

// ─── Logo ─────────────────────────────────────────────────────────────────
function GlintbaseLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <mask id="navLogoMask">
          <rect width="100" height="100" fill="white" />
          <rect 
            x="28" y="28" width="44" height="44" rx="12" 
            fill="black" 
            transform="rotate(15 50 50)" 
          />
        </mask>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF3300" />
          <stop offset="100%" stopColor="#FF1800" />
        </linearGradient>
      </defs>
      <rect 
        x="12" y="12" width="76" height="76" rx="22" 
        fill="url(#logoGrad)" 
        mask="url(#navLogoMask)" 
      />
    </svg>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────
function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] border-b border-white/5 bg-black/80 backdrop-blur-xl px-6 py-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <a
          href="https://glintbase.dev"
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
            href="https://glintbase.dev"
            target="_blank"
            rel="noreferrer"
            className="bg-[#FF3300] text-white font-black text-[10px] uppercase tracking-widest px-4 py-2 rounded-lg hover:bg-[#FF3300]/90 transition-all shadow-[0_0_20px_rgba(255,51,0,0.25)] flex items-center gap-2"
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

interface SurfaceOption {
  id: string;
  label: string;
  category: string;
  description: string;
}

const SURFACE_OPTIONS: SurfaceOption[] = [
  { id: "sitemap", label: "Sitemap Index", category: "Discovery", description: "Probes robots.txt and sitemap.xml for site structure discovery" },
  { id: "llms_txt", label: "llms.txt", category: "AI Specs", description: "Detects /llms.txt summarizing product info for LLM crawlers" },
  { id: "llms_full_txt", label: "llms-full.txt", category: "AI Specs", description: "Detects full text documentation file for single-shot retrieval" },
  { id: "openapi", label: "OpenAPI Specs", category: "AI Specs", description: "Searches /openapi.json and yaml endpoints to discover API schemas" },
  { id: "mcp", label: "MCP Config", category: "AI Specs", description: "Detects Model Context Protocol (mcp.json) tool endpoint descriptions" },
  { id: "github", label: "GitHub Repository", category: "Codebases", description: "Searches for linked public code repositories and packages" },
  { id: "docs", label: "Documentation", category: "Reference", description: "Audits the presence and readability of user documentation" },
  { id: "api", label: "API Reference", category: "Reference", description: "Audits structural links to raw API documentation references" },
  { id: "auth", label: "Developer Auth", category: "Console", description: "Detects developer login, registration, and credential pages" },
  { id: "dashboard", label: "Developer Console", category: "Console", description: "Detects developer dashboards and workspace entrypoints" },
  { id: "support", label: "Troubleshooting", category: "Console", description: "Detects support portals and troubleshooting pages" },
  { id: "blog", label: "Updates", category: "Updates", description: "Checks for developer blogs and general product updates" },
  { id: "changelog", label: "Releases", category: "Updates", description: "Detects public release changelogs for tracking API drift" },
];

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

  const [showCustomizer, setShowCustomizer] = useState(false);
  const [customSurfaces, setCustomSurfaces] = useState<Record<string, boolean>>({
    landing: true,
    sitemap: true,
    llms_txt: true,
    llms_full_txt: true,
    openapi: true,
    mcp: true,
    github: true,
    docs: true,
    api: true,
    sdk: true,
    auth: true,
    dashboard: true,
    support: true,
    blog: true,
    changelog: true,
    status: true,
  });

  const toggleSurface = (id: string) => {
    setCustomSurfaces((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleSelectAll = () => {
    setCustomSurfaces({
      landing: true,
      sitemap: true,
      llms_txt: true,
      llms_full_txt: true,
      openapi: true,
      mcp: true,
      github: true,
      docs: true,
      api: true,
      sdk: true,
      auth: true,
      dashboard: true,
      support: true,
      blog: true,
      changelog: true,
      status: true,
    });
  };

  const handleDeselectAll = () => {
    setCustomSurfaces({
      landing: false,
      sitemap: false,
      llms_txt: false,
      llms_full_txt: false,
      openapi: false,
      mcp: false,
      github: false,
      docs: false,
      api: false,
      sdk: false,
      auth: false,
      dashboard: false,
      support: false,
      blog: false,
      changelog: false,
      status: false,
    });
  };

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
      const enabledSurfaces = Object.keys(customSurfaces).filter((k) => customSurfaces[k]);
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          url,
          options: {
            enabledSurfaces
          }
        }),
      });

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
              if (data.type === "complete") {
                setScore(data.score);
                setChecks({
                  ...data.checks,
                  score_version: data.score_version || data.checks?.score_version,
                });
                if (data.id) setScanId(data.id);
                setScanComplete(true);
                const slug = deriveCompanySlug(url);
                router.push(`/scan/${slug}`);
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
          if (data.type === "complete") {
            setScore(data.score);
            setChecks({
              ...data.checks,
              score_version: data.score_version || data.checks?.score_version,
            });
            if (data.id) setScanId(data.id);
            setScanComplete(true);
            const slug = deriveCompanySlug(url);
            router.push(`/scan/${slug}`);
          }
          setLogs((prev) => [...prev, data]);
        } catch (err) {
          console.error("Error parsing final stream buffer:", err);
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
 
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.15] text-white mb-6">
                Analyze How{" "}
                <span className="text-[#FF3300] drop-shadow-[0_0_30px_rgba(255,51,0,0.5)]">
                  AI Agents
                </span>
                <br />
                Experience Your Product
              </h1>

              <p className="text-base md:text-lg text-white/40 mb-10 max-w-xl leading-relaxed">
                Discover your machine-readable entrypoints, build product context maps, and measure execution confidence.
              </p>

              {/* URL Input */}
              <form onSubmit={handleScan} className="w-full">
                <div className="relative group w-full">
                  <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-white/20 group-focus-within:text-[#FF3300] transition-colors duration-300">
                    <Search size={18} />
                  </div>
                  <input
                    type="text"
                    value={rawInput}
                    onChange={(e) => setRawInput(e.target.value)}
                    placeholder="https://yourproduct.com"
                    required
                    disabled={isScanning}
                    className="w-full bg-white/[0.03] border-2 border-white/10 text-white text-base rounded-xl pl-12 pr-36 py-5 focus:outline-none focus:border-[#FF3300]/60 focus:bg-white/[0.05] transition-all font-mono placeholder:text-white/20 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isScanning}
                    className="absolute inset-y-2 right-2 bg-[#FF3300] text-white font-black text-xs uppercase tracking-[0.2em] px-5 rounded-lg shadow-[0_0_20px_rgba(255,51,0,0.3)] hover:shadow-[0_0_30px_rgba(255,51,0,0.5)] hover:bg-[#FF3300]/90 transition-all disabled:bg-white/10 disabled:text-white/40 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    {isScanning ? "Scanning..." : "Scan"}
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-3 text-[11px] font-mono gap-2">
                  <p className="text-white/20 text-left">
                    Paste your landing page, API root, docs domain, or repository URL.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCustomizer(!showCustomizer)}
                    className="flex items-center gap-1.5 text-white/40 hover:text-[#FF3300] transition-colors focus:outline-none self-start sm:self-auto"
                  >
                    <Settings size={12} className={showCustomizer ? "text-[#FF3300] animate-pulse" : ""} />
                    <span>{showCustomizer ? "Hide Customizer" : "Customize Scan"}</span>
                  </button>
                </div>

                <AnimatePresence>
                  {showCustomizer && (
                    <motion.div
                      initial={{ height: 0, opacity: 0, marginTop: 0 }}
                      animate={{ height: "auto", opacity: 1, marginTop: 16 }}
                      exit={{ height: 0, opacity: 0, marginTop: 0 }}
                      className="overflow-hidden w-full bg-white/[0.02] border border-white/5 rounded-xl p-5 text-left font-mono"
                    >
                      <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-4">
                        <span className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-black">
                          Select Surfaces to Scan
                        </span>
                        <div className="flex gap-4">
                          <button
                            type="button"
                            onClick={handleSelectAll}
                            className="text-[9px] text-[#FF3300] hover:text-[#FF3300]/80 transition-colors uppercase font-bold"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={handleDeselectAll}
                            className="text-[9px] text-white/40 hover:text-white/60 transition-colors uppercase font-bold"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[240px] overflow-y-auto pr-1">
                        {SURFACE_OPTIONS.map((opt) => {
                          const isEnabled = customSurfaces[opt.id];
                          return (
                            <label
                              key={opt.id}
                              className={`group flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200 select-none ${
                                isEnabled
                                  ? "bg-[#FF3300]/[0.02] border-[#FF3300]/20 hover:border-[#FF3300]/40"
                                  : "bg-transparent border-white/5 hover:border-white/10"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={() => toggleSurface(opt.id)}
                                className="sr-only"
                              />
                              <div
                                className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-all flex-shrink-0 ${
                                  isEnabled
                                    ? "border-[#FF3300] bg-[#FF3300]"
                                    : "border-white/20 bg-transparent group-hover:border-white/40"
                                }`}
                              >
                                {isEnabled && <Check size={10} className="text-white stroke-[3px]" />}
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white/90 group-hover:text-white transition-colors">
                                    {opt.label}
                                  </span>
                                  <span className="text-[7px] text-white/30 px-1 border border-white/10 rounded uppercase font-bold">
                                    {opt.category}
                                  </span>
                                </div>
                                <span className="text-[10px] text-white/40 leading-snug">
                                  {opt.description}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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

              {/* ─── Scanner Walkthrough & Core Capabilities ─────────────────── */}
              <div className="mt-24 pt-16 border-t border-white/5 w-full text-left space-y-12">
                <div className="text-center space-y-4 max-w-xl mx-auto">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-[#FF3300]/20 bg-[#FF3300]/[0.02] text-[9px] font-mono text-[#FF3300] uppercase tracking-widest">
                    Operational Protocol
                  </div>
                  <h2 className="text-3xl font-black uppercase tracking-tight text-white font-mono">
                    Ecosystem Audit Mechanics
                  </h2>
                  <p className="text-sm text-white/40 leading-relaxed font-sans">
                    Analyze how autonomous AI agents traverse, parse, and ingest your product surfaces.
                  </p>
                </div>

                {/* Step Cards Sequential Timeline */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 w-full">
                  
                  {/* Step 1 */}
                  <div className="flex-1 w-full bg-white/[0.01] border border-white/5 hover:border-[#FF3300]/30 p-6 rounded-2xl space-y-3 transition-all duration-300 group min-h-[190px] flex flex-col justify-between">
                    <div>
                      <div className="text-2xl font-black font-mono text-[#FF3300]/50 group-hover:text-[#FF3300] transition-colors">01</div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono mt-2">Ecosystem Probing</h3>
                    </div>
                    <p className="text-xs text-white/45 leading-relaxed font-sans mt-2">
                      Input your docs root, OpenAPI spec, public GitHub repo, or sitemap. The scanner executes reachability verification and parses key specifications like <code className="text-white/70 font-mono">llms.txt</code>.
                    </p>
                  </div>

                  {/* Doodly Arrow 1 */}
                  <div className="flex shrink-0 items-center justify-center py-2 md:py-0">
                    {/* Desktop Arrow */}
                    <svg className="w-12 h-8 text-[#FF3300]/40 animate-pulse hidden md:block" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 25 C 20 10, 40 15, 60 35 C 75 48, 85 38, 95 25" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4" />
                      <path d="M85 17 C 88 20, 92 23, 95 25 C 91 28, 87 32, 84 35" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {/* Mobile Arrow */}
                    <svg className="w-8 h-12 text-[#FF3300]/40 animate-pulse md:hidden" viewBox="0 0 50 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M25 5 C 10 30, 40 70, 25 95" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4" />
                      <path d="M17 85 C 20 88, 23 92, 25 95 C 28 91, 32 87, 35 84" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  {/* Step 2 */}
                  <div className="flex-1 w-full bg-white/[0.01] border border-white/5 hover:border-[#22D3EE]/30 p-6 rounded-2xl space-y-3 transition-all duration-300 group min-h-[190px] flex flex-col justify-between">
                    <div>
                      <div className="text-2xl font-black font-mono text-[#22D3EE]/50 group-hover:text-[#22D3EE] transition-colors">02</div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono mt-2">Graph Synthesis</h3>
                    </div>
                    <p className="text-xs text-white/45 leading-relaxed font-sans mt-2">
                      Automatically maps out semantic references, conceptual dependencies, and API endpoints, building an interactive 3D directed graph to inspect isolated clusters and broken pathways.
                    </p>
                  </div>

                  {/* Doodly Arrow 2 */}
                  <div className="flex shrink-0 items-center justify-center py-2 md:py-0">
                    {/* Desktop Arrow */}
                    <svg className="w-12 h-8 text-[#22D3EE]/40 animate-pulse hidden md:block" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 20 C 35 40, 65 10, 95 30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4" />
                      <path d="M86 21 C 89 24, 92 27, 95 30 C 92 32, 88 35, 85 38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {/* Mobile Arrow */}
                    <svg className="w-8 h-12 text-[#22D3EE]/40 animate-pulse md:hidden" viewBox="0 0 50 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M25 5 C 40 30, 10 70, 25 95" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4" />
                      <path d="M17 85 C 20 88, 23 92, 25 95 C 28 91, 32 87, 35 84" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  {/* Step 3 */}
                  <div className="flex-1 w-full bg-white/[0.01] border border-white/5 hover:border-[#8B5CF6]/30 p-6 rounded-2xl space-y-3 transition-all duration-300 group min-h-[190px] flex flex-col justify-between">
                    <div>
                      <div className="text-2xl font-black font-mono text-[#8B5CF6]/50 group-hover:text-[#8B5CF6] transition-colors">03</div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono mt-2">Agent Simulation</h3>
                    </div>
                    <p className="text-xs text-white/45 leading-relaxed font-sans mt-2">
                      Simulates multiple task-driven agent workflows to locate integration friction. Evaluates hop counts, context size accumulation, and hallucination risks before delivering a custom remediation Markdown report.
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

        {/* ── Live Terminal ───────────────────────────────── */}
        {(isScanning || (logs.length > 0 && (!scanComplete || (Array.isArray(checks) ? checks.length === 0 : (checks?.surfaces?.length ?? 0) === 0)))) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-3xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[10px] font-mono text-white/30 uppercase tracking-widest">
                <Zap size={12} className="text-[#FF3300]" />
                Scanning: {normalizeUrl(rawInput)}
              </div>
              {scanComplete && (
                <button
                  onClick={handleReset}
                  className="text-[10px] font-mono text-white/30 hover:text-[#FF3300] uppercase tracking-widest transition-colors"
                >
                  ← New Scan
                </button>
              )}
            </div>
            <LiveTerminal logs={logs} isComplete={scanComplete} />
          </motion.div>
        )}

        {/* ── Results ─────────────────────────────────────── */}
        {scanComplete && (Array.isArray(checks) ? checks.length > 0 : (checks?.surfaces?.length ?? 0) > 0) && (
          <>
            <ResultsReport score={score} checks={checks} scanId={scanId || undefined} url={normalizeUrl(rawInput)} />
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
          href="https://glintbase.dev"
          target="_blank"
          rel="noreferrer"
          className="text-[10px] font-mono text-white/20 hover:text-[#FF3300] uppercase tracking-widest transition-colors"
        >
          glintbase.dev →
        </a>
      </footer>
    </>
  );
}

