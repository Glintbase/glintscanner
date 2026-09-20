import { NextRequest } from 'next/server';
import { runArs3Probes } from '@/lib/scanner/v2/probes';
import { validateScanUrl } from '@/lib/scanner/v2/urlPolicy';
import { E2BRunner } from '@/lib/scanner/simulator/e2bRunner';
import { generateJourneyTreeSvg, svgToBase64 } from '@/lib/scanner/simulator/journeyTreeSvg';
import { deflateSync } from 'node:zlib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// In-memory active SSE session map
interface SseSession {
  controller: ReadableStreamDefaultController;
  createdAt: number;
}
const activeSessions = new Map<string, SseSession>();

// Cleanup stale sessions (>30 min)
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of activeSessions.entries()) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      try {
        session.controller.close();
      } catch {}
      activeSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

// Simple sliding window rate limiter (60 requests per minute per IP)
const ipRequestHistory = new Map<string, number[]>();
function checkRateLimit(ip: string, limit = 60, windowMs = 60 * 1000): boolean {
  const now = Date.now();
  const history = ipRequestHistory.get(ip) || [];
  const valid = history.filter(t => now - t < windowMs);
  valid.push(now);
  ipRequestHistory.set(ip, valid);
  return valid.length <= limit;
}

const BUNDLED_SKILLS: Record<string, { title: string; description: string; content: string }> = {
  'glintbase-agent-readiness': {
    title: 'Glintbase Agent Readiness Playbook',
    description: 'Master ARS 3.0 specification & remediation strategies',
    content: '# Glintbase Agent Readiness (ARS 3.0)\nAudit and elevate your codebase for AI agents.',
  },
  'living-artifacts-architect': {
    title: 'Living Artifacts Architect',
    description: 'How to author llms.txt, llms-full.txt, and ard.json',
    content: '# Living Artifacts Architecture\nDeclare machine entrypoints with llms.txt and ard.json.',
  },
  'agent-auth-handbook': {
    title: 'Agent Authentication Handbook',
    description: 'RFC 9728, WorkOS machine authentication, & auth.md',
    content: '# Agent Authentication Handbook\nMachine credentials, auth.md, and scoped API keys.',
  },
};

const TOOLS_MANIFEST = [
  {
    name: 'glintbase_audit',
    description: 'Execute full ARS 3.0 agent-readiness audit on a target URL. Evaluates Discovery, Access, Usability, Semantic, Architecture, and Safety.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Target URL to audit (e.g. "https://docs.example.com")' },
      },
      required: ['target'],
    },
  },
  {
    name: 'glintbase_get_score',
    description: 'Fetch ultra-compact ARS 3.0 score card (<200 tokens). Ideal for quick checks and CI status monitoring without burning agent context.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Target URL to evaluate' },
      },
      required: ['target'],
    },
  },
  {
    name: 'glintbase_simulate_flight',
    description: 'Run the Glintbase Agent Flight Simulator across synthetic coding personas. Returns multi-modal output with a visual Journey Tree graphic, telemetry, and replay link.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Target URL to simulate (e.g. "https://stripe.com")' },
        persona: { type: 'string', enum: ['claude-code', 'cursor', 'perplexity'], description: 'Agent persona (default: claude-code)' },
        intent: { type: 'string', description: 'User intent to simulate' },
      },
      required: ['target'],
    },
  },
  {
    name: 'glintbase_discover_surfaces',
    description: 'Discover machine-readable entrypoints (robots.txt, llms.txt, ard.json, auth.md, OpenAPI).',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Target URL' },
      },
      required: ['target'],
    },
  },
  {
    name: 'glintbase_get_skill',
    description: 'Retrieve full markdown skill playbook for agent readiness.',
    inputSchema: {
      type: 'object',
      properties: {
        skillName: { type: 'string', description: 'Skill name (e.g. "living-artifacts-architect")' },
      },
      required: ['skillName'],
    },
  },
];

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-MCP-Version, Accept',
    },
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const authHeader = req.headers.get('authorization') || '';
  const apiKeyParam = url.searchParams.get('key') || '';
  const hasAuth = Boolean(authHeader.startsWith('Bearer ') || apiKeyParam);

  if (!hasAuth && !checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 60 requests per minute.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const accept = req.headers.get('accept') || '';
  const isSse = accept.includes('text/event-stream') || url.searchParams.get('transport') === 'sse';

  if (!isSse) {
    // Return server description and connection instructions
    return new Response(
      JSON.stringify(
        {
          status: 'ok',
          server: 'glintbase-hosted-mcp',
          version: '3.0.0',
          protocol: '2024-11-05',
          description: 'Hosted Glintbase MCP Endpoint for AI Chat Apps (Claude Desktop, ChatGPT, Cursor)',
          endpoint: 'https://scan.glintbase.dev/api/mcp',
          supportedTools: TOOLS_MANIFEST.map(t => t.name),
          instructions: {
            claudeDesktop: {
              url: 'https://scan.glintbase.dev/api/mcp',
            },
            cursor: {
              url: 'https://scan.glintbase.dev/api/mcp',
            },
          },
        },
        null,
        2
      ),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      }
    );
  }

  // Handle SSE handshake
  const sessionId = crypto.randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      activeSessions.set(sessionId, { controller, createdAt: Date.now() });

      // Send initial endpoint event
      const endpointData = `/api/mcp?sessionId=${sessionId}`;
      controller.enqueue(encoder.encode(`event: endpoint\ndata: ${endpointData}\n\n`));

      // Keep-alive ping interval
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(pingInterval);
        }
      }, 20000);

      req.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        activeSessions.delete(sessionId);
      });
    },
    cancel() {
      activeSessions.delete(sessionId);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const authHeader = req.headers.get('authorization') || '';
  const apiKeyParam = url.searchParams.get('key') || '';
  const hasAuth = Boolean(authHeader.startsWith('Bearer ') || apiKeyParam);

  if (!hasAuth && !checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 60 requests per minute.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const sessionId = url.searchParams.get('sessionId') || body.sessionId;

  const id = body.id ?? null;
  const method = body.method;
  const params = body.params || {};

  let rpcResponse: any;

  if (method === 'initialize') {
    rpcResponse = {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          prompts: {},
          resources: {},
        },
        serverInfo: {
          name: 'glintbase',
          version: '3.0.0',
        },
      },
    };
  } else if (method === 'notifications/initialized') {
    return new Response(null, { status: 204 });
  } else if (method === 'tools/list') {
    rpcResponse = {
      jsonrpc: '2.0',
      id,
      result: {
        tools: TOOLS_MANIFEST,
      },
    };
  } else if (method === 'tools/call') {
    const toolName = params.name;
    const toolArgs = params.arguments || {};

    try {
      if (toolName === 'glintbase_get_score') {
        const rawTarget = toolArgs.target || 'https://stripe.com';
        const targetUrl = await E2BRunner.resolveTargetUrl(rawTarget);
        const scorecard = await runArs3Probes(targetUrl);

        const result = {
          target: targetUrl,
          score: scorecard.score,
          grade: scorecard.grade,
          archetype: scorecard.archetype.label,
          layers: Object.fromEntries(
            Object.values(scorecard.layers).map(l => [l.layer, `${l.totalEarned}/${l.baseMax}`])
          ),
        };

        rpcResponse = {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        };
      } else if (toolName === 'glintbase_audit') {
        const rawTarget = toolArgs.target || 'https://stripe.com';
        const targetUrl = await E2BRunner.resolveTargetUrl(rawTarget);
        const scorecard = await runArs3Probes(targetUrl);

        rpcResponse = {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(scorecard, null, 2) }],
          },
        };
      } else if (toolName === 'glintbase_simulate_flight') {
        const rawTarget = toolArgs.target || 'https://stripe.com';
        const targetUrl = await E2BRunner.resolveTargetUrl(rawTarget);
        const persona = toolArgs.persona || 'claude-code';
        const intent = toolArgs.intent || `Find the API docs and authenticate for ${targetUrl}`;

        // Run simulation probe
        const simResult = await E2BRunner.runMission(
          {
            target: targetUrl,
            harness: persona as any,
            agent: persona as any,
            intent,
            mode: 'deterministic',
          },
          () => {}
        );

        const telemetry = {
          outcome: simResult.status === 'success' ? 'completed' : 'blocked',
          totalDurationMs: (simResult.telemetry?.durationSeconds || 3) * 1000,
          totalTokensBurned: simResult.telemetry?.tokensBurned || 4200,
          schemaFrictionScore: Math.round(100 - (simResult.kpis?.answerEfficiency || 70)),
          steps: (simResult.nodes || []).map(n => ({
            action: (n as any).type || n.iconType || 'explore',
            details: n.label,
            status: n.status === 'pass' ? 'ok' : 'error',
            tokensConsumed: n.tokens,
          })),
          failureBottleneck: simResult.status === 'failed' ? simResult.insight?.summary : undefined,
          suggestedRemediation: simResult.insight?.remediations?.[0]?.description,
        };

        // Create compressed replay state (#data=...)
        const payload = {
          v: 1,
          timestamp: Date.now(),
          target: targetUrl,
          persona,
          telemetry,
        };
        const compressed = deflateSync(Buffer.from(JSON.stringify(payload), 'utf-8'), { level: 9 }).toString('base64url');
        const replayUrl = `https://scan.glintbase.dev/simulate#data=${compressed}`;

        const svg = generateJourneyTreeSvg(telemetry, persona, targetUrl, replayUrl);
        const svgBase64 = svgToBase64(svg);

        const summaryText = {
          persona,
          target: targetUrl,
          outcome: telemetry.outcome,
          success: telemetry.outcome === 'completed',
          totalHops: telemetry.steps.length,
          totalTokensBurned: telemetry.totalTokensBurned,
          schemaFrictionScore: telemetry.schemaFrictionScore,
          replayUrl,
          failureBottleneck: telemetry.failureBottleneck || null,
        };

        const markdownVisual = `### 🕹️ Glintbase Visual Flight Simulator (${persona})
**Target**: \`${targetUrl}\` | **Outcome**: **${telemetry.outcome.toUpperCase()}** | **Tokens**: ${telemetry.totalTokensBurned.toLocaleString()}

[🕹️ Open Full Interactive Cockpit Replay](${replayUrl})

\`\`\`xml
${svg}
\`\`\``;

        rpcResponse = {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              { type: 'text', text: JSON.stringify(summaryText, null, 2) },
              { type: 'image', data: svgBase64, mimeType: 'image/svg+xml' },
              { type: 'text', text: markdownVisual },
            ],
          },
        };
      } else if (toolName === 'glintbase_get_skill') {
        const skillName = toolArgs.skillName || 'glintbase-agent-readiness';
        const skill = BUNDLED_SKILLS[skillName] || BUNDLED_SKILLS['glintbase-agent-readiness'];

        rpcResponse = {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: skill.content }],
          },
        };
      } else {
        rpcResponse = {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Tool "${toolName}" not found` },
        };
      }
    } catch (err: any) {
      rpcResponse = {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true,
        },
      };
    }
  } else {
    rpcResponse = {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method "${method}" not found` },
    };
  }

  // If sessionId provided and active SSE stream exists, push the event
  if (sessionId && activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId)!;
    try {
      const encoder = new TextEncoder();
      session.controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(rpcResponse)}\n\n`));
    } catch {
      activeSessions.delete(sessionId);
    }
  }

  return new Response(JSON.stringify(rpcResponse), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
