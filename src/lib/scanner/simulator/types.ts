/**
 * Types for the Glintbase Simulate navigation probe.
 *
 * Every number in a JourneyExecutionResult comes from a real HTTP request made during the run,
 * except token figures, which are estimates (see TOKEN_BASIS) and are labelled as such.
 */

export type HarnessType = 'claude-code' | 'hermes' | 'openclaw' | 'opencode' | 'cursor' | 'perplexity';
export type SimulationMode = 'deterministic' | 'live' | 'e2b';

/** Where the run's requests were actually made. */
export type RunMode =
  /** Agent steps fetched from inside an E2B sandbox. */
  | 'e2b'
  /** Agent steps fetched by the Glintbase server (no sandbox). */
  | 'in_process'
  /** No agent: homepage plus the standard agent files only. */
  | 'preview';

/** How token figures are derived. They are never reported by a model. */
export const TOKEN_BASIS = 'Estimated: response bytes ÷ 4';

export const estimateTokensFromBytes = (bytes: number): number => Math.ceil(Math.max(0, bytes) / 4);

export type JourneyIconType =
  | 'home'
  | 'docs'
  | 'api'
  | 'llms'
  | 'auth'
  | 'mcp'
  | 'openapi'
  | 'canary'
  | 'error'
  | 'sparkles';

export interface CanvasCoord {
  x: number;
  y: number;
}

export type MascotReaction =
  | 'idle'
  | 'scanning'
  | 'nod'
  | 'nope'
  | 'backtrack'
  | 'thinking'
  | 'success'
  | 'friction';

export type LineTopologyType = 'solid' | 'dead_end' | 'disconnected' | 'bridged';

export interface JourneyPillNode {
  id: string;
  parentId?: string;
  label: string;
  iconType: JourneyIconType;
  status: 'pass' | 'warn' | 'fail';
  row: number;
  col: number;
  /** Estimated tokens of the response body (see TOKEN_BASIS). */
  tokens: number;
  /** Measured request time. */
  latencyMs: number;
  /** Measured HTTP status; 0 when the request failed at the network level. */
  httpStatus?: number;
  /** Measured response size in bytes. */
  bytes?: number;
  url?: string;
  thought?: string;
  rawSnippet?: string;
  coord?: CanvasCoord;
  reaction?: MascotReaction;
  isDeadEnd?: boolean;
  isDisconnectedSession?: boolean;
  backtrackToId?: string;
  /** Who chose this step: the LLM planner, the fixed fallback list, or a standard Glintbase check. */
  decidedBy?: 'llm' | 'fallback_list' | 'standard_check';
  remediation?: {
    title: string;
    description?: string;
    manualInstruction: string;
    fixCommand?: string;
  };
}

export interface ProceduralNode extends JourneyPillNode {
  orderIndex: number;
  connectedTo?: string[];
  isMaterialized?: boolean;
}

export interface ProceduralLine {
  id: string;
  fromId: string;
  toId: string;
  fromCoord: CanvasCoord;
  toCoord: CanvasCoord;
  status: 'pass' | 'warn' | 'fail';
  lineType?: LineTopologyType;
  isDrawn?: boolean;
}

export type ProceduralStreamEvent =
  | { type: 'init'; harness: HarnessType; target: string; intent: string; timestamp: number }
  | { type: 'agent_spawn'; harness: HarnessType; startCoord: CanvasCoord; timestamp: number }
  | { type: 'agent_navigate'; fromCoord: CanvasCoord; toCoord: CanvasCoord; targetNodeId: string; action: string; durationMs: number }
  | { type: 'agent_reaction'; reaction: MascotReaction; thought?: string; targetNodeId?: string }
  | { type: 'agent_nod'; targetNodeId: string; message?: string }
  | { type: 'agent_nope'; targetNodeId: string; message?: string }
  | { type: 'agent_backtrack'; fromNodeId: string; toNodeId: string; fromCoord: CanvasCoord; toCoord: CanvasCoord }
  | { type: 'agent_thinking'; atNodeId: string; thought: string }
  | { type: 'ticker_update'; text: string; subText?: string }
  | { type: 'node_materialized'; node: JourneyPillNode }
  | { type: 'line_connected'; line: ProceduralLine }
  | { type: 'telemetry_tick'; stepsCount: number; durationSeconds: number; tokensBurned: number; reasoningStepsCount: number }
  | { type: 'terminal_log'; log: string }
  | { type: 'complete'; result: JourneyExecutionResult }
  | { type: 'error'; message: string };

/** All measured from the run's own requests. */
export interface JourneyKPIMetrics {
  /** Share of requested pages that answered 2xx/3xx (0–100). */
  pagesReachedPct: number;
  /** Requested pages that answered 4xx/5xx or failed at the network level. */
  deadEnds: number;
  /** Standard agent files found (llms.txt, openapi.json, robots.txt, auth.md). */
  agentFilesFound: number;
  agentFilesChecked: number;
}

export interface JourneyInsightRemediation {
  id: string;
  title: string;
  description: string;
  /** Only set when the command really exists. */
  fixCommand?: string;
  manualInstruction?: string;
  targetFile?: string;
  diffSnippet?: string;
}

export interface JourneyInsight {
  summary: string;
  bulletPoints: string[];
  remediations: JourneyInsightRemediation[];
}

export interface JourneyTelemetryStats {
  stepsCount: number;
  /** Steps whose next page was chosen by an LLM (not the fallback list). */
  reasoningStepsCount: number;
  /** Measured wall time of the run. */
  durationSeconds: number;
  /** Estimated tokens of all fetched responses (see TOKEN_BASIS). */
  tokensBurned: number;
  /** Not measured by this probe; kept optional for old replay links. */
  costUsd?: number;
}

/** Result of one standard agent-file check made by Glintbase (not by the agent). */
export interface AgentFileCheck {
  path: string;
  url: string;
  httpStatus: number;
  found: boolean;
  bytes: number;
  ms: number;
  /** Plain-English reason, e.g. "found", "not found (HTTP 404)", "returned an HTML page". */
  note: string;
}

export interface JourneyExecutionResult {
  target: string;
  intent: string;
  harness: HarnessType;
  /** 'success' = the homepage answered and the run finished; it does NOT mean the intent was achieved. */
  status: 'success' | 'failed';
  mode: RunMode;
  /** What chose the next pages, e.g. "groq/compound-mini (groq)" or "fixed path list". */
  planner: string;
  tokenBasis: string;
  telemetry: JourneyTelemetryStats;
  nodes: JourneyPillNode[];
  lines?: ProceduralLine[];
  kpis: JourneyKPIMetrics;
  agentFileChecks: AgentFileCheck[];
  insight: JourneyInsight;
  terminalLogs: string[];
}

export interface SimulationOptions {
  target: string;
  agent?: HarnessType;
  harness?: HarnessType;
  mode?: SimulationMode;
  intent?: string;
  allowMutations?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
  json?: boolean;
  ci?: boolean;
}
