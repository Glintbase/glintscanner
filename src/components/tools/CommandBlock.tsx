"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CommandBlockProps {
  /** The text to display and copy. */
  code: string;
  /** Optional small label above the block (e.g. a filename or "Terminal"). */
  label?: string;
  /** Visual hint; purely cosmetic. */
  language?: "bash" | "json" | "text";
}

/**
 * A mono code block with a copy-to-clipboard button.
 * Uses the native navigator.clipboard API (no dependencies).
 */
export function CommandBlock({ code, label, language = "text" }: CommandBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — fail silently.
    }
  };

  return (
    <div className="group relative w-full">
      {label && (
        <div className="flex items-center justify-between px-3 pt-2">
          <span className="text-[9px] font-mono uppercase tracking-widest text-white/30">
            {label}
          </span>
          <span className="text-[9px] font-mono uppercase tracking-widest text-white/15">
            {language}
          </span>
        </div>
      )}
      <div className="relative rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <pre className="overflow-x-auto no-scrollbar px-4 py-3.5 pr-12 text-[12px] sm:text-[13px] leading-relaxed font-mono text-white/80 whitespace-pre">
          {code}
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy to clipboard"}
          className="absolute top-2.5 right-2.5 flex items-center justify-center h-8 w-8 rounded-lg border border-white/10 bg-black/40 text-white/40 hover:text-white hover:border-[#FF3300]/40 transition-all"
        >
          {copied ? (
            <Check size={13} className="text-[#FF3300]" />
          ) : (
            <Copy size={13} />
          )}
        </button>
      </div>
    </div>
  );
}

export default CommandBlock;
