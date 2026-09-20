"use client";

import React, { useState } from 'react';
import { Terminal, Copy, Check, Sparkles } from 'lucide-react';

interface LiveTerminalFeedProps {
  logs?: string[];
  activeProvider?: string;
}

export default function LiveTerminalFeed({
  logs = [],
  activeProvider = 'Autonomous Agent Mesh (Live)',
}: LiveTerminalFeedProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(logs.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-full bg-[#0D0D0E] border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl">
      {/* Terminal Window Chrome */}
      <div className="bg-[#141416] px-4 py-2.5 border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          <span className="text-[11px] font-mono text-stone-400 font-semibold ml-2 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-[#FF3300]" />
            <span>e2b-sandbox:agent-harness</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded px-2 py-0.5 text-[10px] font-mono text-stone-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{activeProvider}</span>
          </div>

          <button
            onClick={handleCopy}
            className="p-1 rounded text-stone-400 hover:text-white transition cursor-pointer"
            title="Copy terminal logs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Terminal Log Viewport */}
      <div className="p-4 font-mono text-[11px] leading-relaxed text-stone-300 overflow-y-auto max-h-[360px] space-y-1 select-text">
        {logs.length === 0 ? (
          <div className="text-stone-500 italic">No terminal output yet. Launch a mission to inspect live logs.</div>
        ) : (
          logs.map((line, idx) => (
            <div key={idx} className="break-all whitespace-pre-wrap">
              {line.startsWith('[glintbase') ? (
                <span className="text-[#FF3300] font-semibold">{line}</span>
              ) : line.startsWith('[agent') ? (
                <span className="text-emerald-400 font-semibold">{line}</span>
              ) : line.includes('HTTP 200') ? (
                <span className="text-emerald-400">{line}</span>
              ) : line.includes('HTTP 404') || line.includes('403') ? (
                <span className="text-rose-400">{line}</span>
              ) : (
                <span className="text-stone-300">{line}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
