"use client";

import React from 'react';
import type { AnswerCheck, JourneyKPIMetrics } from '@/lib/scanner/simulator/types';

interface JourneyKPICardsProps {
  kpis?: JourneyKPIMetrics;
  answerCheck?: AnswerCheck;
}

const VERDICT: Record<AnswerCheck['verdict'], { label: string; tone: string; dot: string }> = {
  found_with_evidence: { label: 'Answer found, quote verified', tone: 'border-emerald-700/60 text-emerald-400', dot: 'bg-emerald-400' },
  claimed_unsupported: { label: 'Answer claimed, quote not on any fetched page', tone: 'border-amber-700/60 text-amber-400', dot: 'bg-amber-400' },
  not_found: { label: 'No answer in the pages opened', tone: 'border-red-800/60 text-red-400', dot: 'bg-red-400' },
  not_checked: { label: 'Answer not checked', tone: 'border-white/[0.08] text-stone-400', dot: 'bg-stone-500' },
};

function AnswerCard({ check }: { check: AnswerCheck }) {
  const v = VERDICT[check.verdict];
  let sourcePath = '';
  try {
    sourcePath = check.sourceUrl ? new URL(check.sourceUrl).pathname : '';
  } catch {}
  return (
    <div className={`bg-[#121214] border rounded-xl p-5 space-y-3 md:col-span-3 ${v.tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider">
          <span className={`w-2 h-2 rounded-full ${v.dot}`} />
          <span>{v.label}</span>
        </div>
        {check.model && <span className="text-[10px] font-mono text-stone-500">checked with {check.model}</span>}
      </div>
      {check.answer && <p className="text-sm text-stone-100 leading-relaxed">{check.answer}</p>}
      {check.quote && (
        <blockquote className="border-l-2 border-white/[0.15] pl-3 text-[12px] font-mono text-stone-300 leading-relaxed">
          “{check.quote}”
          {sourcePath && <span className="block pt-1 text-[10px] text-stone-500">{check.sourceUrl}</span>}
        </blockquote>
      )}
      <p className="text-[10px] font-mono text-stone-500 leading-snug">
        {check.note} The verdict is decided by matching the quote against the text the run actually fetched, not by the model.
      </p>
    </div>
  );
}

function Card({ value, pct, label, detail, tone }: { value: string; pct: number; label: string; detail: string; tone: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-red-400';
  const bar = tone === 'good' ? 'bg-emerald-400' : tone === 'warn' ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="bg-[#121214] border border-white/[0.08] rounded-xl p-5 space-y-3">
      <div className={`text-3xl sm:text-4xl font-mono font-black tabular-nums ${color}`}>{value}</div>
      <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400">{label}</div>
      <div className="text-[10px] font-mono text-stone-500 leading-snug">{detail}</div>
    </div>
  );
}

/** All three cards are computed from the run's own requests; nothing is defaulted. */
export default function JourneyKPICards({ kpis, answerCheck }: JourneyKPICardsProps) {
  if (!kpis) return null;
  const filesPct = kpis.agentFilesChecked ? (kpis.agentFilesFound / kpis.agentFilesChecked) * 100 : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
      {answerCheck && <AnswerCard check={answerCheck} />}
      <Card
        value={`${kpis.pagesReachedPct}%`}
        pct={kpis.pagesReachedPct}
        label="Pages reached"
        detail="Share of requested pages that answered 2xx/3xx."
        tone={kpis.pagesReachedPct >= 75 ? 'good' : kpis.pagesReachedPct >= 40 ? 'warn' : 'bad'}
      />
      <Card
        value={String(kpis.deadEnds)}
        pct={kpis.deadEnds === 0 ? 100 : Math.max(10, 100 - kpis.deadEnds * 25)}
        label="Dead ends"
        detail="Requested pages that answered 4xx/5xx or failed to load."
        tone={kpis.deadEnds === 0 ? 'good' : kpis.deadEnds <= 2 ? 'warn' : 'bad'}
      />
      <Card
        value={`${kpis.agentFilesFound}/${kpis.agentFilesChecked}`}
        pct={filesPct}
        label="Agent files found"
        detail="llms.txt, openapi.json, robots.txt and auth.md at the site root."
        tone={kpis.agentFilesFound >= 2 ? 'good' : kpis.agentFilesFound === 1 ? 'warn' : 'bad'}
      />
    </div>
  );
}
