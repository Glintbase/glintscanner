"use client";
/* eslint-disable @next/next/no-img-element */

import React from 'react';
import { Sparkles, RotateCw, Play } from 'lucide-react';
import type { HarnessType, JourneyTelemetryStats } from '@/lib/scanner/simulator/types';

interface JourneyTelemetryHeaderProps {
  target: string;
  intent: string;
  harness: HarnessType;
  status: 'success' | 'failed' | 'running' | 'idle';
  telemetry?: JourneyTelemetryStats;
  onRunNewJourney: () => void;
  onReconfigure?: () => void;
  onRerunFlight?: () => void;
  isRunning?: boolean;
}

export default function JourneyTelemetryHeader({
  target,
  intent,
  harness,
  status,
  telemetry,
  onRunNewJourney,
  onReconfigure,
  onRerunFlight,
  isRunning = false,
}: JourneyTelemetryHeaderProps) {
  const domain = target.replace(/^https?:\/\//i, '').replace(/\/$/, '') || 'target.com';

  const getHarnessMeta = (h: HarnessType) => {
    switch (h) {
      case 'claude-code':
        return { label: 'Claude Code', mascotImg: '/mascots/claude-code.png', tag: '3D Box-Bot' };
      case 'hermes':
        return { label: 'Hermes Agent', mascotImg: '/mascots/hermes.png', tag: 'Nous Avatar' };
      case 'openclaw':
        return { label: 'OpenClaw', mascotImg: '/mascots/openclaw.png', tag: '3D Sphere-Bot' };
      case 'opencode':
        return { label: 'OpenCode', mascotImg: '/mascots/opencode.png', tag: 'Terminal Drone' };
      default:
        return { label: 'Agent', mascotImg: '/mascots/claude-code.png', tag: 'Bot' };
    }
  };

  const harnessMeta = getHarnessMeta(harness);

  return (
    <div className="w-full bg-[#121214] border border-white/[0.08] rounded-xl p-6 md:p-8 space-y-6">
      {/* Top Meta Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Domain Pill */}
          <div className="bg-[#1C1C1F] border border-white/[0.08] rounded-md px-3 py-1.5 text-xs font-mono font-bold text-white/90">
            {domain}
          </div>

          {/* Agent Mascot Pill */}
          <div className="bg-[#1C1C1F] border border-white/[0.08] rounded-md px-3 py-1 flex items-center gap-2 text-xs font-mono text-white/80">
            <img
              src={harnessMeta.mascotImg}
              alt={harnessMeta.label}
              className="w-4 h-4 object-contain rounded-xs"
            />
            <span className="font-semibold text-white">{harnessMeta.label}</span>
            <span className="text-[10px] text-stone-400 bg-white/[0.06] px-1.5 py-0.2 rounded font-mono">
              {harnessMeta.tag}
            </span>
          </div>

          {/* Status Pill */}
          <div
            className={`rounded-md px-2.5 py-0.5 text-[11px] font-mono font-bold uppercase tracking-wider ${
              status === 'success'
                ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-800/60'
                : status === 'running'
                ? 'text-amber-400 bg-amber-950/40 border border-amber-800/60 animate-pulse'
                : status === 'failed'
                ? 'text-rose-400 bg-rose-950/40 border border-rose-800/60'
                : 'text-stone-400 bg-stone-900 border border-stone-800'
            }`}
          >
            {status === 'idle' ? 'STANDBY' : status}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {onReconfigure && (
            <button
              onClick={onReconfigure}
              disabled={isRunning}
              className="bg-white/[0.06] hover:bg-white/[0.12] text-stone-300 hover:text-white font-mono text-xs font-semibold px-3 py-1.5 rounded-md transition-all active:scale-[0.97] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border border-white/[0.08] flex items-center gap-1.5"
            >
              <span>Reconfigure</span>
            </button>
          )}

          {onRerunFlight && status !== 'idle' && (
            <button
              onClick={onRerunFlight}
              disabled={isRunning}
              className="bg-[#FF3300] hover:bg-[#FF3300]/90 text-white font-mono text-xs font-semibold px-3.5 py-1.5 rounded-md transition-all active:scale-[0.97] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs flex items-center gap-1.5"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              <span>Rerun Flight</span>
            </button>
          )}

          <button
            onClick={onRunNewJourney}
            disabled={isRunning}
            className="bg-white hover:bg-stone-200 text-black font-mono text-xs font-semibold px-4 py-1.5 rounded-md transition-all active:scale-[0.97] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs flex items-center gap-2"
          >
            {isRunning ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>Simulating...</span>
              </>
            ) : (
              <span>{status === 'idle' ? 'Launch Simulation' : 'Run new journey'}</span>
            )}
          </button>
        </div>
      </div>

      {/* Intent Headline */}
      <div className="space-y-1.5 pt-1">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">
          INTENT
        </div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-serif text-stone-100 font-normal leading-snug tracking-tight">
          {intent}
        </h1>
      </div>

      {/* 4-Metric Live Telemetry Row (Ora Video Editorial Columns) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-0 pt-4 border-t border-white/[0.06]">
        {/* Metric 1: Steps */}
        <div className="space-y-1 md:pr-6 md:border-r md:border-white/[0.08]">
          <div className="text-2xl sm:text-3xl font-mono font-black text-white tabular-nums">
            {telemetry?.stepsCount !== undefined ? telemetry.stepsCount : status === 'running' ? 0 : '--'}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 font-semibold">
            STEPS
          </div>
        </div>

        {/* Metric 2: Duration */}
        <div className="space-y-1 md:px-6 md:border-r md:border-white/[0.08]">
          <div className="text-2xl sm:text-3xl font-mono font-black text-white tabular-nums">
            {telemetry?.durationSeconds !== undefined
              ? `${telemetry.durationSeconds}s`
              : status === 'running'
              ? '0.0s'
              : '--'}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 font-semibold">
            DURATION
          </div>
        </div>

        {/* Metric 3: Cost */}
        <div className="space-y-1 md:px-6 md:border-r md:border-white/[0.08]">
          <div className="text-2xl sm:text-3xl font-mono font-black text-emerald-400 tabular-nums">
            {telemetry?.costUsd !== undefined
              ? `$${telemetry.costUsd.toFixed(4)}`
              : status === 'running'
              ? '$0.0000'
              : '--'}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 font-semibold">
            COST
          </div>
        </div>

        {/* Metric 4: Tokens */}
        <div className="space-y-1 md:pl-6">
          <div className="text-2xl sm:text-3xl font-mono font-black text-white tabular-nums">
            {telemetry?.tokensBurned !== undefined
              ? telemetry.tokensBurned.toLocaleString()
              : status === 'running'
              ? '0'
              : '--'}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 font-semibold">
            TOKENS
          </div>
        </div>
      </div>
    </div>
  );
}
