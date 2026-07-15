"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ChevronRight } from "lucide-react";

interface LeaderboardItem {
  rank: number;
  company: string;
  url: string;
  score: number;
  id: string | null;
}

const CATEGORIES = ["ALL", "AI", "INFRASTRUCTURE", "DEVTOOLS", "PRODUCTIVITY"];

function getCompanyCategory(companyName: string): "AI" | "INFRASTRUCTURE" | "DEVTOOLS" | "PRODUCTIVITY" {
  const name = companyName.toLowerCase();

  if (
    ["browserbase", "anaconda", "arize", "cerebras", "greptile", "ollama", "cartesia", "claude", "openai", "chatgpt", "deepseek", "kimi", "agent", "vellum", "grok", "langchain", "stackai", "lovable", "cognee"].some(
      (x) => name.includes(x)
    )
  ) {
    return "AI";
  }

  if (
    ["neon", "cloudflare", "stripe", "vercel", "supabase", "sui", "base", "mapbox", "restate", "e2b", "postman", "convex", "spaceship", "spacex", "coingecko", "wikipedia"].some(
      (x) => name.includes(x)
    )
  ) {
    return "INFRASTRUCTURE";
  }

  if (
    ["resend", "bun", "mintlify", "github", "gitbook", "writewiz", "openrouter", "ferndesk", "formhookapp", "apexapp", "opencode", "kilo", "lemonsqueezy", "baseten", "chatbase"].some(
      (x) => name.includes(x)
    )
  ) {
    return "DEVTOOLS";
  }

  if (["notion", "discord", "aladewealth", "hol", "pxxl"].some((x) => name.includes(x))) {
    return "PRODUCTIVITY";
  }

  return "DEVTOOLS";
}

export default function LeaderboardClient({ initialData }: { initialData: LeaderboardItem[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");

  const filteredData = useMemo(() => {
    return initialData.filter((item) => {
      // 1. Search term match
      const matchesSearch =
        item.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.url.toLowerCase().includes(searchTerm.toLowerCase());

      // 2. Category match
      const companyCat = getCompanyCategory(item.company);
      const matchesCategory = activeCategory === "ALL" || companyCat === activeCategory;

      return matchesSearch && matchesCategory;
    });
  }, [initialData, searchTerm, activeCategory]);

  return (
    <div className="w-full flex flex-col items-center">
      {/* Search and Category Filter Bar */}
      <div className="w-full flex flex-col md:flex-row items-center justify-center gap-4 mt-8 mb-12">
        {/* Search Input */}
        <div className="relative w-full max-w-xs">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="SEARCH.."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/[0.03] border border-white/10 rounded-full pl-10 pr-4 py-2 text-xs text-white uppercase tracking-wider placeholder-white/20 focus:outline-none focus:border-[#FF3300]/50 transition-all font-mono"
          />
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono transition-all border ${
                  isActive
                    ? "bg-[#FF3300] border-[#FF3300] text-white shadow-[0_0_15px_rgba(255,51,0,0.3)]"
                    : "bg-transparent border-white/10 text-white/50 hover:border-white/20 hover:text-white"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Leaderboard Grid */}
      {filteredData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-white/30 font-mono text-xs">
          No active scan profiles matched your query.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2 w-full max-w-6xl">
          {filteredData.map((item) => {
            const categoryName = getCompanyCategory(item.company);
            return (
              <Link
                href={item.id ? `/scan/${item.company.toLowerCase()}` : "#"}
                key={item.id ?? item.url}
                className="group relative flex items-center justify-between border border-transparent hover:border-[#FF3300]/20 rounded-xl px-5 py-3 transition-all duration-300 hover:bg-[#FF3300]/[0.03]"
              >
                <div className="flex items-center gap-4">
                  {/* Score */}
                  <span className="text-3xl font-black font-mono tracking-tighter text-[#FF3300] min-w-[54px]">
                    {item.score}
                  </span>

                  {/* Vertical Separator */}
                  <div className="h-6 w-[1px] bg-white/10 group-hover:bg-[#FF3300]/30 transition-colors" />

                  {/* Details */}
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white group-hover:text-[#FF3300] transition-colors uppercase tracking-wider">
                      {item.company}
                    </span>
                    <span className="text-[9px] font-mono uppercase tracking-widest text-white/30 mt-0.5">
                      {categoryName}
                    </span>
                  </div>
                </div>

                {/* Chevron */}
                <ChevronRight
                  size={14}
                  className="text-[#FF3300] opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0"
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
