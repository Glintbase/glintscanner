/**
 * Core Types & Interfaces for the Glintbase Flight Simulator.
 * Implements trajectory telemetry, persona constraints, and counterfactual testing.
 */

export type PersonaType = 'claude-code' | 'cursor' | 'perplexity';
export type HarnessType = 'claude-code' | 'hermes' | 'openclaw' | 'opencode';
export type SimulationMode = 'deterministic' | 'live' | 'e2b';
export type StepStatus = 'pass' | 'warn' | 'fail' | 'skip';
export type TrajectoryOutcome = 'completed' | 'blocked' | 'hallucinated' | 'timed_out' | 'failed' | 'partial';
export type StepPhase = 'discovery' | 'ingestion' | 'auth' | 'execution' | 'recovery';

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
  tokens: number;
  latencyMs: number;
  httpStatus?: number;
  url?: string;
  thought?: string;
  rawSnippet?: string;
  coord?: CanvasCoord;
  reaction?: MascotReaction;
  isDeadEnd?: boolean;
  isDisconnectedSession?: boolean;
  backtrackToId?: string;
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
  | { type: 'telemetry_tick'; stepsCount: number; durationSeconds: number; tokensBurned: number; costUsd: number }
  | { type: 'terminal_log'; log: string }
  | { type: 'complete'; result: JourneyExecutionResult }
  | { type: 'error'; message: string };

export interface JourneyKPIMetrics {
  answerFromSite: number; // 0-100%
  answerEfficiency: number; // 0-100%
  followedSiteLinks: number; // 0-100%
}

export interface JourneyInsightRemediation {
  id: string;
  title: string;
  description: string;
  fixCommand: string;
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
  reasoningStepsCount: number;
  durationSeconds: number;
  costUsd: number;
  tokensBurned: number;
}

export interface JourneyExecutionResult {
  target: string;
  intent: string;
  harness: HarnessType;
  status: 'success' | 'failed';
  telemetry: JourneyTelemetryStats;
  nodes: JourneyPillNode[];
  lines?: ProceduralLine[];
  kpis: JourneyKPIMetrics;
  insight: JourneyInsight;
  terminalLogs: string[];
}

export interface SimulationOptions {
  target: string;
  agent?: PersonaType | HarnessType;
  harness?: HarnessType;
  mode?: SimulationMode;
  intent?: string;
  allowMutations?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
  json?: boolean;
  ci?: boolean;
}

export interface TrajectoryStep {
  stepIndex: number;
  phase: StepPhase;
  action: string;
  status: StepStatus;
  durationMs: number;
  tokensConsumed: number;
  details: string;
  evidence?: Record<string, any>;
  error?: {
    code: string;
    message: string;
    schemaPath?: string;
    expectedType?: string;
    receivedType?: string;
  };
}

export type IntentFailureMode =
  | 'INTENT_UNMATCHED_ENDPOINT'
  | 'AUTH_HANDSHAKE_MISSING'
  | 'MUTATION_SAFETY_MISSING'
  | 'RATE_LIMIT_VULNERABLE'
  | 'SCHEMA_TYPE_MISMATCH'
  | 'SOFT_404_TRAP'
  | 'NONE';

export interface SimulationTelemetry {
  outcome: TrajectoryOutcome;
  totalDurationMs: number;
  ttftcMs?: number; // Time-To-First-Tool-Call
  totalTokensBurned: number;
  dollarTaxUsd: number; // Cost at standard Tier-1 model rates ($3/M in, $15/M out)
  schemaFrictionScore: number; // 0 (flawless) to 100 (hostile)
  steps: TrajectoryStep[];
  failureBottleneck?: string;
  failureMode?: IntentFailureMode;
  failureDetails?: {
    code: IntentFailureMode;
    message: string;
    phase: StepPhase;
    expected: string;
    remediation: string;
    closestMatches?: string[];
  };
  suggestedRemediation?: {
    command: string;
    file: string;
    fixSnippet: string[];
    rationale: string;
  };
}

export interface CounterfactualComparison {
  before: SimulationTelemetry;
  after: SimulationTelemetry;
  tokensSavedPercent: number;
  latencySavedPercent: number;
  fixedBottlenecks: string[];
  resolved: boolean;
}

export interface MissionDefinition {
  id: string;
  name: string;
  goal: string;
  targetPhases: StepPhase[];
  intentPrompt?: string;
}

export interface TargetContext {
  targetUrl: string;
  isUrl: boolean;
  codebaseDir?: string;
  robotsTxt?: string;
  llmsTxt?: string;
  authMd?: string;
  ardJson?: any;
  mcpManifest?: any;
  mcpEndpoint?: string;
  mcpTools?: Array<{
    name: string;
    description: string;
    inputSchema?: any;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
  }>;
  openApiSpec?: any;
  hasCanaryLeak?: boolean;
  has404Handler?: boolean;
}
