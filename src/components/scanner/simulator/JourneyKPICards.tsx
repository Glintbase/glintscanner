"use client";

import React from 'react';
import type { JourneyKPIMetrics } from '@/lib/scanner/simulator/types';

interface JourneyKPICardsProps {
  kpis?: JourneyKPIMetrics;
}

export default function JourneyKPICards({ kpis }: JourneyKPICardsProps) {
  const answerFromSite = kpis?.answerFromSite ?? 100;
  const answerEfficiency = kpis?.answerEfficiency ?? 50;
  const followedSiteLinks = kpis?.followedSiteLinks ?? 73;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
      {/* Card 1: Answer From Your Site */}
      <div className="bg-[#121214] border border-white/[0.08] rounded-xl p-5 space-y-3">
        <div className="text-3xl sm:text-4xl font-mono font-black text-emerald-400 tabular-nums">
          {answerFromSite}%
        </div>
        <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, Math.max(0, answerFromSite))}%` }}
          />
        </div>
        <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400">
          ANSWER FROM YOUR SITE
        </div>
      </div>

      {/* Card 2: Answer Efficiency */}
      <div className="bg-[#121214] border border-white/[0.08] rounded-xl p-5 space-y-3">
        <div className="text-3xl sm:text-4xl font-mono font-black text-amber-400 tabular-nums">
          {answerEfficiency}%
        </div>
        <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, Math.max(0, answerEfficiency))}%` }}
          />
        </div>
        <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400">
          ANSWER EFFICIENCY
        </div>
      </div>

      {/* Card 3: Followed Site Links */}
      <div className="bg-[#121214] border border-white/[0.08] rounded-xl p-5 space-y-3">
        <div className="text-3xl sm:text-4xl font-mono font-black text-emerald-400 tabular-nums">
          {followedSiteLinks}%
        </div>
        <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, Math.max(0, followedSiteLinks))}%` }}
          />
        </div>
        <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400">
          FOLLOWED SITE LINKS
        </div>
      </div>
    </div>
  );
}
