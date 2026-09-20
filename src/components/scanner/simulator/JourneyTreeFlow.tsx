"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  BookOpen,
  Globe,
  Compass,
  Key,
  Zap,
  FileText,
  AlertOctagon,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  X,
  ExternalLink,
  Clock,
  Layers,
  Code2,
} from 'lucide-react';
import type { JourneyPillNode, JourneyIconType } from '@/lib/scanner/simulator/types';

interface JourneyTreeFlowProps {
  nodes?: JourneyPillNode[];
  reasoningStepsCount?: number;
  onNodeSelect?: (node: JourneyPillNode) => void;
}

export default function JourneyTreeFlow({
  nodes = [],
  reasoningStepsCount = 1,
  onNodeSelect,
}: JourneyTreeFlowProps) {
  const [selectedNode, setSelectedNode] = useState<JourneyPillNode | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [replaySpeed, setReplaySpeed] = useState<number>(1); // 1x, 2x, 4x

  // Group nodes by row
  const rows = useMemo(() => {
    const rowMap = new Map<number, JourneyPillNode[]>();
    for (const node of nodes) {
      const r = node.row ?? 0;
      if (!rowMap.has(r)) rowMap.set(r, []);
      rowMap.get(r)!.push(node);
    }
    return Array.from(rowMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([_, list]) => list.sort((a, b) => (a.col ?? 0) - (b.col ?? 0)));
  }, [nodes]);

  // Replay animation loop
  useEffect(() => {
    if (!isReplaying || nodes.length === 0) return;

    let current = activeStepIndex === null || activeStepIndex >= nodes.length - 1 ? 0 : activeStepIndex;
    setActiveStepIndex(current);

    const intervalMs = Math.max(200, Math.round(700 / replaySpeed));
    const timer = setInterval(() => {
      current++;
      if (current >= nodes.length) {
        setIsReplaying(false);
        setActiveStepIndex(null);
        clearInterval(timer);
      } else {
        setActiveStepIndex(current);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isReplaying, replaySpeed, nodes.length]);

  const handleStartReplay = () => {
    setActiveStepIndex(0);
    setIsReplaying(true);
  };

  const handleTogglePlayPause = () => {
    setIsReplaying((prev) => !prev);
  };

  const renderIcon = (iconType: JourneyIconType) => {
    const className = "w-3.5 h-3.5 shrink-0";
    switch (iconType) {
      case 'home':
        return <Home className={className} />;
      case 'docs':
        return <BookOpen className={className} />;
      case 'api':
        return <Globe className={className} />;
      case 'llms':
        return <Compass className={className} />;
      case 'auth':
        return <Key className={className} />;
      case 'mcp':
        return <Zap className={className} />;
      case 'openapi':
        return <FileText className={className} />;
      case 'canary':
      case 'error':
        return <AlertOctagon className={className} />;
      default:
        return <Sparkles className={className} />;
    }
  };

  const getNodeColor = (status: 'pass' | 'warn' | 'fail', isActive: boolean) => {
    if (isActive) {
      return 'border-[#FF3300] bg-[#FF3300]/20 text-white ring-2 ring-[#FF3300]/60 shadow-[0_0_12px_rgba(255,51,0,0.4)]';
    }
    switch (status) {
      case 'pass':
        return 'border-emerald-500/40 bg-emerald-950/20 text-emerald-400 hover:border-emerald-400 hover:bg-emerald-950/40';
      case 'warn':
        return 'border-amber-500/40 bg-amber-950/20 text-amber-400 hover:border-amber-400 hover:bg-amber-950/40';
      case 'fail':
        return 'border-rose-500/40 bg-rose-950/20 text-rose-400 hover:border-rose-400 hover:bg-rose-950/40';
    }
  };

  return (
    <div className="w-full bg-[#121214] border border-white/[0.08] rounded-xl p-6 md:p-8 space-y-6 relative overflow-hidden">
      {/* Container Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="text-xs font-mono text-stone-400 font-medium">
          <strong className="text-white">{nodes.length} steps</strong> · {reasoningStepsCount} reasoning step
        </div>

        {/* Replay Action Bar */}
        <div className="flex items-center gap-3">
          {isReplaying && (
            <div className="flex items-center gap-1 bg-[#1C1C1F] border border-white/[0.08] rounded px-2 py-0.5 text-[10px] font-mono text-stone-300">
              <span>Speed:</span>
              <button
                onClick={() => setReplaySpeed(replaySpeed === 1 ? 2 : replaySpeed === 2 ? 4 : 1)}
                className="font-bold text-[#FF3300] hover:underline cursor-pointer ml-1"
              >
                {replaySpeed}x
              </button>
            </div>
          )}

          <button
            onClick={isReplaying ? handleTogglePlayPause : handleStartReplay}
            className="flex items-center gap-1.5 text-xs font-mono font-semibold text-stone-300 hover:text-white transition cursor-pointer select-none bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-3 py-1 rounded"
          >
            {isReplaying ? (
              <>
                <Pause className="w-3 h-3 text-[#FF3300]" />
                <span>pause</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 text-[#FF3300] fill-current" />
                <span>replay</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Abstracted Pill Tree Canvas */}
      <div className="w-full overflow-x-auto py-4 min-h-[300px]">
        <div className="space-y-6 min-w-[650px] relative">
          {rows.map((rowNodes, rowIdx) => (
            <div key={rowIdx} className="relative flex items-center gap-4">
              {rowNodes.map((node, nodeIdx) => {
                const globalIndex = nodes.findIndex((n) => n.id === node.id);
                const isActive = activeStepIndex === globalIndex;
                const isLastInRow = nodeIdx === rowNodes.length - 1;

                return (
                  <div key={node.id} className="relative flex items-center">
                    {/* The Pill Badge */}
                    <button
                      onClick={() => {
                        setSelectedNode(node);
                        onNodeSelect?.(node);
                      }}
                      className={`inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-mono font-semibold border transition-all duration-200 cursor-pointer ${getNodeColor(
                        node.status,
                        isActive
                      )}`}
                    >
                      {renderIcon(node.iconType)}
                      <span>{node.label}</span>
                    </button>

                    {/* Horizontal Connector Line to next pill in row */}
                    {!isLastInRow && (
                      <div className="w-8 h-px bg-stone-700/80 mx-1 shrink-0" />
                    )}

                    {/* Vertical Branch Line to node below if parent */}
                    {node.parentId && (
                      <div className="hidden" />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Subtle Hint */}
      <div className="text-[10px] font-mono text-stone-400 pt-2 border-t border-white/[0.06] flex items-center justify-between">
        <span>Click any node to inspect HTTP request, headers, and agent thoughts</span>
        <span>Replay active step: {activeStepIndex !== null ? `#${activeStepIndex + 1}` : 'Idle'}</span>
      </div>

      {/* Node Detail Slide-Over / Modal */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="absolute inset-x-4 bottom-4 z-20 bg-[#18181B] border border-white/[0.12] rounded-xl p-5 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded bg-white/[0.06] text-white">
                  {renderIcon(selectedNode.iconType)}
                </span>
                <span className="font-mono font-bold text-white text-sm">
                  {selectedNode.label}
                </span>
                {selectedNode.httpStatus && (
                  <span
                    className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      selectedNode.httpStatus === 200
                        ? 'text-emerald-400 bg-emerald-950/60'
                        : selectedNode.httpStatus === 301
                        ? 'text-amber-400 bg-amber-950/60'
                        : 'text-rose-400 bg-rose-950/60'
                    }`}
                  >
                    HTTP {selectedNode.httpStatus}
                  </span>
                )}
              </div>

              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 rounded text-stone-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
              <div className="space-y-1">
                <span className="text-stone-400 text-[10px] uppercase">TARGET URL</span>
                <div className="text-stone-200 truncate">{selectedNode.url || '—'}</div>
              </div>
              <div className="space-y-1">
                <span className="text-stone-400 text-[10px] uppercase">TOKENS ACCRUED</span>
                <div className="text-stone-200">{selectedNode.tokens.toLocaleString()} tokens</div>
              </div>
              <div className="space-y-1">
                <span className="text-stone-400 text-[10px] uppercase">LATENCY</span>
                <div className="text-stone-200">{selectedNode.latencyMs}ms</div>
              </div>
            </div>

            {selectedNode.thought && (
              <div className="space-y-1 pt-1">
                <span className="text-stone-400 text-[10px] font-mono uppercase">
                  AGENT REASONING
                </span>
                <p className="text-stone-300 font-mono text-xs leading-relaxed bg-black/40 p-2.5 rounded border border-white/[0.06]">
                  {selectedNode.thought}
                </p>
              </div>
            )}

            {selectedNode.rawSnippet && (
              <div className="space-y-1 pt-1">
                <span className="text-stone-400 text-[10px] font-mono uppercase">
                  RAW RESPONSE SNIPPET
                </span>
                <pre className="text-[11px] font-mono text-stone-300 bg-black/60 p-2.5 rounded border border-white/[0.06] overflow-x-auto max-h-24">
                  {selectedNode.rawSnippet}
                </pre>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
