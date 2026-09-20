"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Play,
  RotateCw,
  Terminal,
  Layers,
  Settings2,
  ChevronDown,
  Globe,
  Compass,
  ArrowRight,
  Bot,
  Cpu,
} from 'lucide-react';
import JourneyTelemetryHeader from './simulator/JourneyTelemetryHeader';
import ProceduralWorkflowCanvas from './simulator/ProceduralWorkflowCanvas';
import JourneyKPICards from './simulator/JourneyKPICards';
import JourneyInsightSection from './simulator/JourneyInsightSection';
import LiveTerminalFeed from './simulator/LiveTerminalFeed';
import { decompressFlightHash, convertSessionToJourneyResult } from '@/lib/scanner/simulator/stateDecompressor';
import type {
  HarnessType,
  JourneyExecutionResult,
  JourneyPillNode,
  ProceduralLine,
  CanvasCoord,
  JourneyTelemetryStats,
  MascotReaction,
} from '@/lib/scanner/simulator/types';

interface FlightSimulatorCockpitProps {
  initialTarget?: string;
}

const PRESET_INTENTS = [
  "I'm a developer. Find the API docs and how to authenticate for this platform.",
  "Discover what this product does, its core value proposition, and main use cases.",
  "Verify OpenAPI 3.x schema and Model Context Protocol (MCP) tool availability.",
  "Probe non-existent routes to test for soft-404 anti-SPA hallucination traps.",
];

const HARNESS_CHOICES: {
  id: HarnessType;
  name: string;
  mascotImg: string;
  badge: string;
  desc: string;
}[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    mascotImg: '/mascots/claude-code.png',
    badge: '3D Box-Bot',
    desc: 'Anthropic AST parser & tool harness with high-signal intent extraction.',
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    mascotImg: '/mascots/openclaw.png',
    badge: '3D Sphere-Bot',
    desc: 'Autonomous web agent with agile reactive probing and tool calling.',
  },
  {
    id: 'hermes',
    name: 'Hermes Agent',
    mascotImg: '/mascots/hermes.png',
    badge: 'Nous Avatar',
    desc: 'NousResearch tool agent specialized in autonomous multi-step reasoning.',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    mascotImg: '/mascots/opencode.png',
    badge: 'Terminal Drone',
    desc: 'Specialized SWE agent inspecting protocol schemas and endpoints.',
  },
];

export default function FlightSimulatorCockpit({
  initialTarget = '',
}: FlightSimulatorCockpitProps) {
  const [target, setTarget] = useState(initialTarget || 'https://stripe.com');
  const [harness, setHarness] = useState<HarnessType>('claude-code');
  const [intent, setIntent] = useState(
    "I'm a developer. Find the API docs and how to authenticate for stripe.com."
  );
  const [stage, setStage] = useState<'setup' | 'flight'>('setup');
  const [isRunning, setIsRunning] = useState(false);
  const [activeView, setActiveView] = useState<'tree' | 'terminal'>('tree');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [status, setStatus] = useState<'success' | 'failed' | 'running' | 'idle'>('idle');

  // Procedural Live States (No mock pre-population!)
  const [liveNodes, setLiveNodes] = useState<JourneyPillNode[]>([]);
  const [liveLines, setLiveLines] = useState<ProceduralLine[]>([]);
  const [agentCoord, setAgentCoord] = useState<CanvasCoord>({ x: 80, y: 80 });
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [agentReaction, setAgentReaction] = useState<MascotReaction>('idle');
  const [currentActionText, setCurrentActionText] = useState<string>('');
  const [liveTickerText, setLiveTickerText] = useState<string>('');
  const [liveTickerSubText, setLiveTickerSubText] = useState<string>('');
  const [liveTelemetry, setLiveTelemetry] = useState<JourneyTelemetryStats | undefined>(undefined);
  const [journeyResult, setJourneyResult] = useState<JourneyExecutionResult | null>(null);
  const [liveTerminalLogs, setLiveTerminalLogs] = useState<string[]>([]);

  // Cached full dataset for scrubber & replay
  const [allCompletedNodes, setAllCompletedNodes] = useState<JourneyPillNode[]>([]);
  const [allCompletedLines, setAllCompletedLines] = useState<ProceduralLine[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayStepIndex, setReplayStepIndex] = useState<number>(0);
  const replayAbortRef = useRef<boolean>(false);

  // Automatically update intent when target changes if intent uses default wording
  const handleTargetChange = (newTarget: string) => {
    setTarget(newTarget);
    const domain = newTarget.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (intent.includes("Find the API docs and how to authenticate for")) {
      setIntent(`I'm a developer. Find the API docs and how to authenticate for ${domain || 'this platform'}.`);
    }
  };

  // Replay flight simulation from URL hash if provided via Glintbase MCP (#data=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash && hash.includes('data=')) {
      decompressFlightHash(hash).then((session) => {
        if (!session) return;
        const result = convertSessionToJourneyResult(session);
        setTarget(session.target);
        setHarness(result.harness);
        setIntent(result.intent);
        setJourneyResult(result);
        setLiveNodes(result.nodes);
        setLiveLines(result.lines || []);
        setAllCompletedNodes(result.nodes);
        setAllCompletedLines(result.lines || []);
        setLiveTelemetry(result.telemetry);
        setLiveTerminalLogs(result.terminalLogs || []);
        setStatus(result.status);
        setCurrentActionText(`Replaying flight from Glintbase MCP (${session.persona})`);
        setStage('flight');
        if (result.nodes.length > 0) {
          const lastNode = result.nodes[result.nodes.length - 1];
          setActiveNodeId(lastNode.id);
          setAgentCoord(lastNode.coord || { x: 300, y: 150 });
        }
      });
    }
  }, []);

  // Launch Simulation function connected to real-time procedural stream
  const handleLaunchSimulation = async () => {
    if (!target.trim() || isRunning) return;

    // Reset all live states
    setLiveNodes([]);
    setLiveLines([]);
    setLiveTerminalLogs([]);
    setJourneyResult(null);
    setLiveTelemetry(undefined);
    setAllCompletedNodes([]);
    setAllCompletedLines([]);
    setIsReplaying(false);
    replayAbortRef.current = true;

    setAgentCoord({ x: 40, y: 90 });
    setAgentReaction('idle');
    setCurrentActionText('Booting sandbox & dispatching agent flight...');
    setIsRunning(true);
    setStatus('running');

    let cleanTarget = target.trim();
    if (!/^https?:\/\//i.test(cleanTarget)) {
      cleanTarget = cleanTarget.replace(/^(https?:\/\/)+/gi, '');
      cleanTarget = cleanTarget.replace(/^localhost(:\d+)?\/?/i, '');
      if (!cleanTarget.includes('.') && !cleanTarget.includes('/')) {
        cleanTarget = `${cleanTarget}.com`;
      }
      cleanTarget = `https://${cleanTarget}`;
    }

    try {
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: cleanTarget,
          harness,
          intent,
          mode: 'e2b',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to launch simulation`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream');

      const decoder = new TextDecoder();
      let buffer = '';
      const gatheredLines: ProceduralLine[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);

            if (event.type === 'agent_spawn') {
              setAgentCoord(event.startCoord);
              setActiveNodeId(null);
              setAgentReaction('idle');
              setCurrentActionText(`Mascot spawned at ${target}`);
            } else if (event.type === 'agent_navigate') {
              setAgentCoord(event.toCoord);
              if (event.targetNodeId) setActiveNodeId(event.targetNodeId);
              if (event.action) setCurrentActionText(event.action);
            } else if (event.type === 'agent_reaction') {
              setAgentReaction(event.reaction);
              if (event.targetNodeId) setActiveNodeId(event.targetNodeId);
              if (event.thought) setCurrentActionText(event.thought);
            } else if (event.type === 'agent_nod') {
              setAgentReaction('nod');
              if (event.targetNodeId) setActiveNodeId(event.targetNodeId);
              if (event.message) setCurrentActionText(event.message);
            } else if (event.type === 'agent_nope') {
              setAgentReaction('nope');
              if (event.targetNodeId) setActiveNodeId(event.targetNodeId);
              if (event.message) setCurrentActionText(event.message);
            } else if (event.type === 'agent_backtrack') {
              setAgentReaction('backtrack');
              if (event.targetNodeId) setActiveNodeId(event.targetNodeId);
              if (event.toCoord) setAgentCoord(event.toCoord);
              if (event.thought) setCurrentActionText(event.thought);
            } else if (event.type === 'agent_thinking') {
              setAgentReaction('thinking');
              if (event.targetNodeId) setActiveNodeId(event.targetNodeId);
              if (event.thought) setCurrentActionText(event.thought);
            } else if (event.type === 'ticker_update') {
              setLiveTickerText(event.text);
              if (event.subText) setLiveTickerSubText(event.subText);
            } else if (event.type === 'node_materialized') {
              setLiveNodes((prev) => [...prev, event.node]);
              if (event.node?.id) setActiveNodeId(event.node.id);
            } else if (event.type === 'line_connected') {
              gatheredLines.push(event.line);
              setLiveLines((prev) => [...prev, event.line]);
            } else if (event.type === 'telemetry_tick') {
              setLiveTelemetry({
                stepsCount: event.stepsCount,
                durationSeconds: event.durationSeconds,
                tokensBurned: event.tokensBurned,
                costUsd: event.costUsd,
                reasoningStepsCount: 1,
              });
            } else if (event.type === 'terminal_log') {
              setLiveTerminalLogs((prev) => [...prev, event.log]);
            } else if (event.type === 'complete' && event.result) {
              setJourneyResult(event.result);
              setLiveNodes(event.result.nodes);
              setAllCompletedNodes(event.result.nodes);
              const finalLines = event.result.lines && event.result.lines.length > 0 ? event.result.lines : gatheredLines;
              setLiveLines(finalLines);
              setAllCompletedLines(finalLines);
              setLiveTerminalLogs(event.result.terminalLogs || []);
              setStatus('success');
              setAgentReaction('success');
              if (event.result.nodes?.length) {
                setActiveNodeId(event.result.nodes[event.result.nodes.length - 1].id);
              }
              setCurrentActionText('Agent mission successfully executed.');
            }
          } catch {
            // ignore partial line parsing
          }
        }
      }
    } catch (err: any) {
      console.error('Simulation run failed:', err);
      setStatus('failed');
      setCurrentActionText('Simulation run encountered network error.');
    } finally {
      setIsRunning(false);
    }
  };

  const [replaySpeed, setReplaySpeed] = useState<number>(1);

  // ─── Procedural Replay & Scrubbing Logic ────────────────────────────────────
  const handleToggleReplay = async () => {
    if (allCompletedNodes.length === 0) return;

    if (isReplaying) {
      replayAbortRef.current = true;
      setIsReplaying(false);
      return;
    }

    setIsReplaying(true);
    replayAbortRef.current = false;

    // 1. Reset canvas to initial spawn
    setLiveNodes([]);
    setLiveLines([]);
    setAgentCoord(allCompletedNodes[0]?.coord || { x: 85, y: 135 });
    setActiveNodeId(allCompletedNodes[0]?.id || null);
    setAgentReaction('idle');
    setCurrentActionText('Replaying mission from entry point...');
    setReplayStepIndex(0);

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await delay(300 / replaySpeed);

    // 2. Step through each node calmly in lockstep
    for (let i = 0; i < allCompletedNodes.length; i++) {
      if (replayAbortRef.current) break;

      const node = allCompletedNodes[i];
      setReplayStepIndex(i);
      setActiveNodeId(node.id);

      // Phase A: Navigation to target node (synchronized travel)
      setCurrentActionText(`Navigating to ${node.label}...`);
      setLiveTickerText(`● Fetching ${node.url || node.label}`);
      setLiveTickerSubText(`${i + 1} of ${allCompletedNodes.length} steps`);
      if (node.coord) setAgentCoord(node.coord);
      setAgentReaction('idle');
      await delay(450 / replaySpeed);
      if (replayAbortRef.current) break;

      // Phase B: Node arrival & materialization
      const currentNodes = allCompletedNodes.slice(0, i + 1);
      setLiveNodes(currentNodes);

      // Connect line from parent
      const currentLines = allCompletedLines.filter((l) =>
        currentNodes.some((n) => n.id === l.fromId) && currentNodes.some((n) => n.id === l.toId)
      );
      setLiveLines(currentLines.length > 0 ? currentLines : allCompletedLines.slice(0, i));

      // Phase C: Inspection & Micro-interaction
      setAgentReaction('scanning');
      await delay(350 / replaySpeed);
      if (replayAbortRef.current) break;

      if (node.isDeadEnd || node.status === 'fail') {
        // Dead End Nope shake
        setAgentReaction('nope');
        setCurrentActionText(`Dead end at ${node.label} (HTTP ${node.httpStatus}). Backtracking...`);
        await delay(500 / replaySpeed);
        if (replayAbortRef.current) break;

        // Physical backtrack to parent node
        if (node.backtrackToId) {
          const parent = allCompletedNodes.find((n) => n.id === node.backtrackToId);
          if (parent) {
            setActiveNodeId(parent.id);
            setCurrentActionText(`Backtracking to ${parent.label}...`);
            setAgentReaction('backtrack');
            if (parent.coord) setAgentCoord(parent.coord);
            await delay(450 / replaySpeed);
            if (replayAbortRef.current) break;

            setAgentReaction('thinking');
            setCurrentActionText('Evaluating alternate documentation paths...');
            await delay(400 / replaySpeed);
            if (replayAbortRef.current) break;
          }
        }
      } else if (node.isDisconnectedSession) {
        setAgentReaction('nope');
        setCurrentActionText('External MCP registry unlinked from main tree.');
        await delay(500 / replaySpeed);
        if (replayAbortRef.current) break;

        if (node.backtrackToId) {
          const parent = allCompletedNodes.find((n) => n.id === node.backtrackToId);
          if (parent) {
            setActiveNodeId(parent.id);
            if (parent.coord) setAgentCoord(parent.coord);
            setAgentReaction('thinking');
            await delay(450 / replaySpeed);
            if (replayAbortRef.current) break;
          }
        }
      } else {
        setAgentReaction('nod');
        setCurrentActionText(`Validated ${node.label} [HTTP ${node.httpStatus || 200}]`);
        await delay(350 / replaySpeed);
        if (replayAbortRef.current) break;
      }

      // Phase D: Update telemetry for this step
      const cumulativeTokens = currentNodes.reduce((sum, n) => sum + n.tokens, 0);
      setLiveTelemetry({
        stepsCount: i + 1,
        durationSeconds: Number(((i + 1) * 0.9).toFixed(1)),
        tokensBurned: cumulativeTokens,
        costUsd: 0.00,
        reasoningStepsCount: 1,
      });

      await delay(150 / replaySpeed);
    }

    if (!replayAbortRef.current) {
      setAgentReaction('success');
      setCurrentActionText('Agent mission successfully executed.');
    }
    setIsReplaying(false);
  };

  const handleScrub = (idx: number) => {
    applyScrubIndex(idx);
  };

  const handleReplayStep = (stepOrAction: number) => {
    if (stepOrAction === -1 || stepOrAction === 0) {
      handleToggleReplay();
    } else {
      handleScrub(stepOrAction);
    }
  };

  const applyScrubIndex = (idx: number) => {
    replayAbortRef.current = true;
    setIsReplaying(false);

    const bounded = Math.max(0, Math.min(idx, allCompletedNodes.length - 1));
    setReplayStepIndex(bounded);

    const visibleNodes = allCompletedNodes.slice(0, bounded + 1);
    setLiveNodes(visibleNodes);

    const targetNode = allCompletedNodes[bounded];
    if (targetNode) {
      setActiveNodeId(targetNode.id);
      setLiveTickerText(`● Inspected ${targetNode.url || targetNode.label}`);
      setLiveTickerSubText(`${bounded + 1} of ${allCompletedNodes.length} steps`);
    }
    if (targetNode?.coord) {
      setAgentCoord(targetNode.coord);
      setAgentReaction(
        targetNode.isDeadEnd
          ? 'nope'
          : targetNode.status === 'fail'
          ? 'nope'
          : targetNode.status === 'warn'
          ? 'scanning'
          : 'nod'
      );
      if (targetNode.thought) setCurrentActionText(targetNode.thought);
    }

    // Filter lines connected between visible nodes
    const visibleLines = allCompletedLines.filter((l) =>
      visibleNodes.some((n) => n.id === l.fromId) && visibleNodes.some((n) => n.id === l.toId)
    );
    setLiveLines(visibleLines);

    // Update telemetry to this step
    const cumulativeTokens = visibleNodes.reduce((sum, n) => sum + n.tokens, 0);
    setLiveTelemetry({
      stepsCount: bounded + 1,
      durationSeconds: Number(((bounded + 1) * 0.9).toFixed(1)),
      tokensBurned: cumulativeTokens,
      costUsd: 0.00,
      reasoningStepsCount: 1,
    });
  };

  useEffect(() => {
    return () => {
      replayAbortRef.current = true;
    };
  }, []);

  // ─── Phase 1: Dedicated Mission Setup Screen ──────────────────────────────
  if (stage === 'setup') {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-6">
        <div className="bg-[#121214] border border-white/[0.08] rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
          {/* Header */}
          <div className="space-y-2 border-b border-white/[0.06] pb-5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#FF3300] flex items-center gap-1.5 bg-[#FF3300]/10 px-2.5 py-1 rounded-md border border-[#FF3300]/20">
                <Sparkles className="w-3.5 h-3.5" />
                <span>MISSION CONFIGURATION</span>
              </span>
              <span className="text-stone-500 font-mono text-xs">•</span>
              <span className="text-xs font-mono text-stone-400">
                E2B Isolated MicroVM Sandbox
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-mono font-bold text-white tracking-tight">
              Configure Autonomous Agent Flight
            </h1>
            <p className="text-xs sm:text-sm font-mono text-stone-400 max-w-2xl leading-relaxed">
              Launch an autonomous agent flight to trace real multi-step trajectory retrieval, BPE token consumption, and machine schema compliance on your platform.
            </p>
          </div>

          {/* Target URL Input */}
          <div className="space-y-2">
            <label className="text-xs font-mono uppercase text-stone-300 font-bold flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-[#FF3300]" />
              <span>1. Target Platform or Documentation URL</span>
            </label>
            <input
              type="text"
              value={target}
              onChange={(e) => handleTargetChange(e.target.value)}
              placeholder="https://stripe.com"
              className="w-full bg-[#18181B] border border-white/[0.1] focus:border-[#FF3300] rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none transition shadow-inner"
            />
          </div>

          {/* Harness Selector Cards */}
          <div className="space-y-3">
            <label className="text-xs font-mono uppercase text-stone-300 font-bold flex items-center gap-2">
              <Bot className="w-3.5 h-3.5 text-[#FF3300]" />
              <span>2. Select Autonomous Agent Harness</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
              {HARNESS_CHOICES.map((choice) => {
                const isSelected = harness === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => setHarness(choice.id)}
                    className={`flex flex-col items-start text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'bg-[#FF3300]/10 border-[#FF3300] ring-2 ring-[#FF3300]/50 shadow-[0_0_20px_rgba(255,51,0,0.25)]'
                        : 'bg-[#18181B] border-white/[0.06] hover:border-white/[0.18] hover:bg-white/[0.02]'
                    }`}
                  >
                    <div className="w-full flex items-center justify-between pb-3">
                      <img
                        src={choice.mascotImg}
                        alt={choice.name}
                        className="w-10 h-10 object-contain rounded"
                      />
                      <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-white/[0.06] text-stone-300 font-bold border border-white/[0.08]">
                        {choice.badge}
                      </span>
                    </div>
                    <div className="text-xs font-mono font-bold text-white">{choice.name}</div>
                    <div className="text-[10px] font-mono text-stone-400 line-clamp-3 pt-1.5 leading-snug">
                      {choice.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mission Intent & Benchmark Presets */}
          <div className="space-y-3">
            <label className="text-xs font-mono uppercase text-stone-300 font-bold flex items-center gap-2">
              <Compass className="w-3.5 h-3.5 text-[#FF3300]" />
              <span>3. Mission Intent Prompt</span>
            </label>
            <textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              rows={3}
              className="w-full bg-[#18181B] border border-white/[0.1] focus:border-[#FF3300] rounded-xl p-3.5 text-xs font-mono text-white focus:outline-none transition leading-relaxed shadow-inner"
            />
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-mono uppercase text-stone-500 font-semibold">
                One-Click Benchmark Presets:
              </span>
              <div className="flex flex-wrap gap-2">
                {PRESET_INTENTS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      const domain = target.replace(/^https?:\/\//i, '').replace(/\/$/, '');
                      setIntent(preset.replace('this platform', domain || 'this platform'));
                    }}
                    className="text-[11px] font-mono text-stone-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg px-3 py-1.5 transition cursor-pointer text-left"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Infrastructure Specs Bento */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="bg-black/40 border border-white/[0.05] rounded-xl p-3 text-xs font-mono space-y-1">
              <span className="text-[10px] uppercase text-stone-500 font-bold">Execution Sandbox</span>
              <div className="text-white font-bold flex items-center gap-1.5">
                <Cpu className="w-3 h-3 text-[#FF3300]" />
                <span>E2B MicroVM Container</span>
              </div>
            </div>
            <div className="bg-black/40 border border-white/[0.05] rounded-xl p-3 text-xs font-mono space-y-1">
              <span className="text-[10px] uppercase text-stone-500 font-bold">Autonomous Engine</span>
              <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Autonomous Mesh (Auto-Failover)</span>
              </div>
            </div>
            <div className="bg-black/40 border border-white/[0.05] rounded-xl p-3 text-xs font-mono space-y-1">
              <span className="text-[10px] uppercase text-stone-500 font-bold">Simulation Cost</span>
              <div className="text-white font-bold">$0.00 (Zero Token Fee)</div>
            </div>
          </div>

          {/* Large Primary Launch Button */}
          <div className="pt-4 border-t border-white/[0.06]">
            <button
              onClick={() => {
                setStage('flight');
                handleLaunchSimulation();
              }}
              disabled={isRunning || !target.trim()}
              className="w-full bg-[#FF3300] hover:bg-[#FF3300]/90 text-white font-mono text-sm font-bold uppercase tracking-wider py-4 rounded-xl transition active:scale-[0.98] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-3 shadow-[0_0_24px_rgba(255,51,0,0.4)]"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Launch Simulation Flight</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Phase 2: Live Flight Simulation Cockpit ──────────────────────────────
  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* ─── Main Experience: Journey Telemetry Header ───────────────────────── */}
      <JourneyTelemetryHeader
        target={target}
        intent={intent}
        harness={harness}
        status={status}
        telemetry={liveTelemetry || journeyResult?.telemetry}
        onRunNewJourney={() => {
          if (status === 'idle') {
            handleLaunchSimulation();
          } else {
            setIsConfigOpen(true);
          }
        }}
        onReconfigure={() => setStage('setup')}
        onRerunFlight={handleLaunchSimulation}
        isRunning={isRunning}
      />

      {/* ─── View Switcher Pill Bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-lg bg-[#121214] border border-white/[0.08]">
          <button
            onClick={() => setActiveView('tree')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono transition cursor-pointer ${
              activeView === 'tree'
                ? 'bg-white text-black font-bold shadow-xs'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>3D Procedural Canvas</span>
          </button>
          <button
            onClick={() => setActiveView('terminal')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono transition cursor-pointer ${
              activeView === 'terminal'
                ? 'bg-white text-black font-bold shadow-xs'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Live Terminal Stream</span>
          </button>
        </div>

        <div className="text-[11px] font-mono text-stone-500 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-stone-400 truncate max-w-sm">
            {currentActionText || (isRunning ? 'Autonomous Flight Active' : 'Mission Standby')}
          </span>
        </div>
      </div>

      {/* ─── Middle Section: Procedural Canvas or Terminal Feed ──────────────── */}
      {activeView === 'tree' ? (
        <ProceduralWorkflowCanvas
          harness={harness}
          nodes={liveNodes}
          lines={liveLines}
          allNodes={allCompletedNodes.length > 0 ? allCompletedNodes : liveNodes}
          activeNodeId={activeNodeId}
          agentCoord={agentCoord}
          agentReaction={agentReaction}
          currentActionText={currentActionText}
          tickerText={liveTickerText}
          tickerSubText={liveTickerSubText}
          isRunning={isRunning}
          onTogglePlay={handleToggleReplay}
          onScrub={handleScrub}
          onReplayStep={handleReplayStep}
          replaySpeed={replaySpeed}
          onReplaySpeedChange={setReplaySpeed}
          isReplaying={isReplaying}
          replayStepIndex={replayStepIndex}
          totalStepsCount={allCompletedNodes.length || liveNodes.length}
        />
      ) : (
        <LiveTerminalFeed logs={liveTerminalLogs.length > 0 ? liveTerminalLogs : journeyResult?.terminalLogs} />
      )}

      {/* ─── Bottom Section: 3 KPI Gauges (Displayed upon or during completion) */}
      {journeyResult?.kpis && (
        <JourneyKPICards kpis={journeyResult.kpis} />
      )}

      {/* ─── Footer Section: Executive INSIGHT & Step Breakdown ─────────────── */}
      {journeyResult?.insight && (
        <JourneyInsightSection insight={journeyResult.insight} />
      )}
    </div>
  );
}
