/**
 * Glintbase Simulate replay decoder.
 * Decodes the #data= URL hash written by the hosted MCP `simulate_flight` tool into a
 * JourneyExecutionResult for the replay view. Only fields present in the payload are shown;
 * nothing is filled in with assumed statuses or scores.
 */

import type {
  AgentFileCheck,
  HarnessType,
  JourneyExecutionResult,
  JourneyIconType,
  JourneyPillNode,
  ProceduralLine,
} from './types';
import { TOKEN_BASIS } from './types';

export interface DecompressedFlightSession {
  v: number;
  timestamp: number;
  target: string;
  persona: string;
  intent?: string;
  telemetry: any;
}

/**
 * Decompresses base64url-deflated flight state from window.location.hash
 * Uses native Web standard DecompressionStream (Chrome 80+, Firefox 113+, Safari 16.4+, Node 18+).
 */
export async function decompressFlightHash(rawHash: string): Promise<DecompressedFlightSession | null> {
  try {
    const clean = (rawHash || '').replace(/^[#?]?data=/, '').trim();
    if (!clean) return null;

    let base64 = clean.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }

    let bytes: Uint8Array;
    if (typeof Buffer !== 'undefined') {
      bytes = Buffer.from(base64, 'base64');
    } else {
      const binaryStr = atob(base64);
      bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
    }

    if (typeof DecompressionStream !== 'undefined') {
      const stream = new Response(new Blob([bytes as any])).body!.pipeThrough(new DecompressionStream('deflate'));
      const decompressedBuffer = await new Response(stream).arrayBuffer();
      const text = new TextDecoder().decode(decompressedBuffer);
      return JSON.parse(text) as DecompressedFlightSession;
    }

    return null;
  } catch (err) {
    console.warn('Failed to decompress flight hash:', err);
    return null;
  }
}

const KNOWN_HARNESSES: HarnessType[] = ['claude-code', 'openclaw', 'hermes', 'opencode', 'cursor', 'perplexity'];

function iconFor(label: string, ok: boolean): JourneyIconType {
  const l = label.toLowerCase();
  if (!ok) return 'error';
  if (l === 'home' || l === 'index') return 'home';
  if (l.includes('llms')) return 'llms';
  if (l.includes('openapi') || l.includes('api spec')) return 'openapi';
  if (l.includes('auth')) return 'auth';
  if (l.includes('mcp')) return 'mcp';
  if (l.includes('api')) return 'api';
  return 'docs';
}

/**
 * Builds a replay view from a decoded session. v2 payloads carry measured statuses, sizes and
 * times. v1 payloads (older links) only carry labels and pass/fail, so statuses are left unknown.
 */
export function convertSessionToJourneyResult(session: DecompressedFlightSession): JourneyExecutionResult {
  const tel = session.telemetry || {};
  const steps: any[] = Array.isArray(tel.steps) ? tel.steps : [];
  const isV2 = (session.v || 1) >= 2;

  const nodes: JourneyPillNode[] = steps.map((step, idx) => {
    const ok = step.status === 'ok';
    const label = String(step.details || step.action || `step ${idx + 1}`);
    const httpStatus = typeof step.httpStatus === 'number' ? step.httpStatus : undefined;
    return {
      id: `step_${idx + 1}`,
      parentId: idx > 0 ? `step_${idx}` : undefined,
      label,
      iconType: iconFor(label, ok),
      status: ok ? 'pass' : step.status === 'warn' ? 'warn' : 'fail',
      row: 0,
      col: idx,
      tokens: typeof step.tokensConsumed === 'number' ? step.tokensConsumed : 0,
      latencyMs: typeof step.durationMs === 'number' ? step.durationMs : 0,
      httpStatus,
      bytes: typeof step.bytes === 'number' ? step.bytes : undefined,
      url: step.url,
      thought: step.note || (isV2 ? undefined : 'Older replay link: no measured status was saved for this step.'),
      coord: { x: 85 + idx * 145, y: 135 },
      isDeadEnd: !ok,
      decidedBy: 'standard_check',
    };
  });

  const lines: ProceduralLine[] = nodes.slice(1).map((n, i) => ({
    id: `line_${i + 1}`,
    fromId: nodes[i].id,
    toId: n.id,
    fromCoord: nodes[i].coord!,
    toCoord: n.coord!,
    status: n.status,
    lineType: n.status === 'pass' ? 'solid' : 'dead_end',
    isDrawn: true,
  }));

  const agentFileChecks: AgentFileCheck[] = nodes.slice(1).map((n) => ({
    path: '/' + n.label,
    url: n.url || '',
    httpStatus: n.httpStatus ?? 0,
    found: n.status === 'pass',
    bytes: n.bytes ?? 0,
    ms: n.latencyMs,
    note: n.thought || (n.status === 'pass' ? 'found' : 'not found'),
  }));

  const harnessName = (session.persona || 'claude-code').toLowerCase().replace(/\s+/g, '-') as HarnessType;
  const harness: HarnessType = KNOWN_HARNESSES.includes(harnessName) ? harnessName : 'claude-code';
  const reached = nodes.filter((n) => n.status === 'pass').length;
  const homepageOk = nodes[0]?.status === 'pass' || tel.outcome === 'completed';

  return {
    target: session.target,
    intent: session.intent || `Replay of a Glintbase preview for ${session.target}`,
    harness,
    status: homepageOk ? 'success' : 'failed',
    mode: 'preview',
    planner: 'none (preview: fixed checks only)',
    tokenBasis: TOKEN_BASIS,
    telemetry: {
      stepsCount: nodes.length,
      reasoningStepsCount: 0,
      durationSeconds: typeof tel.totalDurationMs === 'number' ? Number((tel.totalDurationMs / 1000).toFixed(1)) : 0,
      tokensBurned: nodes.reduce((s, n) => s + n.tokens, 0),
    },
    nodes,
    lines,
    kpis: {
      pagesReachedPct: nodes.length ? Math.round((reached / nodes.length) * 100) : 0,
      deadEnds: nodes.length - reached,
      agentFilesFound: typeof tel.agentFilesFound === 'number' ? tel.agentFilesFound : agentFileChecks.filter((c) => c.found).length,
      agentFilesChecked: typeof tel.agentFilesChecked === 'number' ? tel.agentFilesChecked : agentFileChecks.length,
    },
    agentFileChecks,
    insight: {
      summary:
        tel.summary ||
        (isV2 ? `Replay of a Glintbase preview for ${session.target}.` : `Older replay link for ${session.target}: it saved only step labels and pass/fail, not measured statuses.`),
      bulletPoints: nodes.map((n) => `${n.label}: ${n.httpStatus !== undefined ? (n.httpStatus > 0 ? `HTTP ${n.httpStatus}` : 'network error') : n.status}`),
      remediations: tel.suggestedRemediation
        ? [
            {
              id: 'rem_1',
              title: typeof tel.suggestedRemediation === 'string' ? tel.suggestedRemediation : 'Suggested fix',
              description: typeof tel.suggestedRemediation === 'string' ? '' : String(tel.suggestedRemediation?.description || ''),
            },
          ]
        : [],
    },
    terminalLogs: nodes.map((n, i) => `[step ${i + 1}] ${n.url || n.label} -> ${n.httpStatus !== undefined ? (n.httpStatus > 0 ? `HTTP ${n.httpStatus}` : 'network error') : n.status}`),
  };
}
