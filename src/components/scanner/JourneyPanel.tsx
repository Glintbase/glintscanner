"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, CheckCircle2, XCircle, AlertTriangle, Clock,
  Minus, ExternalLink, Zap, ChevronRight, CornerDownRight,
  TrendingUp, Cpu, ChevronDown
} from 'lucide-react';

// ── Types (mirrors backend types) ─────────────────────────────────────────

interface JourneyStep {
  step: number;
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  url?: string;
  action: string;
  found: string;
  edgeType?: string;
  outcome: 'progress' | 'success' | 'stall' | 'dead_end' | 'missing' | 'inferred';
  inferenceRequired: boolean;
  stepConfidence: 'high' | 'medium' | 'low';
  canonical: boolean;
}

interface JourneyBreakpoint {
  type: string;
  surface?: string;
  reason: string;
}

interface JourneyCost {
  pagesVisited: number;
  inferencePoints: number;
  tokenWasteEstimate: 'low' | 'medium' | 'high';
  hops: number;
  retrievalBreadth: number;
}

interface JourneyTrace {
  journey: string;
  label: string;
  goal: string;
  mode: 'canonical' | 'recovery' | 'ambiguous';
  status: 'passed' | 'failed' | 'partial';
  success: boolean;
  confidence: 'high' | 'medium' | 'low';
  startSurface: string;
  steps: JourneyStep[];
  breakpoint: JourneyBreakpoint | null;
  cost: JourneyCost;
  recommendedFix: string | null;
  hallucinationPressure: 'low' | 'medium' | 'high';
  hopCount: number;
  retrievalBreadth: number;
  fragmentationScore: number;
}

interface JourneySimulation {
  traces: JourneyTrace[];
  overallCompletionRate: number;
  avgHopCount: number;
  avgFragmentationScore: number;
  highRiskJourneys: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  passed:  { label: 'Passed',  color: 'text-[#22D3EE]', bg: 'bg-[#22D3EE]/10', border: 'border-[#22D3EE]/20', dot: 'bg-[#22D3EE]' },
  failed:  { label: 'Failed',  color: 'text-[#FF3300]', bg: 'bg-[#FF3300]/10', border: 'border-[#FF3300]/20', dot: 'bg-[#FF3300]' },
  partial: { label: 'Partial', color: 'text-amber-400',  bg: 'bg-amber-400/10',  border: 'border-amber-400/20',  dot: 'bg-amber-400' },
};

const CONFIDENCE_CONFIG = {
  high:   { label: 'High Confidence',   color: 'text-[#22D3EE]', bg: 'bg-[#22D3EE]/10 border border-[#22D3EE]/20' },
  medium: { label: 'Medium Confidence', color: 'text-amber-400',  bg: 'bg-amber-400/10 border border-amber-400/20' },
  low:    { label: 'Low Confidence',    color: 'text-[#FF3300]', bg: 'bg-[#FF3300]/10 border border-[#FF3300]/20' },
};

const OUTCOME_CONFIG = {
  success:  { color: 'bg-[#22D3EE]',    text: 'text-[#22D3EE]',    label: 'Success',     lineColor: 'border-[#22D3EE]/30' },
  progress: { color: 'bg-white/20',     text: 'text-white/60',     label: 'Progress',    lineColor: 'border-white/10' },
  inferred: { color: 'bg-amber-400',    text: 'text-amber-400',    label: 'Inferred',    lineColor: 'border-amber-400/30' },
  stall:    { color: 'bg-amber-400',    text: 'text-amber-400',    label: 'Stalled',     lineColor: 'border-amber-400/30' },
  dead_end: { color: 'bg-[#FF3300]',    text: 'text-[#FF3300]',    label: 'Dead End',    lineColor: 'border-[#FF3300]/30' },
  missing:  { color: 'bg-[#FF3300]/70', text: 'text-[#FF3300]/80', label: 'Missing',     lineColor: 'border-[#FF3300]/20' },
};

const WASTE_CONFIG = {
  low:    { label: 'Low Token Waste',    color: 'text-[#22D3EE]', bg: 'bg-[#22D3EE]/10 border border-[#22D3EE]/20' },
  medium: { label: 'Medium Token Waste', color: 'text-amber-400',  bg: 'bg-amber-400/10 border border-amber-400/20' },
  high:   { label: 'High Token Waste',   color: 'text-[#FF3300]', bg: 'bg-[#FF3300]/10 border border-[#FF3300]/20' },
};

const MODE_LABELS = {
  canonical: { label: 'Canonical', color: 'text-[#8B5CF6]' },
  recovery:  { label: 'Recovery',  color: 'text-amber-400' },
  ambiguous: { label: 'Ambiguous', color: 'text-[#FF3300]' },
};

const NODE_TYPE_LABELS: Record<string, string> = {
  canonical_link: 'Canonical',
  api: 'API',
  operation: 'Operation',
  sdk: 'SDK',
  concept: 'Concept',
  workflow: 'Workflow',
  prerequisite: 'Prerequisite',
  code_example: 'Code Example',
  machine_entrypoint: 'Machine Entrypoint',
  support_path: 'Support',
  page: 'Page',
  unresolved_reference: 'Missing',
  duplicate: 'Duplicate',
};

const BREAKPOINT_LABELS: Record<string, string> = {
  dead_end: 'Dead end',
  max_hops_exceeded: 'Max hops exceeded',
  unresolved_reference: 'Unresolved reference',
  inference_required: 'Inference required',
  no_start_node: 'No start node',
  no_evidence: 'No evidence',
  missing_prerequisite: 'Missing prerequisite',
};

// ── Sub-components ─────────────────────────────────────────────────────────

function NodeTypeBadge({ type }: { type: string }) {
  const label = NODE_TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
  const colors: Record<string, string> = {
    canonical_link: 'text-[#FF3300] bg-[#FF3300]/10 border-[#FF3300]/20',
    api: 'text-[#FF3300] bg-[#FF3300]/10 border-[#FF3300]/20',
    sdk: 'text-[#FF3300] bg-[#FF3300]/10 border-[#FF3300]/20',
    concept: 'text-[#22D3EE] bg-[#22D3EE]/10 border-[#22D3EE]/20',
    workflow: 'text-[#22D3EE] bg-[#22D3EE]/10 border-[#22D3EE]/20',
    machine_entrypoint: 'text-[#22D3EE] bg-[#22D3EE]/10 border-[#22D3EE]/20',
    page: 'text-[#8B5CF6] bg-[#8B5CF6]/10 border-[#8B5CF6]/20',
    support_path: 'text-white/40 bg-white/5 border-white/10',
    unresolved_reference: 'text-[#FF3300] bg-[#FF3300]/10 border-[#FF3300]/20',
  };
  const cls = colors[type] ?? 'text-white/40 bg-white/5 border-white/10';
  return (
    <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border ${cls} uppercase tracking-wider`}>
      {label}
    </span>
  );
}

function StepInspector({ step, onClose }: { step: JourneyStep; onClose: () => void }) {
  const oc = OUTCOME_CONFIG[step.outcome] ?? OUTCOME_CONFIG.progress;
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.18 }}
      className="h-full flex flex-col overflow-y-auto no-scrollbar"
    >
      {/* Inspector header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2 flex-shrink-0">
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Step Inspector</span>
        <button onClick={onClose} className="text-white/20 hover:text-white/60 transition-colors text-xs">✕</button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Step number + label */}
        <div>
          <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider mb-1">Step {step.step}</div>
          <div className="text-sm font-semibold text-white leading-snug">{step.nodeLabel}</div>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            <NodeTypeBadge type={step.nodeType} />
            {step.canonical && (
              <span className="text-[8px] font-mono px-1.5 py-0.5 rounded border text-[#FF3300] bg-[#FF3300]/10 border-[#FF3300]/20 uppercase tracking-wider">Canonical</span>
            )}
          </div>
        </div>

        {/* URL */}
        {step.url && (
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
            <div className="text-[9px] text-white/30 font-mono mb-1 uppercase tracking-wider">URL</div>
            <a href={step.url} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-[#22D3EE] font-mono break-all hover:underline flex items-center gap-1">
              {step.url}
              <ExternalLink size={8} className="flex-shrink-0" />
            </a>
          </div>
        )}

        {/* Action + Found */}
        <div className="space-y-2">
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
            <div className="text-[9px] text-white/30 font-mono mb-1 uppercase tracking-wider">Action Taken</div>
            <div className="text-[11px] text-white/70">{step.action}</div>
          </div>
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
            <div className="text-[9px] text-white/30 font-mono mb-1 uppercase tracking-wider">What Agent Found</div>
            <div className="text-[11px] text-white/70">{step.found}</div>
          </div>
        </div>

        {/* Edge type */}
        {step.edgeType && (
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
            <div className="text-[9px] text-white/30 font-mono mb-1 uppercase tracking-wider">Traversal Edge</div>
            <div className="text-[10px] font-mono text-[#8B5CF6]">{step.edgeType.replace(/_/g, ' ')}</div>
          </div>
        )}

        {/* Outcome + Confidence + Inference */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 text-center">
            <div className="text-[9px] text-white/30 font-mono mb-1 uppercase tracking-wider">Outcome</div>
            <div className={`text-[10px] font-semibold ${oc.text}`}>{oc.label}</div>
          </div>
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 text-center">
            <div className="text-[9px] text-white/30 font-mono mb-1 uppercase tracking-wider">Confidence</div>
            <div className={`text-[10px] font-semibold ${CONFIDENCE_CONFIG[step.stepConfidence].color}`}>
              {step.stepConfidence.charAt(0).toUpperCase() + step.stepConfidence.slice(1)}
            </div>
          </div>
        </div>

        {/* Inference warning */}
        {step.inferenceRequired && (
          <div className="rounded-lg bg-amber-400/[0.05] border border-amber-400/20 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle size={10} className="text-amber-400" />
              <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">Inference Required</span>
            </div>
            <p className="text-[10px] text-white/40 leading-relaxed">
              The agent chose this node with a low relevance score — it had to guess based on limited signals. This increases hallucination risk.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function JourneyPanel({ journeys }: { journeys: JourneySimulation }) {
  // Safe helper arrays to prevent undefined/null errors
  const traces = journeys?.traces ?? [];
  const highRiskJourneys = journeys?.highRiskJourneys ?? [];

  const [selectedJourney, setSelectedJourney] = useState<string>(traces[0]?.journey ?? '');
  const [selectedStep, setSelectedStep] = useState<JourneyStep | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const activeTrace = traces.find(t => t.journey === selectedJourney) ?? traces[0];

  const handleJourneySelect = (id: string) => {
    setSelectedJourney(id);
    setSelectedStep(null);
  };

  // If no traces simulated, render a friendly empty state
  if (traces.length === 0 || !activeTrace) {
    return (
      <div className="mt-6 rounded-2xl border border-white/[0.06] bg-black p-8 text-center text-white/40 glint-card font-mono text-[10px]">
        No pathfinder journeys available for this scan.
      </div>
    );
  }

  // Safe fallback configuration mappings to prevent "Cannot read properties of undefined (reading 'dot')"
  const activeStatus = STATUS_CONFIG[activeTrace.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.failed;
  const activeMode = MODE_LABELS[activeTrace.mode as keyof typeof MODE_LABELS] || MODE_LABELS.ambiguous;
  const activeConfidence = CONFIDENCE_CONFIG[activeTrace.confidence as keyof typeof CONFIDENCE_CONFIG] || CONFIDENCE_CONFIG.low;
  
  // Safe cost fallback
  const cost = activeTrace.cost || {
    pagesVisited: 0,
    retrievalBreadth: 0,
    inferencePoints: 0,
    tokenWasteEstimate: 'medium',
    hops: 0
  };

  return (
    <div className="mt-6 rounded-2xl border border-white/[0.06] bg-black overflow-hidden glint-card">

      {/* ── Panel Header ── */}
      <div className="px-6 py-4 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 flex items-center justify-center flex-shrink-0">
            <Bot size={16} className="text-[#8B5CF6]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Agent Journey Pathfinder</h3>
            <p className="text-[10px] text-white/30 font-mono mt-0.5">
              Deterministic multi-start traversal (not LLM reasoning) across the knowledge graph
            </p>
          </div>
        </div>
        <div className="flex items-center gap-5 flex-shrink-0">
          <div className="text-center">
            <div className="text-xl font-bold text-white tabular-nums">{journeys?.overallCompletionRate ?? 0}<span className="text-white/20 text-xs">%</span></div>
            <div className="text-[9px] text-white/30 font-mono uppercase tracking-wider">Completion</div>
          </div>
          <div className="w-px h-8 bg-white/[0.06]" />
          <div className="text-center">
            <div className="text-xl font-bold text-white tabular-nums">{journeys?.avgHopCount ?? 0}</div>
            <div className="text-[9px] text-white/30 font-mono uppercase tracking-wider">Avg Hops</div>
          </div>
          <div className="w-px h-8 bg-white/[0.06]" />
          <div className="text-center">
            <div className={`text-xl font-bold tabular-nums ${
              highRiskJourneys.length === 0 ? 'text-[#22D3EE]' :
              highRiskJourneys.length <= 2 ? 'text-amber-400' : 'text-[#FF3300]'
            }`}>{highRiskJourneys.length}</div>
            <div className="text-[9px] text-white/30 font-mono uppercase tracking-wider">High Risk</div>
          </div>
        </div>
      </div>

      {/* ── Two-panel body with collapsible dropdown selector ── */}
      <div className="flex flex-col lg:flex-row min-h-0 lg:min-h-[520px]">

        {/* CENTER — Step Timeline */}
        <div className="flex-1 flex flex-col overflow-y-auto border-b lg:border-b-0 lg:border-r border-white/[0.06] no-scrollbar relative">
          
          {/* Journey Dropdown Selector (collapses sidebar into a clean interactive menu) */}
          <div className="px-5 py-4 border-b border-white/[0.04] bg-black/40 backdrop-blur-md sticky top-0 z-30">
            <div className="relative">
              <label className="text-[9px] font-mono text-white/30 uppercase tracking-widest block mb-1.5 font-bold">Select Simulated Agent Task</label>
              
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:border-white/25 transition-all text-left group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${activeStatus.dot}`} />
                  <div className="min-w-0 truncate">
                    <span className="text-xs font-semibold text-white/90 group-hover:text-white transition-colors">{activeTrace.label}</span>
                    <span className={`text-[9px] font-mono ml-2.5 ${activeMode.color} uppercase tracking-wider`}>
                      ({activeMode.label})
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider font-semibold ${
                    activeStatus.bg
                  } ${activeStatus.border} ${activeStatus.color}`}>
                    {activeStatus.label}
                  </span>
                  <ChevronDown size={14} className={`text-white/40 group-hover:text-white/70 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {/* Floating dropdown options list */}
              {isDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                  <div className="absolute left-0 right-0 mt-2 bg-black border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-50 max-h-72 overflow-y-auto no-scrollbar glint-card">
                    {journeys.traces.map(trace => {
                      const sc = STATUS_CONFIG[trace.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.failed;
                      const sm = MODE_LABELS[trace.mode as keyof typeof MODE_LABELS] || MODE_LABELS.ambiguous;
                      const traceCost = trace.cost || { pagesVisited: 0, retrievalBreadth: 0, inferencePoints: 0, tokenWasteEstimate: 'medium', hops: 0 };
                      const sw = WASTE_CONFIG[traceCost.tokenWasteEstimate as keyof typeof WASTE_CONFIG] || WASTE_CONFIG.medium;
                      const isSelected = trace.journey === selectedJourney;
                      return (
                        <button
                          key={trace.journey}
                          onClick={() => {
                            handleJourneySelect(trace.journey);
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-3 border-b border-white/[0.03] last:border-b-0 transition-all duration-150 flex items-center justify-between ${
                            isSelected ? 'bg-white/[0.05]' : 'hover:bg-white/[0.02]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-white/85 truncate">{trace.label}</div>
                              <div className="flex items-center gap-2 mt-0.5 text-[9px] font-mono text-white/30">
                                <span className={sm.color}>{sm.label}</span>
                                <span>·</span>
                                <span>{trace.hopCount} hops</span>
                                <span>·</span>
                                <span className={sw.color}>{sw.label}</span>
                              </div>
                            </div>
                          </div>
                          <span className={`text-[8.5px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider font-semibold ${sc.bg} ${sc.border} ${sc.color} flex-shrink-0`}>
                            {sc.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Journey goal header */}
          <div className="px-5 py-4 border-b border-white/[0.04] flex-shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                activeStatus.bg
              } ${activeStatus.border} ${activeStatus.color}`}>
                {activeStatus.label}
              </span>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                activeConfidence.bg
              } ${activeConfidence.color}`}>
                {activeConfidence.label}
              </span>
              <span className={`text-[9px] font-mono ${activeMode.color}`}>
                {activeMode.label} Journey
              </span>
            </div>
            <h4 className="text-sm font-bold text-white">{activeTrace.label}</h4>
            <p className="text-[11px] text-white/40 mt-0.5">{activeTrace.goal}</p>
            <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-white/30">
              <span>Start: <span className="text-white/50">{activeTrace.startSurface}</span></span>
              <span>·</span>
              <span>{activeTrace.hopCount} hop{activeTrace.hopCount !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>{cost.pagesVisited} page{cost.pagesVisited !== 1 ? 's' : ''}</span>
              {cost.inferencePoints > 0 && (
                <>
                  <span>·</span>
                  <span className="text-amber-400">{cost.inferencePoints} inference{cost.inferencePoints > 1 ? 's' : ''}</span>
                </>
              )}
            </div>
          </div>

          {/* Step trace */}
          <div className="flex-1 p-5 space-y-0 overflow-y-auto no-scrollbar">
            {(activeTrace.steps ?? []).map((step, idx) => {
              const oc = OUTCOME_CONFIG[step.outcome] ?? OUTCOME_CONFIG.progress;
              const isLast = idx === (activeTrace.steps ?? []).length - 1;
              const isSelected = selectedStep?.step === step.step;

              return (
                <div key={step.step} className="relative flex gap-3">
                  {/* Vertical connector line */}
                  {!isLast && (
                    <div className={`absolute left-[13px] top-7 bottom-0 w-px border-l-2 border-dashed ${oc.lineColor}`} />
                  )}

                  {/* Step circle */}
                  <div className="flex-shrink-0 relative z-10">
                    <div className={`w-7 h-7 rounded-full ${oc.color} flex items-center justify-center text-[9px] font-bold text-black`}>
                      {step.outcome === 'success' ? '✓' :
                       step.outcome === 'dead_end' ? '⊗' :
                       step.outcome === 'missing' ? '?' :
                       step.outcome === 'stall' ? '⊘' :
                       step.outcome === 'inferred' ? '~' :
                       step.step}
                    </div>
                  </div>

                  {/* Step content */}
                  <button
                    onClick={() => setSelectedStep(isSelected ? null : step)}
                    className={`flex-1 min-w-0 mb-4 rounded-xl border px-3.5 py-2.5 text-left transition-all duration-150 ${
                      isSelected
                        ? 'border-[#8B5CF6]/40 bg-[#8B5CF6]/[0.06]'
                        : step.outcome === 'inferred'
                          ? 'border-amber-400/20 bg-amber-400/[0.03] hover:border-amber-400/30'
                          : step.outcome === 'dead_end' || step.outcome === 'missing'
                            ? 'border-[#FF3300]/20 bg-[#FF3300]/[0.03] hover:border-[#FF3300]/30'
                            : step.outcome === 'success'
                              ? 'border-[#22D3EE]/20 bg-[#22D3EE]/[0.03] hover:border-[#22D3EE]/30'
                              : 'border-white/[0.06] bg-white/[0.01] hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-semibold text-white/80 truncate">{step.nodeLabel}</span>
                        <NodeTypeBadge type={step.nodeType} />
                        {step.inferenceRequired && (
                          <span className="text-[8px] font-mono text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded">INFERRED</span>
                        )}
                        {step.canonical && (
                          <span className="text-[8px] font-mono text-[#FF3300] bg-[#FF3300]/10 border border-[#FF3300]/20 px-1.5 py-0.5 rounded">CANONICAL</span>
                        )}
                      </div>
                      <span className={`text-[9px] font-mono flex-shrink-0 ${oc.text}`}>{oc.label}</span>
                    </div>
                    <div className="text-[10px] text-white/40 flex items-center gap-1.5">
                      <CornerDownRight size={9} className="flex-shrink-0" />
                      <span className="italic">{step.action}</span>
                    </div>
                    <div className="text-[10px] text-white/50 mt-1">{step.found}</div>
                  </button>
                </div>
              );
            })}

            {/* Breakpoint block */}
            {activeTrace.breakpoint && (
              <div className="rounded-xl border border-[#FF3300]/30 bg-[#FF3300]/[0.04] p-4 mt-2">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={12} className="text-[#FF3300]" />
                  <span className="text-[10px] font-bold text-[#FF3300] uppercase tracking-wider">
                    Breakpoint — {BREAKPOINT_LABELS[activeTrace.breakpoint.type] || activeTrace.breakpoint.type.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-[11px] text-white/50 leading-relaxed">{activeTrace.breakpoint.reason}</p>
              </div>
            )}

            {/* Recommended fix */}
            {activeTrace.recommendedFix && (
              <div className="rounded-xl border border-[#8B5CF6]/20 bg-[#8B5CF6]/[0.04] p-4 mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <Zap size={12} className="text-[#8B5CF6]" />
                  <span className="text-[10px] font-bold text-[#8B5CF6] uppercase tracking-wider">Recommended Fix</span>
                </div>
                <p className="text-[11px] text-white/60 leading-relaxed">{activeTrace.recommendedFix}</p>
              </div>
            )}

             {/* Success state */}
            {activeTrace.status === 'passed' && !activeTrace.breakpoint && (
              <div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/[0.04] p-4 mt-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={12} className="text-[#22D3EE]" />
                  <span className="text-[10px] font-bold text-[#22D3EE] uppercase tracking-wider">Journey Complete</span>
                </div>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  {cost.inferencePoints === 0
                    ? 'Completed through a canonical path with no inference required and low context cost.'
                    : `Completed with ${cost.inferencePoints} inference point${cost.inferencePoints > 1 ? 's' : ''} — some canonical signals are missing but the goal was reachable.`}
                </p>
              </div>
            )}
          </div>

          {/* Navigation Controls (sequentially cycle through tasks) */}
          <div className="border-t border-white/[0.04] px-5 py-2.5 bg-black/20 flex items-center justify-between flex-shrink-0 select-none">
            <button
              onClick={() => {
                const currentIndex = journeys.traces.findIndex(t => t.journey === selectedJourney);
                if (currentIndex > 0) {
                  handleJourneySelect(journeys.traces[currentIndex - 1].journey);
                }
              }}
              disabled={journeys.traces.findIndex(t => t.journey === selectedJourney) === 0}
              className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-white/40 hover:text-white/80 disabled:opacity-20 disabled:hover:text-white/40 transition-colors"
            >
              ← Back Task
            </button>
            
            <span className="text-[9px] font-mono text-white/20 uppercase tracking-widest font-bold">
              Task {journeys.traces.findIndex(t => t.journey === selectedJourney) + 1} of {journeys.traces.length}
            </span>
            
            <button
              onClick={() => {
                const currentIndex = journeys.traces.findIndex(t => t.journey === selectedJourney);
                if (currentIndex < journeys.traces.length - 1) {
                  handleJourneySelect(journeys.traces[currentIndex + 1].journey);
                }
              }}
              disabled={journeys.traces.findIndex(t => t.journey === selectedJourney) === journeys.traces.length - 1}
              className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-white/40 hover:text-white/80 disabled:opacity-20 disabled:hover:text-white/40 transition-colors"
            >
              Next Task →
            </button>
          </div>

          {/* Cost summary footer */}
          <div className="border-t border-white/[0.04] px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <Cpu size={10} className="text-white/25" />
              <span className="text-[9px] font-mono text-white/25">{cost.pagesVisited} pages visited</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp size={10} className="text-white/25" />
              <span className="text-[9px] font-mono text-white/25">{cost.retrievalBreadth} surface types</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={10} className="text-white/25" />
              <span className="text-[9px] font-mono text-white/25">{cost.inferencePoints} inference points</span>
            </div>
            <div className={`ml-auto text-[9px] font-mono px-2 py-1 rounded border ${WASTE_CONFIG[cost.tokenWasteEstimate].bg} ${WASTE_CONFIG[cost.tokenWasteEstimate].color}`}>
              {WASTE_CONFIG[cost.tokenWasteEstimate].label}
            </div>
          </div>
        </div>

        {/* RIGHT — Step Inspector */}
        <div className="w-full lg:w-64 flex-shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l border-white/[0.06]">
          <AnimatePresence mode="wait">
            {selectedStep ? (
              <StepInspector key={selectedStep.nodeId} step={selectedStep} onClose={() => setSelectedStep(null)} />
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center p-6 text-center"
              >
                <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-3">
                  <Minus size={16} className="text-white/15" />
                </div>
                <p className="text-[10px] text-white/25 font-mono leading-relaxed">
                  Click any step in the timeline to inspect node details, evidence, and inference reasoning
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── High Risk Bar ── */}
      {journeys.highRiskJourneys.length > 0 && (
        <div className="border-t border-white/[0.06] px-6 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <AlertTriangle size={11} className="text-[#FF3300]" />
            <span className="text-[9px] font-bold text-[#FF3300] uppercase tracking-wider">High Hallucination Pressure</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {journeys.highRiskJourneys.map(j => (
              <span key={j} className="text-[9px] font-mono px-2 py-0.5 rounded bg-[#FF3300]/10 border border-[#FF3300]/20 text-[#FF3300]/80">{j}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
