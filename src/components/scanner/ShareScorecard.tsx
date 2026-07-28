"use client";

import { useState } from "react";
import { Copy, Check, Download, Share2 } from "lucide-react";

interface ShareScorecardProps {
  slug: string;
  company: string;
  score: number;
  band: string;
}

/**
 * Share panel for the scan results page: scorecard PNG preview + X / LinkedIn
 * intents, copy-link, and PNG download. Social platforms unfurl the scan
 * page's OG image; the PNG route covers manual attach/download.
 */
export default function ShareScorecard({ slug, company, score, band }: ShareScorecardProps) {
  const [copied, setCopied] = useState(false);

  const scanUrl = `https://scan.glintbase.dev/scan/${slug}`;
  const scorecardPath = `/api/scorecard/${slug}`;
  const shareText = `${company} scored ${score}/100 on Agent Readiness (${band}). Scan yours →`;

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(scanUrl)}`;
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(scanUrl)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(scanUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — nothing to do
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto mb-8">
      <div className="glint-card relative rounded-2xl border border-white/10 overflow-hidden p-6 md:p-7">
        <div className="flex items-center gap-2 text-[10px] font-mono text-white/30 uppercase tracking-[0.35em] mb-4">
          <Share2 size={12} className="text-[#FF3300]" />
          Share your scorecard
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Scorecard preview */}
          <div className="md:w-1/2 flex-shrink-0">
            <div className="rounded-xl border border-white/10 overflow-hidden bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={scorecardPath}
                alt={`${company} Agent Readiness scorecard — ${score}/100`}
                className="w-full h-auto block"
                loading="lazy"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex-1 flex flex-col justify-center gap-2.5">
            <a
              href={xUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-white text-black font-black text-xs uppercase tracking-[0.2em] px-5 py-3 rounded-xl hover:bg-white/90 transition-all"
            >
              {/* X logo */}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Share on X
            </a>
            <a
              href={linkedInUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#0A66C2] text-white font-black text-xs uppercase tracking-[0.2em] px-5 py-3 rounded-xl hover:bg-[#0A66C2]/85 transition-all"
            >
              {/* LinkedIn logo */}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.555V9h3.564v11.452z" />
              </svg>
              Share on LinkedIn
            </a>
            <button
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-2 border border-white/15 bg-white/5 text-white font-black text-xs uppercase tracking-[0.2em] px-5 py-3 rounded-xl hover:bg-white/10 transition-all"
            >
              {copied ? <Check size={13} className="text-[#22C55E]" /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy link"}
            </button>
            <a
              href={scorecardPath}
              download={`${slug}-agent-readiness-scorecard.png`}
              className="inline-flex items-center justify-center gap-2 border border-[#FF3300]/40 bg-[#FF3300]/10 text-[#FF3300] font-black text-xs uppercase tracking-[0.2em] px-5 py-3 rounded-xl hover:bg-[#FF3300]/20 transition-all"
            >
              <Download size={13} />
              Download PNG
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
