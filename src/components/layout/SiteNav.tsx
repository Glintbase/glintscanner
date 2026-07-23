import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GlintbaseLogo } from "./GlintbaseLogo";

// Shared top navigation. Server-safe (no client hooks).
export function SiteNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] border-b border-white/5 bg-black/80 backdrop-blur-xl px-4 sm:px-6 py-3 sm:py-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
        <a
          href="https://glintbase.dev"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 sm:gap-3 group shrink-0"
        >
          <div className="transition-transform duration-500 group-hover:rotate-12">
            <GlintbaseLogo size={24} />
          </div>
          <span className="text-xs sm:text-sm font-black tracking-[0.2em] uppercase text-[#F1F5F9]">
            Glint<span className="text-white/25">base</span>
          </span>
        </a>
        <div className="flex items-center gap-3 sm:gap-6 shrink-0">
          <Link
            href="/tools"
            className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
          >
            Tools
          </Link>
          <Link
            href="/mcp"
            className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
          >
            MCP
          </Link>
          <Link
            href="/leaderboard"
            className="hidden sm:inline text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
          >
            Leaderboard
          </Link>
          <span className="hidden lg:block text-[10px] font-mono text-white/20 uppercase tracking-widest">
            Scanner_v1
          </span>
          <a
            href="https://glintbase.dev"
            target="_blank"
            rel="noreferrer"
            className="bg-[#FF3300] text-white font-black text-[9px] sm:text-[10px] uppercase tracking-widest px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-[#FF3300]/90 transition-all shadow-[0_0_20px_rgba(255,51,0,0.25)] flex items-center gap-1.5 whitespace-nowrap"
          >
            Join Waitlist <ArrowRight size={11} />
          </a>
        </div>
      </div>
    </nav>
  );
}

export default SiteNav;
