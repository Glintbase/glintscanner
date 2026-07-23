import { GlintbaseLogo } from "./GlintbaseLogo";

// Shared footer. Server-safe (no client hooks).
export function SiteFooter() {
  return (
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
  );
}

export default SiteFooter;
