"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  X,
  ExternalLink,
  Clock,
  Coins,
  Code2,
  Terminal,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import Mascot3DCanvas from './Mascot3DCanvas';
import type {
  HarnessType,
  JourneyPillNode,
  ProceduralLine,
  CanvasCoord,
  JourneyIconType,
  MascotReaction,
} from '@/lib/scanner/simulator/types';

interface ProceduralWorkflowCanvasProps {
  harness: HarnessType;
  nodes: JourneyPillNode[];
  lines: ProceduralLine[];
  allNodes?: JourneyPillNode[];
  activeNodeId?: string | null;
  agentCoord: CanvasCoord;
  agentReaction: MascotReaction;
  currentActionText?: string;
  tickerText?: string;
  tickerSubText?: string;
  isRunning?: boolean;
  onNodeSelect?: (node: JourneyPillNode) => void;
  // Replay & Scrubber callbacks
  onTogglePlay?: () => void;
  onScrub?: (stepIndex: number) => void;
  onReplayStep?: (stepIndex: number) => void; // backwards compat
  onReplaySpeedChange?: (speed: number) => void;
  replaySpeed?: number;
  isReplaying?: boolean;
  replayStepIndex?: number;
  totalStepsCount?: number;
}

export default function ProceduralWorkflowCanvas({
  harness,
  nodes = [],
  lines = [],
  allNodes = [],
  activeNodeId,
  agentCoord,
  agentReaction = 'idle',
  currentActionText,
  tickerText,
  tickerSubText,
  isRunning = false,
  onNodeSelect,
  onTogglePlay,
  onScrub,
  onReplayStep,
  onReplaySpeedChange,
  replaySpeed: externalReplaySpeed,
  isReplaying = false,
  replayStepIndex = 0,
  totalStepsCount = 0,
}: ProceduralWorkflowCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 960,
    height: 680,
  });
  const [selectedNode, setSelectedNode] = useState<JourneyPillNode | null>(null);
  const [internalReplaySpeed, setInternalReplaySpeed] = useState<number>(1);
  const replaySpeed = externalReplaySpeed !== undefined ? externalReplaySpeed : internalReplaySpeed;

  const handleSpeedCycle = () => {
    const nextSpeed = replaySpeed === 1 ? 2 : replaySpeed === 2 ? 4 : 1;
    if (onReplaySpeedChange) {
      onReplaySpeedChange(nextSpeed);
    } else {
      setInternalReplaySpeed(nextSpeed);
    }
  };

  // Measured pixel dimensions for each card to ensure conduit lines connect with zero gap
  const [nodeDims, setNodeDims] = useState<Record<string, { halfW: number; halfH: number }>>({});

  const measureNode = (id: string, el: HTMLDivElement | null) => {
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w > 20 && h > 10) {
      const halfW = Math.round(w / 2);
      const halfH = Math.round(h / 2);
      setNodeDims((prev) => {
        const existing = prev[id];
        if (existing && existing.halfW === halfW && existing.halfH === halfH) {
          return prev;
        }
        return { ...prev, [id]: { halfW, halfH } };
      });
    }
  };

  // Synthesize missing lines if nodes have parentIds but lines array is incomplete
  const effectiveLines = useMemo(() => {
    const result = [...lines];
    nodes.forEach((node) => {
      if (node.parentId) {
        const hasLine = result.some((l) => l.toId === node.id);
        if (!hasLine) {
          const parent = nodes.find((n) => n.id === node.parentId);
          if (parent) {
            result.push({
              id: `line_${parent.id}_${node.id}`,
              fromId: parent.id,
              toId: node.id,
              fromCoord: parent.coord || { x: 85, y: 240 },
              toCoord: node.coord || { x: 85, y: 240 },
              status: node.status,
              lineType: node.isDeadEnd ? 'dead_end' : 'solid',
              isDrawn: true,
            });
          }
        }
      }
    });
    return result;
  }, [lines, nodes]);

  // Click-to-highlight connected nodes and lines
  const { connectedNodeIds, highlightedLineIds } = useMemo(() => {
    if (!selectedNode) return { connectedNodeIds: new Set<string>(), highlightedLineIds: new Set<string>() };
    const nodeIds = new Set<string>([selectedNode.id]);
    const lineIds = new Set<string>();

    effectiveLines.forEach((l) => {
      if (l.fromId === selectedNode.id) {
        nodeIds.add(l.toId);
        lineIds.add(l.id);
      } else if (l.toId === selectedNode.id) {
        nodeIds.add(l.fromId);
        lineIds.add(l.id);
      }
    });

    return { connectedNodeIds: nodeIds, highlightedLineIds: lineIds };
  }, [selectedNode, effectiveLines]);

  // Measure container dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const w = Math.max(900, containerRef.current.clientWidth);
        const h = Math.max(680, containerRef.current.clientHeight || 680);
        setDimensions({ width: w, height: h });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Responsive full-canvas layout normalization: distributes nodes harmoniously across width & depth
  const normalizedNodes = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];

    const marginX = 90;
    const availableWidth = Math.max(480, dimensions.width - marginX * 2 - 40);
    const topMarginY = 135;
    const bottomMarginY = 110;
    const availableHeight = Math.max(260, dimensions.height - topMarginY - bottomMarginY);
    const baselineY = topMarginY + Math.round(availableHeight * 0.45);

    // Calculate total columns
    const maxCol = Math.max(...nodes.map((n, i) => (n.col !== undefined ? n.col : i)), 1);
    const totalCols = Math.max(maxCol + 1, Math.min(6, totalStepsCount || nodes.length));
    const colStepX = availableWidth / Math.max(1, totalCols - 1);

    return nodes.map((node, idx) => {
      const col = node.col !== undefined ? node.col : idx;
      const targetX = Math.round(marginX + col * colStepX);

      // Vertical placement:
      // Row 0 (Trunk / Pass): centered baseline
      // Row 1 or Dead-End / Fail: branches downwards (+110px)
      // Spec / MCP / Auth: branches upwards (-105px)
      let targetY = baselineY;
      if (node.isDeadEnd || node.status === 'fail' || node.row === 1) {
        targetY = Math.min(dimensions.height - 110, baselineY + 115);
      } else if (
        node.iconType === 'openapi' ||
        node.iconType === 'mcp' ||
        node.iconType === 'auth' ||
        (node.row !== undefined && node.row < 0)
      ) {
        targetY = Math.max(120, baselineY - 105);
      } else {
        // Gentle organic wave along trunk
        targetY = baselineY + (col % 2 === 1 ? 16 : -16);
      }

      return {
        ...node,
        coord: {
          x: Math.max(marginX, Math.min(dimensions.width - 120, targetX)),
          y: Math.max(90, Math.min(dimensions.height - 90, targetY)),
        },
      };
    });
  }, [nodes, dimensions.width, dimensions.height, totalStepsCount]);

  const normalizedLines = useMemo(() => {
    const nodeCoordMap = new Map<string, CanvasCoord>();
    normalizedNodes.forEach((n) => {
      if (n.coord) nodeCoordMap.set(n.id, n.coord);
    });

    return effectiveLines.map((l) => ({
      ...l,
      fromCoord: nodeCoordMap.get(l.fromId) || l.fromCoord,
      toCoord: nodeCoordMap.get(l.toId) || l.toCoord,
    }));
  }, [effectiveLines, normalizedNodes]);

  const normalizedAgentCoord = useMemo(() => {
    // Offset so mascot perches visibly on top of the component card (zero overlap with card text)
    const MASCOT_Y_OFFSET = -34;

    const marginX = 90;
    const availableWidth = Math.max(480, dimensions.width - marginX * 2 - 40);
    const topMarginY = 135;
    const bottomMarginY = 110;
    const availableHeight = Math.max(260, dimensions.height - topMarginY - bottomMarginY);
    const baselineY = topMarginY + Math.round(availableHeight * 0.45);

    const fullCatalog = allNodes && allNodes.length > 0 ? allNodes : nodes;
    const maxCol = Math.max(...fullCatalog.map((n, i) => (n.col !== undefined ? n.col : i)), 1);
    const totalCols = Math.max(maxCol + 1, Math.min(6, totalStepsCount || fullCatalog.length));
    const colStepX = availableWidth / Math.max(1, totalCols - 1);

    const calcCoord = (n: JourneyPillNode, idx: number) => {
      const col = n.col !== undefined ? n.col : idx;
      const targetX = Math.round(marginX + col * colStepX);
      let targetY = baselineY;
      if (n.isDeadEnd || n.status === 'fail' || n.row === 1) {
        targetY = Math.min(dimensions.height - 110, baselineY + 115);
      } else if (
        n.iconType === 'openapi' ||
        n.iconType === 'mcp' ||
        n.iconType === 'auth' ||
        (n.row !== undefined && n.row < 0)
      ) {
        targetY = Math.max(120, baselineY - 105);
      } else {
        targetY = baselineY + (col % 2 === 1 ? 16 : -16);
      }
      return {
        x: Math.max(marginX, Math.min(dimensions.width - 120, targetX)),
        y: Math.max(45, targetY + MASCOT_Y_OFFSET),
      };
    };

    // 1. Direct activeNodeId match (most accurate)
    if (activeNodeId) {
      const normMatch = normalizedNodes.find((n) => n.id === activeNodeId);
      if (normMatch?.coord) {
        return {
          x: normMatch.coord.x,
          y: Math.max(45, normMatch.coord.y + MASCOT_Y_OFFSET),
        };
      }
      const allMatchIdx = fullCatalog.findIndex((n) => n.id === activeNodeId);
      if (allMatchIdx !== -1) {
        return calcCoord(fullCatalog[allMatchIdx], allMatchIdx);
      }
    }

    // 2. Match against node coord in normalizedNodes or fullCatalog
    if (agentCoord) {
      const matchingNode = nodes.find(
        (n) => n.coord && Math.abs(n.coord.x - agentCoord.x) < 25 && Math.abs(n.coord.y - agentCoord.y) < 25
      );
      if (matchingNode) {
        const normNode = normalizedNodes.find((n) => n.id === matchingNode.id);
        if (normNode?.coord) {
          return {
            x: normNode.coord.x,
            y: Math.max(45, normNode.coord.y + MASCOT_Y_OFFSET),
          };
        }
      }
      const inAllIdx = fullCatalog.findIndex(
        (n) => n.coord && Math.abs(n.coord.x - agentCoord.x) < 25 && Math.abs(n.coord.y - agentCoord.y) < 25
      );
      if (inAllIdx !== -1) {
        return calcCoord(fullCatalog[inAllIdx], inAllIdx);
      }
    }

    // 3. Fallback: last known normalized node
    const lastNode = normalizedNodes[normalizedNodes.length - 1];
    if (lastNode?.coord) {
      return {
        x: lastNode.coord.x,
        y: Math.max(45, lastNode.coord.y + MASCOT_Y_OFFSET),
      };
    }

    return { x: 90, y: Math.max(45, baselineY + MASCOT_Y_OFFSET) };
  }, [activeNodeId, agentCoord, nodes, allNodes, normalizedNodes, dimensions.width, dimensions.height, totalStepsCount]);

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

  // 3 Basic Semantic Colors (Pass: Emerald Green, Warn: Amber, Fail: Rose Red)
  const getNodeColor = (status: 'pass' | 'warn' | 'fail', isSelected: boolean, isConnected: boolean) => {
    if (isSelected) {
      return 'border-white ring-1 ring-white/80 bg-white/[0.09] text-white shadow-lg';
    }
    if (isConnected) {
      return 'border-white/50 bg-white/[0.04] text-white ring-1 ring-white/20';
    }
    switch (status) {
      case 'pass':
        return 'border-emerald-500/30 bg-[#111613] text-emerald-300 hover:border-emerald-500/60';
      case 'warn':
        return 'border-amber-500/30 bg-[#161410] text-amber-300 hover:border-amber-500/60';
      case 'fail':
        return 'border-rose-500/40 bg-[#171112] text-rose-300 hover:border-rose-500/70';
    }
  };

  // Pure orthogonal routing with corner radius (matching Ora video frames)
  const getOrthogonalPath = (line: ProceduralLine) => {
    const from = line.fromCoord;
    const to = line.toCoord;
    const fromDim = nodeDims[line.fromId] || { halfW: 54, halfH: 15 };
    const toDim = nodeDims[line.toId] || { halfW: 54, halfH: 15 };
    const fromHalfW = fromDim.halfW;
    const fromHalfH = fromDim.halfH;
    const toHalfW = toDim.halfW;
    const toHalfH = toDim.halfH;

    // Exact horizontal conduit (nodes on baseline with minimal vertical difference)
    if (Math.abs(from.y - to.y) < 8) {
      const x1 = from.x < to.x ? from.x + fromHalfW : from.x - fromHalfW;
      const x2 = from.x < to.x ? to.x - toHalfW : to.x + toHalfW;
      return `M ${x1} ${from.y} L ${x2} ${to.y}`;
    }

    // Exact vertical conduit (vertically stacked nodes)
    if (Math.abs(from.x - to.x) < 8) {
      const y1 = from.y < to.y ? from.y + fromHalfH : from.y - fromHalfH;
      const y2 = from.y < to.y ? to.y - toHalfH : to.y + toHalfH;
      return `M ${from.x} ${y1} L ${to.x} ${y2}`;
    }

    // Downward branch (e.g. dead end or fail branching down to row 1)
    if (to.y > from.y + 35) {
      const x1 = from.x;
      const y1 = from.y + fromHalfH;
      const x2 = to.x - toHalfW;
      const y2 = to.y;
      if (x2 > x1 + 8) {
        const r = Math.min(12, Math.max(4, (x2 - x1) / 2), Math.max(4, (y2 - y1) / 2));
        return `M ${x1} ${y1} L ${x1} ${y2 - r} Q ${x1} ${y2} ${x1 + r} ${y2} L ${x2} ${y2}`;
      }
    }

    // Upward branch (e.g. spec or MCP doc node above trunk)
    if (to.y < from.y - 35) {
      const x1 = from.x;
      const y1 = from.y - fromHalfH;
      const x2 = to.x - toHalfW;
      const y2 = to.y;
      if (x2 > x1 + 8) {
        const r = Math.min(12, Math.max(4, (x2 - x1) / 2), Math.max(4, (from.y - to.y) / 2));
        return `M ${x1} ${y1} L ${x1} ${y2 + r} Q ${x1} ${y2} ${x1 + r} ${y2} L ${x2} ${y2}`;
      }
    }

    // Gentle wave on trunk or general orthogonal connection
    const dirX = to.x > from.x ? 1 : -1;
    const dirY = to.y > from.y ? 1 : -1;
    const x1 = from.x + dirX * fromHalfW;
    const y1 = from.y;
    const x2 = to.x - dirX * toHalfW;
    const y2 = to.y;

    if (dirX < 0) {
      // Backtrack / loopback curve
      return `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1 + 40}, ${(x1 + x2) / 2} ${y2 + 40}, ${x2} ${y2}`;
    }

    const xMid = Math.round((x1 + x2) / 2);
    const r = Math.min(10, Math.max(3, Math.abs(xMid - x1) / 2), Math.max(3, Math.abs(y2 - y1) / 2));

    return `M ${x1} ${y1} L ${xMid - r * dirX} ${y1} Q ${xMid} ${y1} ${xMid} ${y1 + r * dirY} L ${xMid} ${y2 - r * dirY} Q ${xMid} ${y2} ${xMid + r * dirX} ${y2} L ${x2} ${y2}`;
  };

  return (
    <div
      ref={containerRef}
      className="w-full bg-[#0B0B0C] border border-white/[0.08] rounded-xl relative overflow-hidden shadow-2xl select-none"
      style={{ minHeight: '680px' }}
      onClick={() => setSelectedNode(null)}
    >
      {/* ─── Layer 0: Technical Blueprint Crosshair Grid ──────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #ffffff 1px, transparent 1px),
            linear-gradient(to bottom, #ffffff 1px, transparent 1px)
          `,
          backgroundSize: '36px 36px',
        }}
      />
      {/* Subtle radial vignette spotlight */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.02)_0%,transparent_70%)]" />

      {/* ─── Layer 0.5: Live Terminal Ticker Header (Ora Video Style) ─────────── */}
      <div className="absolute top-5 left-7 z-20 pointer-events-none font-mono">
        <div className="flex items-center gap-2.5 text-white text-sm font-medium tracking-tight">
          <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="text-stone-200">
            {tickerText || currentActionText || (isRunning ? 'Fetching /...' : 'Ready to simulate')}
          </span>
          <span className="inline-block w-1.5 h-3.5 bg-white/70 animate-pulse ml-0.5" />
        </div>
        <div className="text-xs text-stone-500 mt-1 font-mono tracking-wide">
          {tickerSubText || `${nodes.length} steps   ${nodes.length > 2 ? '1 reasoning step' : ''}`}
        </div>
      </div>

      {/* ─── Layer 1: SVG Procedural Circuit Lines ────────────────────────────── */}
      <svg
        className="absolute inset-0 pointer-events-none z-0"
        width={dimensions.width}
        height={dimensions.height}
      >
        {normalizedLines.map((line) => {
          const pathD = getOrthogonalPath(line);
          const isDeadEnd = line.lineType === 'dead_end' || line.status === 'fail';
          const isHighlighted = highlightedLineIds.has(line.id);

          // High-visibility crisp white circuit conduit. Glows brightly when node is selected.
          let strokeColor = isDeadEnd ? 'rgba(239, 68, 68, 0.55)' : 'rgba(255, 255, 255, 0.42)';
          let strokeWidth = '2';
          let strokeOpacity = 1;

          if (selectedNode) {
            if (isHighlighted) {
              strokeColor = isDeadEnd ? '#EF4444' : '#FFFFFF';
              strokeWidth = '2.5';
              strokeOpacity = 1;
            } else {
              strokeColor = 'rgba(255, 255, 255, 0.18)';
              strokeWidth = '1.5';
              strokeOpacity = 0.5;
            }
          }

          return (
            <g key={line.id}>
              {/* Pure orthogonal conduit */}
              <path
                d={pathD}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeOpacity={strokeOpacity}
                strokeDasharray={isDeadEnd ? '4 4' : undefined}
                strokeLinecap="round"
                style={{
                  filter: isHighlighted
                    ? isDeadEnd
                      ? 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.8))'
                      : 'drop-shadow(0 0 6px rgba(255, 255, 255, 0.85))'
                    : undefined,
                  transition: 'stroke 0.2s ease, stroke-width 0.2s ease, stroke-opacity 0.2s ease',
                }}
              />
            </g>
          );
        })}
      </svg>

      {/* ─── Layer 2: 3D Miniature Mascot WebGL Canvas ────────────────────────── */}
      <Mascot3DCanvas
        harness={harness}
        targetCoord={normalizedAgentCoord}
        reaction={agentReaction}
        width={dimensions.width}
        height={dimensions.height}
        replaySpeed={replaySpeed}
      />

      {/* ─── Layer 2.5: Mascot Micro-Action Floating Badge ────────────────────── */}
      <AnimatePresence>
        {agentReaction !== 'idle' && (
          <div
            key={agentReaction}
            style={{
              position: 'absolute',
              left: `${normalizedAgentCoord.x}px`,
              top: `${normalizedAgentCoord.y}px`,
              transform: 'translate(-50%, -100%)',
            }}
            className="pointer-events-none z-40"
          >
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.85 }}
              animate={{ opacity: 1, y: -22, scale: 1 }}
              exit={{ opacity: 0, y: -30, scale: 0.85 }}
              transition={{ duration: 0.25 }}
            >
              <div
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold flex items-center gap-1 shadow-lg backdrop-blur-md border ${
                  agentReaction === 'nod'
                    ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300'
                    : agentReaction === 'nope'
                    ? 'bg-rose-950/80 border-rose-500/80 text-rose-300'
                    : agentReaction === 'thinking'
                    ? 'bg-amber-950/80 border-amber-500/80 text-amber-300'
                    : agentReaction === 'backtrack'
                    ? 'bg-amber-950/80 border-amber-500/80 text-amber-300'
                    : 'bg-stone-900/80 border-white/20 text-white'
                }`}
              >
                {agentReaction === 'nod' && <span>✓ Validated</span>}
                {agentReaction === 'nope' && <span>✕ Nope (Dead End)</span>}
                {agentReaction === 'thinking' && <span>🤔 Thinking...</span>}
                {agentReaction === 'backtrack' && <span>↩ Backtracking</span>}
                {agentReaction === 'scanning' && <span>⚡ Probing...</span>}
                {agentReaction === 'success' && <span>🎉 Mission Done</span>}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Layer 3: Procedural Component Cards (DOM Layer) ─────────────────── */}
      <div className="absolute inset-0 pointer-events-auto z-20 overflow-visible">
        {normalizedNodes.map((node) => {
          const coord = node.coord || { x: 120, y: 110 };
          const isSelected = selectedNode?.id === node.id;
          const isConnected = connectedNodeIds.has(node.id) && !isSelected;
          const isDimmed = selectedNode !== null && !isSelected && !isConnected;

          return (
            <div
              key={node.id}
              ref={(el) => measureNode(node.id, el)}
              style={{
                position: 'absolute',
                left: `${coord.x}px`,
                top: `${coord.y}px`,
                transform: 'translate(-50%, -50%)',
                zIndex: isSelected ? 28 : 22,
              }}
              className="cursor-pointer select-none"
              onClick={(e) => {
                e.stopPropagation();
                const nextNode = selectedNode?.id === node.id ? null : node;
                setSelectedNode(nextNode);
                if (nextNode) onNodeSelect?.(nextNode);
              }}
            >
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: isSelected ? 1.05 : 1, opacity: isDimmed ? 0.35 : 1 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', damping: 24, stiffness: 300 }}
                className="group"
              >
                {/* Component Card Pill */}
                <div
                  className={`relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-mono font-semibold border backdrop-blur-md transition-all duration-200 whitespace-nowrap shadow-md ${getNodeColor(
                    node.status,
                    isSelected,
                    isConnected
                  )}`}
                >
                  {/* Active Pulsing Dot (when active node) */}
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
                  )}

                  {/* Contextual Icon */}
                  <span className="shrink-0">{renderIcon(node.iconType)}</span>

                  {/* Label */}
                  <span className="font-bold tracking-tight">{node.label}</span>

                  {/* Micro HTTP Status Tag */}
                  {node.httpStatus && (
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-mono font-normal ${
                        node.httpStatus < 400
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {node.httpStatus}
                    </span>
                  )}
                </div>

                {/* Thought Tooltip on Active/Click */}
                {isSelected && node.thought && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: -8 }}
                    className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 w-56 bg-[#161618] border border-white/[0.15] text-stone-200 text-[11px] font-mono p-2.5 rounded-md shadow-xl z-30 pointer-events-none"
                  >
                    <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-stone-400 font-bold pb-1 border-b border-white/[0.06]">
                      <Sparkles className="w-2.5 h-2.5 text-white" />
                      <span>Agent Monologue</span>
                    </div>
                    <p className="pt-1 line-clamp-3 leading-snug">{node.thought}</p>
                  </motion.div>
                )}
              </motion.div>
            </div>
          );
        })}
      </div>

      {/* ─── Layer 4: Replay Scrubber Bar ────────────────────────────────────── */}
      <div className="absolute bottom-4 inset-x-4 z-30 flex items-center justify-between gap-4 bg-[#121214]/90 border border-white/[0.12] rounded-xl px-4 py-2.5 backdrop-blur-lg shadow-2xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (onTogglePlay) {
                onTogglePlay();
              } else {
                onReplayStep?.(isReplaying ? -1 : 0);
              }
            }}
            disabled={isRunning || nodes.length === 0}
            className="flex items-center gap-1.5 text-xs font-mono font-semibold bg-white/[0.08] hover:bg-white/[0.14] text-white px-3 py-1.5 rounded-lg border border-white/[0.1] transition active:scale-[0.96] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isReplaying ? (
              <>
                <Pause className="w-3.5 h-3.5 text-[#FF3300]" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-[#FF3300] fill-current" />
                <span>Replay Flight</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-1 bg-[#1C1C1F] border border-white/[0.08] rounded-md px-2 py-1 text-[10px] font-mono text-stone-300">
            <span>Speed:</span>
            <button
              onClick={handleSpeedCycle}
              className="font-bold text-[#FF3300] hover:underline cursor-pointer ml-1"
            >
              {replaySpeed}x
            </button>
          </div>
        </div>

        <div className="flex-1 max-w-md flex items-center gap-3">
          <span className="text-[10px] font-mono text-stone-400 whitespace-nowrap">
            Step {replayStepIndex + 1} / {Math.max(1, totalStepsCount || nodes.length)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0, (totalStepsCount || nodes.length) - 1)}
            value={replayStepIndex}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (onScrub) {
                onScrub(val);
              } else {
                onReplayStep?.(val);
              }
            }}
            disabled={isRunning || nodes.length === 0}
            className="w-full h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-[#FF3300]"
          />
        </div>

        <div className="text-[10px] font-mono text-stone-500 hidden md:block">
          Click any node to inspect payload & manual fixes
        </div>
      </div>

      {/* ─── Layer 5: Node Inspection Slide-Over Drawer (Manual Fix First) ────── */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="absolute inset-x-4 bottom-20 z-40 bg-[#141416]/95 border border-white/[0.14] rounded-xl p-5 shadow-2xl space-y-3.5 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 rounded bg-white/[0.06] text-white">
                  {renderIcon(selectedNode.iconType)}
                </span>
                <span className="font-mono font-bold text-white text-sm">
                  {selectedNode.label}
                </span>
                {selectedNode.url && (
                  <a
                    href={
                      /^https?:\/\//i.test(selectedNode.url)
                        ? selectedNode.url
                        : `https://${selectedNode.url.replace(/^\/+/, '')}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="text-stone-400 hover:text-white transition flex items-center gap-1 text-xs font-mono"
                  >
                    <span>{selectedNode.url}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-stone-400 hover:text-white p-1 rounded hover:bg-white/[0.06] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
              <div className="bg-[#1C1C1F] p-3 rounded border border-white/[0.06] space-y-1">
                <div className="text-stone-500 flex items-center gap-1 text-[10px] uppercase">
                  <Clock className="w-3 h-3" />
                  <span>Status & Latency</span>
                </div>
                <div className="text-white font-semibold">
                  HTTP {selectedNode.httpStatus || 200} · {selectedNode.latencyMs || 140}ms
                </div>
              </div>

              <div className="bg-[#1C1C1F] p-3 rounded border border-white/[0.06] space-y-1">
                <div className="text-stone-500 flex items-center gap-1 text-[10px] uppercase">
                  <Coins className="w-3 h-3" />
                  <span>Token Burn</span>
                </div>
                <div className="text-emerald-400 font-semibold">
                  {selectedNode.tokens.toLocaleString()} tokens
                </div>
              </div>

              <div className="bg-[#1C1C1F] p-3 rounded border border-white/[0.06] space-y-1">
                <div className="text-stone-500 flex items-center gap-1 text-[10px] uppercase">
                  <Terminal className="w-3 h-3" />
                  <span>Outcome</span>
                </div>
                <div className="text-white font-semibold flex items-center gap-1.5">
                  {selectedNode.status === 'pass' ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300">Target Validated</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span className="text-rose-300">Friction Point</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {selectedNode.thought && (
              <div className="bg-[#18181B] p-3 rounded border border-white/[0.06] text-xs font-mono space-y-1">
                <div className="text-stone-400 font-bold text-[10px] uppercase tracking-wider">
                  Agent Internal Reasoning
                </div>
                <div className="text-stone-300 leading-relaxed">{selectedNode.thought}</div>
              </div>
            )}

            {/* Plain English Manual Fix Instructions (No forced CLI!) */}
            {selectedNode.remediation && (
              <div className="bg-[#171410] border border-amber-500/30 p-3.5 rounded-lg text-xs font-mono space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>How to resolve this issue: {selectedNode.remediation.title}</span>
                </div>
                <p className="text-stone-300 text-xs leading-relaxed">
                  {selectedNode.remediation.manualInstruction}
                </p>
                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-stone-400">
                  <span>Optional Glintbase CLI automation:</span>
                  <code className="bg-black/40 px-2 py-0.5 rounded text-amber-300 font-mono text-[10px] border border-amber-500/20">
                    {selectedNode.remediation.fixCommand || 'glintbase scan --fix'}
                  </code>
                </div>
              </div>
            )}

            {selectedNode.rawSnippet && (
              <div className="bg-[#0D0D0E] p-3 rounded border border-white/[0.06] text-[11px] font-mono space-y-1">
                <div className="text-stone-500 flex items-center gap-1 text-[10px] uppercase">
                  <Code2 className="w-3 h-3" />
                  <span>HTTP Response Snippet</span>
                </div>
                <pre className="text-stone-300 overflow-x-auto whitespace-pre-wrap max-h-24">
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
