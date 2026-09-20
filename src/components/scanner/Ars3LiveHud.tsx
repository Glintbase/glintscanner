"use client";

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
  Clock,
  ShieldCheck,
  Cpu,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { ArchetypeProfile } from '@/lib/scanner/v2/archetype';
import type { LayerScoreSummary } from '@/lib/scanner/v2/probes';

export interface Ars3LiveHudProps {
  url: string;
  isScanning: boolean;
  logs: any[];
  error?: string | null;
  onRetry?: () => void;
  archetype?: ArchetypeProfile;
  activeDenominator?: number;
  layers?: {
    discovery?: LayerScoreSummary;
    access?: LayerScoreSummary;
    usability?: LayerScoreSummary;
    payments?: LayerScoreSummary;
  };
}

interface CriticalCheckBadge {
  id: string;
  name: string;
  status: 'pending' | 'pass' | 'warn' | 'fail';
  detail?: string;
}

export default function Ars3LiveHud({
  url,
  isScanning,
  logs,
  error,
  onRetry,
  archetype,
  activeDenominator = 100,
  layers,
}: Ars3LiveHudProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  // Live stopwatch during scan
  useEffect(() => {
    if (!isScanning) return;
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 45);
    return () => clearInterval(timer);
  }, [isScanning]);

  // Extract layer events and badges from logs if not yet in layers prop
  const activeLayers = useMemo(() => {
    const d = layers?.discovery || logs.find((l) => l.type === 'layer_discovery')?.layer;
    const a = layers?.access || logs.find((l) => l.type === 'layer_access')?.layer;
    const u = layers?.usability || logs.find((l) => l.type === 'layer_usability')?.layer;
    const p = layers?.payments || logs.find((l) => l.type === 'layer_payments')?.layer;
    return {
      discovery: d as LayerScoreSummary | undefined,
      access: a as LayerScoreSummary | undefined,
      usability: u as LayerScoreSummary | undefined,
      payments: p as LayerScoreSummary | undefined,
    };
  }, [layers, logs]);

  const activeArchetype = useMemo(() => {
    if (archetype) return archetype;
    return logs.find((l) => l.type === 'archetype')?.archetype as ArchetypeProfile | undefined;
  }, [archetype, logs]);

  const liveDenominator = useMemo(() => {
    const eventDenom = logs.find((l) => l.type === 'archetype')?.activeDenominator;
    return eventDenom || activeDenominator || 100;
  }, [logs, activeDenominator]);

  const scanError = useMemo(() => {
    if (error) return error;
    const errLog = logs.find((l) => l.type === 'error' || l.error);
    return errLog ? (errLog.message || errLog.error || 'Scan error occurred') : null;
  }, [error, logs]);

  // Real-time critical badges
  const criticalBadges = useMemo<CriticalCheckBadge[]>(() => {
    const list: CriticalCheckBadge[] = [
      { id: 'robots', name: 'Robots.txt & llms.txt', status: 'pending' },
      { id: 'openapi', name: 'OpenAPI Schema', status: 'pending' },
      { id: 'mcp', name: 'Streamable MCP Tools', status: 'pending' },
      { id: 'auth', name: 'Autonomous auth.md', status: 'pending' },
      { id: 'canary', name: 'Anti-SPA 404 Canary', status: 'pending' },
      { id: 'payments', name: 'x402 / MPP Gate', status: 'pending' },
    ];

    // 1. Inspect logs for check events
    for (const log of logs) {
      const msg = String(log.message || '').toLowerCase();
      const check = String(log.check || '').toLowerCase();

      if (msg.includes('llms.txt') || check.includes('llms') || check.includes('robots')) {
        const b = list.find((i) => i.id === 'robots');
        if (b) {
          b.status = log.status === 'pass' || log.found ? 'pass' : log.status === 'warn' ? 'warn' : 'fail';
          b.detail = log.message;
        }
      }
      if (msg.includes('openapi') || check.includes('openapi')) {
        const b = list.find((i) => i.id === 'openapi');
        if (b) {
          b.status = log.status === 'pass' || log.found ? 'pass' : 'fail';
        }
      }
      if (msg.includes('mcp') || check.includes('mcp')) {
        const b = list.find((i) => i.id === 'mcp');
        if (b) {
          b.status = log.status === 'pass' || log.found ? 'pass' : 'fail';
        }
      }
      if (msg.includes('auth') || check.includes('auth')) {
        const b = list.find((i) => i.id === 'auth');
        if (b) {
          b.status = log.status === 'pass' || log.found ? 'pass' : 'fail';
        }
      }
      if (msg.includes('canary') || check.includes('canary') || msg.includes('404')) {
        const b = list.find((i) => i.id === 'canary');
        if (b) {
          b.status = log.status === 'pass' ? 'pass' : 'warn';
        }
      }
      if (msg.includes('payment') || check.includes('payment') || msg.includes('402')) {
        const b = list.find((i) => i.id === 'payments');
        if (b) {
          b.status = log.status === 'pass' ? 'pass' : 'fail';
        }
      }
    }

    // 2. Cross-reference completed layer checks
    if (activeLayers.discovery?.checks) {
      for (const c of activeLayers.discovery.checks) {
        if (c.checkId.includes('robots') || c.checkId.includes('llms')) {
          const b = list.find((i) => i.id === 'robots');
          if (b) b.status = c.status === 'pass' ? 'pass' : c.status === 'warn' ? 'warn' : 'fail';
        }
      }
    }
    if (activeLayers.access?.checks) {
      for (const c of activeLayers.access.checks) {
        if (c.checkId.includes('anti-spa') || c.checkId.includes('404')) {
          const b = list.find((i) => i.id === 'canary');
          if (b) b.status = c.status === 'pass' ? 'pass' : 'warn';
        }
        if (c.checkId.includes('auth')) {
          const b = list.find((i) => i.id === 'auth');
          if (b) b.status = c.status === 'pass' ? 'pass' : 'fail';
        }
      }
    }
    if (activeLayers.usability?.checks) {
      for (const c of activeLayers.usability.checks) {
        if (c.checkId.includes('openapi') || c.checkId.includes('schema')) {
          const b = list.find((i) => i.id === 'openapi');
          if (b) b.status = c.status === 'pass' ? 'pass' : 'fail';
        }
        if (c.checkId.includes('mcp')) {
          const b = list.find((i) => i.id === 'mcp');
          if (b) b.status = c.status === 'pass' ? 'pass' : 'fail';
        }
        if (c.checkId.includes('auth')) {
          const b = list.find((i) => i.id === 'auth');
          if (b) b.status = c.status === 'pass' ? 'pass' : 'fail';
        }
      }
    }
    if (activeLayers.payments?.checks) {
      for (const c of activeLayers.payments.checks) {
        if (c.checkId.includes('x402') || c.checkId.includes('mpp') || c.checkId.includes('payment')) {
          const b = list.find((i) => i.id === 'payments');
          if (b) b.status = c.status === 'pass' ? 'pass' : c.status === 'warn' ? 'warn' : 'fail';
        }
      }
    }

    return list;
  }, [logs, activeLayers]);

  // Compute total points earned so far
  const totalEarned = useMemo(() => {
    let pts = 0;
    if (activeLayers.discovery) pts += activeLayers.discovery.totalEarned;
    if (activeLayers.access) pts += activeLayers.access.totalEarned;
    if (activeLayers.usability) pts += activeLayers.usability.totalEarned;
    if (activeLayers.payments) pts += activeLayers.payments.totalEarned;
    return pts;
  }, [activeLayers]);

  return (
    <div className="w-full max-w-4xl mx-auto my-8 font-mono">
      {/* Outer Concentric Container (rounded-2xl) */}
      <div className="relative rounded-2xl bg-[#0A0A0B] border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.6)] p-5 sm:p-7 overflow-hidden">
        {/* Subtle radial ambient highlight */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[radial-gradient(ellipse_at_top_right,rgba(255,51,0,0.06),transparent_70%)] pointer-events-none" />

        {/* Top Header Bar: Target URL & Live Clock */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-[#FF3300]/10 border border-[#FF3300]/30 text-[#FF3300]">
              <Activity size={16} className="animate-pulse" />
            </div>
            <div>
              <div className="text-[10px] text-white/40 uppercase tracking-[0.25em] font-bold">
                ARS 3.0 Live Probe HUD
              </div>
              <div className="text-sm sm:text-base font-bold text-white tracking-tight truncate max-w-md">
                {url || 'Target Ecosystem'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {activeArchetype && (
              <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/70">
                {activeArchetype.label}
              </span>
            )}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FF3300]/10 border border-[#FF3300]/25 text-[#FF3300] text-xs font-bold tabular-nums">
              <Clock size={12} />
              <span>{(elapsedMs / 1000).toFixed(2)}s</span>
              <span className="text-white/30 text-[10px]">/ 5.0s</span>
            </div>
          </div>
        </div>

        {/* Scan Error Banner (if scan failed or target was invalid) */}
        {scanError && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <XCircle size={20} className="text-rose-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold font-mono uppercase tracking-wider text-rose-300">
                  Scan Interrupted
                </div>
                <div className="text-xs font-mono text-rose-300/80 mt-0.5 break-words">
                  {scanError}
                </div>
              </div>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="px-3.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 active:scale-[0.96]"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Dynamic Denominator & Progress Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {/* Active Points */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between">
            <span className="text-[9px] text-white/40 uppercase tracking-widest font-bold">
              Total Points Earned
            </span>
            <div className="flex items-baseline gap-1.5 mt-2">
              <span className="text-2xl sm:text-3xl font-black text-white tabular-nums">
                {totalEarned}
              </span>
              <span className="text-xs text-white/40">/ {liveDenominator} pts</span>
            </div>
            <div className="w-full h-1 bg-white/5 rounded-full mt-3 overflow-hidden">
              <div
                className="h-full bg-[#FF3300] transition-all duration-300"
                style={{ width: `${Math.min(100, (totalEarned / liveDenominator) * 100)}%` }}
              />
            </div>
          </div>

          {/* Active Archetype Formula */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between">
            <span className="text-[9px] text-white/40 uppercase tracking-widest font-bold">
              Dynamic Denominator
            </span>
            <div className="text-xs font-mono text-white/80 mt-2 space-y-1">
              <div className="text-white font-bold">
                D<sub>active</sub> = D<sub>base</sub> + S<sub>bonus</sub>
              </div>
              <div className="text-[10px] text-[#FF3300] font-bold">
                {liveDenominator} pts active capacity
              </div>
            </div>
            <span className="text-[9px] text-white/30 mt-2">
              Scaled by detected archetype profile
            </span>
          </div>

          {/* Sub-5s Execution Guarantee */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between">
            <span className="text-[9px] text-white/40 uppercase tracking-widest font-bold">
              Parallel Probe Engine
            </span>
            <div className="flex items-center gap-2 mt-2">
              <span className={`inline-flex w-2 h-2 rounded-full ${isScanning ? 'bg-[#FF3300] animate-ping' : 'bg-emerald-400'}`} />
              <span className="text-xs font-bold text-emerald-400">119 Discrete Checks</span>
            </div>
            <span className="text-[9px] text-white/30 mt-2">
              Zero Puppeteer crawler latency
            </span>
          </div>
        </div>

        {/* 4-Layer Pulse Meters */}
        <div className="space-y-3 mb-6">
          <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-bold">
            4-Layer Dynamic Architecture Progress
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Layer 1: Discovery */}
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-white/90">Layer 1: Discovery</span>
                <span className="text-[#FF3300] font-bold tabular-nums">
                  {activeLayers.discovery
                    ? `${activeLayers.discovery.totalEarned}/${activeLayers.discovery.baseMax} pts`
                    : isScanning
                    ? 'evaluating...'
                    : '0 pts'}
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: activeLayers.discovery
                      ? `${Math.min(100, (activeLayers.discovery.totalEarned / (activeLayers.discovery.baseMax || 1)) * 100)}%`
                      : isScanning
                      ? '40%'
                      : '0%',
                  }}
                  transition={{ duration: 0.3 }}
                  className={`h-full ${activeLayers.discovery ? 'bg-[#FF3300]' : 'bg-[#FF3300]/30 animate-pulse'}`}
                />
              </div>
              <div className="text-[9px] text-white/40 mt-2 truncate">
                robots.txt, llms.txt, sitemaps, openapi schema
              </div>
            </div>

            {/* Layer 2: Access */}
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-white/90">Layer 2: Access & Auth</span>
                <span className="text-[#FF3300] font-bold tabular-nums">
                  {activeLayers.access
                    ? `${activeLayers.access.totalEarned}/${activeLayers.access.baseMax} pts`
                    : isScanning
                    ? 'evaluating...'
                    : '0 pts'}
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: activeLayers.access
                      ? `${Math.min(100, (activeLayers.access.totalEarned / (activeLayers.access.baseMax || 1)) * 100)}%`
                      : isScanning
                      ? '30%'
                      : '0%',
                  }}
                  transition={{ duration: 0.3 }}
                  className={`h-full ${activeLayers.access ? 'bg-[#FF3300]' : 'bg-[#FF3300]/30 animate-pulse'}`}
                />
              </div>
              <div className="text-[9px] text-white/40 mt-2 truncate">
                auth.md, credentials acquisition, rate limits
              </div>
            </div>

            {/* Layer 3: Usability */}
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-white/90">Layer 3: Usability & Tooling</span>
                <span className="text-[#FF3300] font-bold tabular-nums">
                  {activeLayers.usability
                    ? `${activeLayers.usability.totalEarned}/${activeLayers.usability.baseMax} pts`
                    : isScanning
                    ? 'evaluating...'
                    : '0 pts'}
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: activeLayers.usability
                      ? `${Math.min(100, (activeLayers.usability.totalEarned / (activeLayers.usability.baseMax || 1)) * 100)}%`
                      : isScanning
                      ? '25%'
                      : '0%',
                  }}
                  transition={{ duration: 0.3 }}
                  className={`h-full ${activeLayers.usability ? 'bg-[#FF3300]' : 'bg-[#FF3300]/30 animate-pulse'}`}
                />
              </div>
              <div className="text-[9px] text-white/40 mt-2 truncate">
                Streamable MCP tools, Anti-SPA 404 canary, schemas
              </div>
            </div>

            {/* Layer 4: Payments */}
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-white/90">Layer 4: Payments & Micropayments</span>
                <span className="text-[#FF3300] font-bold tabular-nums">
                  {activeLayers.payments
                    ? `${activeLayers.payments.totalEarned}/${activeLayers.payments.baseMax} pts`
                    : isScanning
                    ? 'evaluating...'
                    : '0 pts'}
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: activeLayers.payments
                      ? `${Math.min(100, (activeLayers.payments.totalEarned / (activeLayers.payments.baseMax || 1)) * 100)}%`
                      : isScanning
                      ? '20%'
                      : '0%',
                  }}
                  transition={{ duration: 0.3 }}
                  className={`h-full ${activeLayers.payments ? 'bg-[#FF3300]' : 'bg-[#FF3300]/30 animate-pulse'}`}
                />
              </div>
              <div className="text-[9px] text-white/40 mt-2 truncate">
                x402 protocol, Lightning LNURL, micropayment endpoints
              </div>
            </div>
          </div>
        </div>

        {/* Critical Checks Real-time Badges */}
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-bold mb-3">
            Real-Time Machine Interoperability Badges
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {criticalBadges.map((b) => (
              <div
                key={b.id}
                className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] flex flex-col items-center text-center gap-1.5"
              >
                <div className="text-xs">
                  {b.status === 'pass' && <CheckCircle2 size={14} className="text-emerald-400" />}
                  {b.status === 'warn' && <AlertTriangle size={14} className="text-amber-400" />}
                  {b.status === 'fail' && <XCircle size={14} className="text-rose-400" />}
                  {b.status === 'pending' && <span className="inline-block w-2.5 h-2.5 rounded-full border border-white/20 border-t-[#FF3300] animate-spin" />}
                </div>
                <span className="text-[10px] text-white/80 font-bold leading-tight">
                  {b.name}
                </span>
                <span className={`text-[8px] uppercase font-bold ${
                  b.status === 'pass'
                    ? 'text-emerald-400'
                    : b.status === 'warn'
                    ? 'text-amber-400'
                    : b.status === 'fail'
                    ? 'text-rose-400'
                    : 'text-white/30'
                }`}>
                  {b.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
