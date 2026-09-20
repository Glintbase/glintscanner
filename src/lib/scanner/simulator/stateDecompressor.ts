/**
 * Glintbase Simulator State Decompressor
 * Client-side and server-side utility to decode and decompress
 * #data= URL hashes into full JourneyExecutionResult telemetry.
 */

export interface DecompressedFlightSession {
  v: number;
  timestamp: number;
  target: string;
  persona: string;
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

    // Convert URL-safe base64 to standard base64
    let base64 = clean.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }

    // Decode base64 to binary byte array
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

    // Decompress using Web Streams DecompressionStream('deflate') (Supported in modern browsers and Node 18+)
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

import type {
  JourneyExecutionResult,
  JourneyPillNode,
  ProceduralLine,
  HarnessType,
  JourneyIconType,
} from './types';

/**
 * Transforms decompressed MCP flight telemetry into complete JourneyExecutionResult
 * with visual canvas coordinates, lines, and KPI metrics.
 */
export function convertSessionToJourneyResult(session: DecompressedFlightSession): JourneyExecutionResult {
  const tel = session.telemetry || {};
  const steps: any[] = tel.steps || [];
  const isSuccess = tel.outcome === 'completed';

  const nodes: JourneyPillNode[] = steps.map((step, idx) => {
    const isStepSuccess = step.status === 'ok';
    const isAuth = step.action?.toLowerCase().includes('auth') || step.details?.toLowerCase().includes('auth');
    const statusType = isStepSuccess ? 'pass' : isAuth ? 'fail' : 'warn';

    const actionLower = (step.action || '').toLowerCase();
    const iconType: JourneyIconType = actionLower.includes('auth')
      ? 'auth'
      : actionLower.includes('mcp')
      ? 'mcp'
      : actionLower.includes('llm')
      ? 'llms'
      : actionLower.includes('doc')
      ? 'docs'
      : actionLower.includes('api') || actionLower.includes('call')
      ? 'api'
      : isStepSuccess
      ? 'sparkles'
      : 'error';

    return {
      id: `step_${idx + 1}`,
      label: step.details || step.action || `Step ${idx + 1}`,
      iconType,
      status: statusType,
      row: Math.floor(idx / 4),
      col: idx % 4,
      tokens: step.tokensConsumed || Math.round((tel.totalTokensBurned || 1000) / Math.max(1, steps.length)),
      latencyMs: step.durationMs || 120,
      httpStatus: isStepSuccess ? 200 : isAuth ? 401 : 404,
      thought: step.details,
      coord: {
        x: 80 + (idx * 160) % 640,
        y: 100 + Math.floor(idx / 4) * 120,
      },
      reaction: isStepSuccess ? 'nod' : 'nope',
    };
  });

  const lines: ProceduralLine[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    lines.push({
      id: `line_${i + 1}`,
      fromId: nodes[i].id,
      toId: nodes[i + 1].id,
      fromCoord: nodes[i].coord || { x: 80, y: 100 },
      toCoord: nodes[i + 1].coord || { x: 240, y: 100 },
      status: nodes[i + 1].status,
      isDrawn: true,
    });
  }

  const friction = tel.schemaFrictionScore ?? 30;
  const answerEfficiency = Math.max(10, Math.min(100, Math.round(100 - friction)));
  const followedLinks = isSuccess ? 92 : 45;

  const harnessName = (session.persona || 'claude-code').toLowerCase().replace(/\s+/g, '-');
  const validHarness: HarnessType = ['claude-code', 'openclaw', 'hermes', 'opencode'].includes(harnessName)
    ? (harnessName as HarnessType)
    : 'claude-code';

  return {
    target: session.target,
    intent: `Replaying MCP flight simulation for ${session.target}`,
    harness: validHarness,
    status: isSuccess ? 'success' : 'failed',
    telemetry: {
      stepsCount: steps.length,
      reasoningStepsCount: Math.ceil(steps.length * 1.5),
      durationSeconds: Math.round((tel.totalDurationMs || 3500) / 1000),
      costUsd: tel.dollarTaxUsd || 0.012,
      tokensBurned: tel.totalTokensBurned || 4200,
    },
    nodes,
    lines,
    kpis: {
      answerFromSite: isSuccess ? 95 : 30,
      answerEfficiency,
      followedSiteLinks: followedLinks,
    },
    insight: {
      summary: isSuccess
        ? 'Agent achieved mission goal autonomously with zero-friction traversal.'
        : `Agent halted at ${tel.failureBottleneck || tel.failureMode || 'unauthenticated or soft-404 boundary'}.`,
      bulletPoints: [
        `Tokens Burned: ${(tel.totalTokensBurned || 0).toLocaleString()} tokens across ${steps.length} hops.`,
        `Schema Friction: ${friction}/100 (${friction > 50 ? 'High' : friction > 25 ? 'Moderate' : 'Low'} hallucination risk).`,
        ...(tel.suggestedRemediation ? [typeof tel.suggestedRemediation === 'object' ? tel.suggestedRemediation.description : tel.suggestedRemediation] : []),
      ],
      remediations: tel.suggestedRemediation
        ? [
            {
              id: 'rem_1',
              title: typeof tel.suggestedRemediation === 'object' ? tel.suggestedRemediation.command : 'Agent Readiness Fix',
              description: typeof tel.suggestedRemediation === 'object' ? tel.suggestedRemediation.description : String(tel.suggestedRemediation),
              fixCommand: typeof tel.suggestedRemediation === 'object' ? tel.suggestedRemediation.command : 'npx glintbase audit --fix',
            },
          ]
        : [],
    },
    terminalLogs: steps.map((s, i) => `[Hop ${i + 1}] ${s.action?.toUpperCase()}: ${s.details} (${s.status})`),
  };
}
