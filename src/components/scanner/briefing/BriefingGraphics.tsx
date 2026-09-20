import React from 'react';

// ─── 1. 5-Stage Agent Interaction Trajectory Graphic (SVG) ───────────────────
export interface TrajectoryStage {
  step: string;
  name: string;
  protocol: string;
  status: 'pass' | 'warn' | 'fail';
  diagnostic: string;
}

export function AgentTrajectoryGraphic({ stages }: { stages: TrajectoryStage[] }) {
  const getStatusColor = (status: 'pass' | 'warn' | 'fail') => {
    switch (status) {
      case 'pass':
        return { bg: '#EDF3EC', border: '#10B981', text: '#346538', badge: 'VERIFIED' };
      case 'warn':
        return { bg: '#FBF3DB', border: '#F59E0B', text: '#956400', badge: 'FRICTION' };
      case 'fail':
        return { bg: '#FDEBEC', border: '#EF4444', text: '#9F2F2D', badge: 'BLOCKED' };
    }
  };

  return (
    <div className="w-full border border-stone-200 rounded-lg p-4 bg-white/80">
      <div className="flex items-center justify-between border-b border-stone-100 pb-2 mb-3">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400">
          AUTONOMOUS AGENT EXECUTION PIPELINE · LIVE TRACE
        </span>
        <span className="text-[10px] font-mono text-stone-400">
          5-STAGE DETERMINISTIC PROBE
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 relative">
        {stages.map((stage, idx) => {
          const colors = getStatusColor(stage.status);
          const isLast = idx === stages.length - 1;

          return (
            <div
              key={idx}
              className="relative flex flex-col justify-between p-3 rounded border text-left min-h-[120px] transition-all"
              style={{
                backgroundColor: colors.bg,
                borderColor: colors.border,
              }}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono font-black text-stone-500">
                    {stage.step}
                  </span>
                  <span
                    className="text-[8px] font-mono font-extrabold px-1.5 py-0.5 rounded tracking-wider uppercase"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.85)',
                      color: colors.text,
                      border: `1px solid ${colors.border}`,
                    }}
                  >
                    {colors.badge}
                  </span>
                </div>

                <div className="text-xs font-serif font-bold text-stone-900 leading-tight mb-1">
                  {stage.name}
                </div>
                <div className="text-[10px] font-mono text-stone-600 truncate">
                  {stage.protocol}
                </div>
              </div>

              <div className="pt-2 mt-2 border-t border-black/5 text-[9px] font-sans text-stone-700 leading-tight">
                {stage.diagnostic}
              </div>

              {/* Connecting arrow for desktop view */}
              {!isLast && (
                <div className="hidden md:block absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 text-stone-400 pointer-events-none text-xs font-mono">
                  →
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 2. 4-Layer Spectrum Comparison Graphic (SVG) ─────────────────────────────
export interface LayerMetric {
  name: string;
  earned: number;
  max: number;
  pct: number;
  benchmarkPct: number;
  status: string;
  gaps: number;
}

export function LayerSpectrumGraphic({ layers }: { layers: LayerMetric[] }) {
  return (
    <div className="w-full border border-stone-200 rounded-lg p-5 bg-white space-y-4">
      <div className="flex items-center justify-between border-b border-stone-100 pb-2">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400">
          ARS 3.0 ARCHITECTURAL LAYER DECOMPOSITION
        </span>
        <div className="flex items-center gap-4 text-[10px] font-mono text-stone-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#FF3300]" />
            <span>Target Domain</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-stone-300" />
            <span>Ecosystem Avg</span>
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {layers.map((layer, idx) => {
          const isOptimal = layer.pct >= 70;
          const isWarning = layer.pct >= 35 && layer.pct < 70;
          const barColor = isOptimal ? '#10B981' : isWarning ? '#F59E0B' : '#FF3300';

          return (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-serif font-bold text-stone-900">{layer.name}</span>
                  <span className="text-[10px] font-mono text-stone-500">
                    ({layer.earned}/{layer.max} pts)
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="font-bold text-stone-900">{layer.pct}%</span>
                  <span className="text-stone-400 text-[10px]">vs {layer.benchmarkPct}% avg</span>
                  {layer.gaps > 0 ? (
                    <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                      {layer.gaps} {layer.gaps === 1 ? 'gap' : 'gaps'}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      optimal
                    </span>
                  )}
                </div>
              </div>

              {/* Dual comparative progress bar */}
              <div className="relative h-3 w-full bg-stone-100 rounded-sm overflow-hidden flex items-center">
                {/* Benchmark tick marker */}
                <div
                  className="absolute top-0 bottom-0 z-10 border-r-2 border-dashed border-stone-400/80"
                  style={{ left: `${Math.min(100, Math.max(0, layer.benchmarkPct))}%` }}
                  title={`Ecosystem Average: ${layer.benchmarkPct}%`}
                />
                {/* Actual Domain fill */}
                <div
                  className="h-full transition-all rounded-xs"
                  style={{
                    width: `${Math.min(100, Math.max(0, layer.pct))}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 3. Market Distribution Histogram (SVG) ──────────────────────────────────
export function MarketDistributionGraphic({
  score,
  percentile,
}: {
  score: number;
  percentile: number;
}) {
  // 10 score deciles: 0-10, 11-20, ... 91-100
  // Real tech ecosystem distribution weights (right-skewed toward lower/mid readiness)
  const deciles = [
    { range: '0-10', weight: 8 },
    { range: '11-20', weight: 14 },
    { range: '21-30', weight: 22 },
    { range: '31-40', weight: 28 }, // Median cluster
    { range: '41-50', weight: 18 },
    { range: '51-60', weight: 12 },
    { range: '61-70', weight: 8 },
    { range: '71-80', weight: 5 },
    { range: '81-90', weight: 3 },
    { range: '91-100', weight: 1 },
  ];

  const targetIndex = Math.min(9, Math.max(0, Math.floor(score / 10)));
  const maxWeight = 30;

  return (
    <div className="border border-stone-200 rounded-lg p-5 bg-white space-y-3">
      <div className="flex items-center justify-between border-b border-stone-100 pb-2">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400">
          MARKET READINESS DISTRIBUTION (ECOSYSTEM COHORT)
        </span>
        <span className="text-[10px] font-mono text-stone-500">
          YOUR POSITION: <strong className="text-[#FF3300]">{percentile}th PERCENTILE</strong>
        </span>
      </div>

      {/* SVG Bar Chart */}
      <div className="pt-2">
        <svg viewBox="0 0 500 120" className="w-full h-24 overflow-visible">
          {deciles.map((d, i) => {
            const barWidth = 42;
            const gap = 8;
            const x = i * (barWidth + gap) + 4;
            const barHeight = (d.weight / maxWeight) * 80;
            const y = 90 - barHeight;
            const isTarget = i === targetIndex;

            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={2}
                  fill={isTarget ? '#FF3300' : '#E7E5E4'}
                />
                {isTarget && (
                  <g>
                    <text
                      x={x + barWidth / 2}
                      y={y - 8}
                      textAnchor="middle"
                      fill="#FF3300"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      YOU ({score})
                    </text>
                    <polygon
                      points={`${x + barWidth / 2 - 3},${y - 4} ${x + barWidth / 2 + 3},${y - 4} ${x + barWidth / 2},${y - 1}`}
                      fill="#FF3300"
                    />
                  </g>
                )}
                <text
                  x={x + barWidth / 2}
                  y={105}
                  textAnchor="middle"
                  fill={isTarget ? '#1C1917' : '#78716C'}
                  fontSize="8"
                  fontFamily="monospace"
                  fontWeight={isTarget ? 'bold' : 'normal'}
                >
                  {d.range}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="text-[10px] font-sans text-stone-500 pt-1 flex items-center justify-between border-t border-stone-100">
        <span>Low Agent Legibility (0-30)</span>
        <span>Ecosystem Median (38)</span>
        <span>Autonomous Leaderboard (80+)</span>
      </div>
    </div>
  );
}

// ─── 4. Protocol Declaration Matrix (In-Depth Technical Table) ────────────────
export interface ProtocolDeclaration {
  name: string;
  pathOrStandard: string;
  status: 'pass' | 'warn' | 'fail' | 'na';
  latencyOrHttp?: string;
  agentImpact: string;
}

export function ProtocolDeclarationMatrix({
  protocols,
}: {
  protocols: ProtocolDeclaration[];
}) {
  return (
    <div className="border border-stone-200 rounded-lg overflow-hidden bg-white">
      <div className="bg-stone-50/75 px-4 py-2.5 border-b border-stone-200 flex items-center justify-between">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500">
          CORE MACHINE-READABLE PROTOCOL DECLARATION MATRIX
        </span>
        <span className="text-[10px] font-mono text-stone-400">
          8 OPEN PROTOCOL VECTORS
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-sans">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50/30 text-[9px] font-mono uppercase tracking-wider text-stone-400">
              <th className="py-2 px-3 font-semibold">Protocol / Standard</th>
              <th className="py-2 px-3 font-semibold">Expected Vector</th>
              <th className="py-2 px-3 font-semibold">Scan Result</th>
              <th className="py-2 px-3 font-semibold">HTTP / Latency</th>
              <th className="py-2 px-3 font-semibold">Agent Operational Consequence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 text-stone-700 font-sans">
            {protocols.map((p, idx) => {
              const statusPill =
                p.status === 'pass' ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    <span className="text-emerald-500">●</span> VERIFIED
                  </span>
                ) : p.status === 'warn' ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    <span className="text-amber-500">●</span> DEGRADED
                  </span>
                ) : p.status === 'na' ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-stone-500 bg-stone-50 px-1.5 py-0.5 rounded border border-stone-200">
                    <span>—</span> EXEMPT
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                    <span className="text-rose-500">✕</span> ABSENT
                  </span>
                );

              return (
                <tr key={idx} className="hover:bg-stone-50/50 transition-colors">
                  <td className="py-2.5 px-3 font-serif font-bold text-stone-900 whitespace-nowrap">
                    {p.name}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[10px] text-stone-600">
                    <code>{p.pathOrStandard}</code>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">{statusPill}</td>
                  <td className="py-2.5 px-3 font-mono text-[10px] text-stone-500 whitespace-nowrap">
                    {p.latencyOrHttp || '—'}
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-stone-600 leading-snug">
                    {p.agentImpact}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 5. Token Tax & Latency Comparison Graphic (Before vs After) ──────────────
export interface FrictionMetrics {
  currentTokens: number;
  remediatedTokens: number;
  currentLatencyMs: number;
  remediatedLatencyMs: number;
  currentFailureRate: number;
  remediatedFailureRate: number;
  estCostPer1k: number;
  remediatedCostPer1k: number;
}

export function TokenTaxGraphic({ metrics }: { metrics: FrictionMetrics }) {
  const tokenReduction = Math.round(
    ((metrics.currentTokens - metrics.remediatedTokens) / (metrics.currentTokens || 1)) * 100
  );
  const latencyReduction = Math.round(
    ((metrics.currentLatencyMs - metrics.remediatedLatencyMs) /
      (metrics.currentLatencyMs || 1)) *
      100
  );

  return (
    <div className="border border-stone-200 rounded-lg p-5 bg-white space-y-3">
      <div className="flex items-center justify-between border-b border-stone-100 pb-2">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400">
          MACHINE FRICTION & TELEMETRY IMPACT · VIRTUAL SANDBOX ESTIMATE
        </span>
        <span className="text-[10px] font-mono text-emerald-600 font-bold">
          -{tokenReduction}% CONTEXT TAX REDUCTION
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Token Burn */}
        <div className="border border-stone-200/80 rounded p-3 bg-stone-50/40">
          <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mb-1">
            BPE TOKEN TAX / SESSION
          </div>
          <div className="text-xl font-mono font-black text-rose-600">
            {metrics.currentTokens.toLocaleString()}
          </div>
          <div className="text-[10px] font-mono text-emerald-600 pt-1 flex items-center gap-1">
            <span>↓ {metrics.remediatedTokens.toLocaleString()} tokens</span>
            <span className="font-bold">(-{tokenReduction}%)</span>
          </div>
        </div>

        {/* Discovery Latency */}
        <div className="border border-stone-200/80 rounded p-3 bg-stone-50/40">
          <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mb-1">
            TIME TO FIRST TOOL (TTFTC)
          </div>
          <div className="text-xl font-mono font-black text-stone-800">
            {(metrics.currentLatencyMs / 1000).toFixed(1)}s
          </div>
          <div className="text-[10px] font-mono text-emerald-600 pt-1 flex items-center gap-1">
            <span>↓ {(metrics.remediatedLatencyMs / 1000).toFixed(1)}s</span>
            <span className="font-bold">(-{latencyReduction}%)</span>
          </div>
        </div>

        {/* Agent Drop-Off */}
        <div className="border border-stone-200/80 rounded p-3 bg-stone-50/40">
          <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mb-1">
            MISSION FAILURE RATE
          </div>
          <div className="text-xl font-mono font-black text-rose-600">
            {metrics.currentFailureRate}%
          </div>
          <div className="text-[10px] font-mono text-emerald-600 pt-1 flex items-center gap-1">
            <span>↓ &lt; {metrics.remediatedFailureRate}% failure</span>
          </div>
        </div>

        {/* Cost per 1k */}
        <div className="border border-stone-200/80 rounded p-3 bg-stone-50/40">
          <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mb-1">
            EST. INGESTION COST / 1K CALLS
          </div>
          <div className="text-xl font-mono font-black text-stone-800">
            ${metrics.estCostPer1k.toFixed(2)}
          </div>
          <div className="text-[10px] font-mono text-emerald-600 pt-1 flex items-center gap-1">
            <span>↓ ${metrics.remediatedCostPer1k.toFixed(2)} USD</span>
          </div>
        </div>
      </div>
    </div>
  );
}
