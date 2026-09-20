"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe,
  FileText,
  FileCode,
  Layers,
  KeyRound,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Zap,
} from 'lucide-react';
import type { ContextGraph, DiscoveredSurface } from '@/lib/scanner/v2/types';

interface MachineTopologyMapProps {
  graph?: ContextGraph | null;
  surfaces?: DiscoveredSurface[];
  targetUrl: string;
}

interface TopologyNode {
  id: string;
  label: string;
  category: 'root' | 'discovery' | 'spec' | 'tool' | 'access' | 'payments';
  icon: any;
  status: 'active' | 'partial' | 'missing' | 'skipped';
  url?: string;
  description: string;
  x: number; // percentage coordinates for responsive layout
  y: number;
}

export default function MachineTopologyMap({
  graph,
  surfaces = [],
  targetUrl,
}: MachineTopologyMapProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Derive host
  let host = targetUrl;
  try {
    host = new URL(targetUrl).hostname.replace(/^www\./, '');
  } catch {
    // fallback
  }

  const hasSurface = (type: string) => {
    const s = surfaces.find((item) => item.type === type);
    return s && s.found;
  };

  const getSurfaceUrl = (type: string) => {
    return surfaces.find((item) => item.type === type)?.url;
  };

  // Define the canonical machine topology nodes
  const nodes: TopologyNode[] = [
    {
      id: 'root',
      label: host,
      category: 'root',
      icon: Globe,
      status: 'active',
      url: targetUrl,
      description: 'Host ecosystem entrypoint for autonomous agents.',
      x: 10,
      y: 50,
    },
    {
      id: 'robots',
      label: 'robots.txt',
      category: 'discovery',
      icon: FileText,
      status: hasSurface('sitemap') ? 'active' : 'partial',
      url: `${targetUrl.replace(/\/$/, '')}/robots.txt`,
      description: 'Bot permission rules and sitemap indexes for web agents.',
      x: 28,
      y: 25,
    },
    {
      id: 'llms_txt',
      label: 'llms.txt',
      category: 'discovery',
      icon: FileText,
      status: hasSurface('llms_txt') ? 'active' : 'missing',
      url: getSurfaceUrl('llms_txt') || `${targetUrl.replace(/\/$/, '')}/llms.txt`,
      description: 'Standardized Markdown summary of developer docs for LLM ingestion.',
      x: 28,
      y: 75,
    },
    {
      id: 'openapi',
      label: 'OpenAPI Spec',
      category: 'spec',
      icon: FileCode,
      status: hasSurface('openapi') ? 'active' : 'missing',
      url: getSurfaceUrl('openapi'),
      description: 'Structured REST / JSON schemas for deterministic tool execution.',
      x: 50,
      y: 25,
    },
    {
      id: 'mcp',
      label: 'MCP Server',
      category: 'tool',
      icon: Layers,
      status: hasSurface('mcp') ? 'active' : 'missing',
      url: getSurfaceUrl('mcp'),
      description: 'Streamable HTTP Model Context Protocol tool endpoints.',
      x: 50,
      y: 75,
    },
    {
      id: 'auth',
      label: 'auth.md',
      category: 'access',
      icon: KeyRound,
      status: hasSurface('auth') ? 'active' : 'missing',
      url: getSurfaceUrl('auth'),
      description: 'Programmatic machine authentication & token acquisition instructions.',
      x: 75,
      y: 25,
    },
    {
      id: 'payments',
      label: 'x402 / MPP Gate',
      category: 'payments',
      icon: CreditCard,
      status: hasSurface('payments') ? 'active' : 'missing',
      url: getSurfaceUrl('payments'),
      description: 'HTTP 402 / Lightning LNURL autonomous agent micropayments gate.',
      x: 75,
      y: 75,
    },
  ];

  // Connections connecting nodes
  const edges = [
    { from: 'root', to: 'robots' },
    { from: 'root', to: 'llms_txt' },
    { from: 'robots', to: 'openapi' },
    { from: 'llms_txt', to: 'mcp' },
    { from: 'openapi', to: 'auth' },
    { from: 'mcp', to: 'payments' },
    { from: 'openapi', to: 'mcp' },
  ];

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];

  return (
    <div className="w-full rounded-2xl bg-[#0A0A0B] border border-white/[0.08] p-5 sm:p-7 glint-card overflow-hidden font-mono">
      {/* Topology Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#FF3300] font-bold">
              ARS 3.0 Machine Topology Map
            </span>
            <span className="px-2 py-0.5 rounded text-[9px] bg-white/5 border border-white/10 text-white/50">
              Sub-5s Discovered Surfaces
            </span>
          </div>
          <div className="text-xs text-white/40 mt-1">
            Visual graph connecting verified machine-readable endpoints across the target ecosystem.
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-white/50">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span>Missing</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Partial</span>
          </div>
        </div>
      </div>

      {/* Main Graph Canvas Area */}
      <div className="relative w-full h-[320px] sm:h-[380px] bg-black/40 rounded-xl border border-white/[0.04] overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

        {/* SVG Connection Lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {edges.map((edge, idx) => {
            const fromNode = nodes.find((n) => n.id === edge.from);
            const toNode = nodes.find((n) => n.id === edge.to);
            if (!fromNode || !toNode) return null;

            const isPassed = fromNode.status === 'active' && toNode.status === 'active';

            return (
              <line
                key={idx}
                x1={`${fromNode.x}%`}
                y1={`${fromNode.y}%`}
                x2={`${toNode.x}%`}
                y2={`${toNode.y}%`}
                stroke={isPassed ? '#FF3300' : 'rgba(255,255,255,0.1)'}
                strokeWidth={isPassed ? '1.5' : '1'}
                strokeDasharray={isPassed ? undefined : '3,3'}
                strokeOpacity={isPassed ? '0.7' : '0.4'}
              />
            );
          })}
        </svg>

        {/* Interactive Nodes */}
        {nodes.map((node) => {
          const isSelected = selectedNodeId === node.id;
          const Icon = node.icon;
          const isActive = node.status === 'active';
          const isMissing = node.status === 'missing';

          return (
            <motion.button
              key={node.id}
              onClick={() => setSelectedNodeId(node.id)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 p-2.5 sm:p-3 rounded-xl border flex items-center gap-2 transition-all cursor-pointer select-none shadow-md ${
                isSelected
                  ? 'border-[#FF3300] bg-[#FF3300]/15 shadow-[#FF3300]/20'
                  : isActive
                  ? 'border-emerald-500/40 bg-black/80 hover:border-emerald-500/60'
                  : isMissing
                  ? 'border-rose-500/30 bg-black/80 hover:border-rose-500/50'
                  : 'border-white/10 bg-black/80 hover:border-white/20'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : isMissing
                    ? 'bg-rose-500/10 text-rose-400'
                    : 'bg-white/5 text-white/50'
                }`}
              >
                <Icon size={13} />
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-[11px] font-bold text-white leading-tight">
                  {node.label}
                </div>
                <div
                  className={`text-[8px] uppercase tracking-wider ${
                    isActive ? 'text-emerald-400' : isMissing ? 'text-rose-400' : 'text-white/40'
                  }`}
                >
                  {node.status}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Selected Node Details Card */}
      {selectedNode && (
        <div className="mt-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                selectedNode.status === 'active'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : selectedNode.status === 'missing'
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  : 'bg-white/5 text-white/50 border border-white/10'
              }`}
            >
              <selectedNode.icon size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">
                  {selectedNode.label}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[8px] uppercase font-bold ${
                    selectedNode.status === 'active'
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : selectedNode.status === 'missing'
                      ? 'text-rose-400 bg-rose-500/10'
                      : 'text-white/40 bg-white/5'
                  }`}
                >
                  {selectedNode.status}
                </span>
              </div>
              <p className="text-[11px] text-white/45 mt-0.5 max-w-xl">
                {selectedNode.description}
              </p>
            </div>
          </div>

          {selectedNode.url && (
            <a
              href={selectedNode.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-xs border border-white/10 transition-all shrink-0 self-start sm:self-auto"
            >
              <span>Inspect Endpoint</span>
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
