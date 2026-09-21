import { NextRequest } from 'next/server';
import { runArs3Probes } from '@/lib/scanner/v2/probes';
import { E2BRunner } from '@/lib/scanner/simulator/e2bRunner';
import { generateJourneyTreeSvg, svgToBase64 } from '@/lib/scanner/simulator/journeyTreeSvg';
import { deflateSync } from 'node:zlib';
import { BUNDLED_SKILLS, BundledSkill } from '@/lib/scanner/mcp/skills';

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

/**
 * Fuzzy skill resolver supporting aliases, prefixes, and partial matches
 */
function resolveSkill(nameOrQuery?: string): BundledSkill | undefined {
  if (!nameOrQuery) return BUNDLED_SKILLS['glintbase-agent-readiness'];
  const q = nameOrQuery.toLowerCase().trim().replace(/^skill:\/\/glintbase\//, '').replace(/^glintbase-/, '');

  if (BUNDLED_SKILLS[nameOrQuery]) return BUNDLED_SKILLS[nameOrQuery];
  if (BUNDLED_SKILLS[`glintbase-${q}`]) return BUNDLED_SKILLS[`glintbase-${q}`];
  if (BUNDLED_SKILLS[q]) return BUNDLED_SKILLS[q];

  for (const [key, skill] of Object.entries(BUNDLED_SKILLS)) {
    const k = key.toLowerCase();
    const t = skill.title.toLowerCase();
    if (k.includes(q) || q.includes(k) || t.includes(q) || skill.tags.some(tag => tag.includes(q))) {
      return skill;
    }
  }
  return undefined;
}

const TOOLS_MANIFEST = [
  {
    name: 'glintbase_audit',
    description: 'Execute full ARS 3.0 agent-readiness audit on a target URL. Evaluates Discovery, Access, Usability, Semantic, Architecture, and Safety across 119 discrete open protocol checks.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Target URL to audit (e.g. "https://docs.stripe.com")' },
      },
      required: ['target'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        score: { type: 'number' },
        grade: { type: 'string' },
        archetype: { type: 'object' },
        layers: { type: 'object' },
        passedChecks: { type: 'number' },
        totalChecks: { type: 'number' },
        remediations: { type: 'array' },
      },
      required: ['target', 'score', 'grade', 'layers'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
    },
  },
  {
    name: 'glintbase_get_score',
    description: 'Fetch ultra-compact ARS 3.0 score card (<200 tokens). Ideal for quick checks and CI status monitoring without burning agent context.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Target URL to evaluate (e.g. "https://docs.github.com")' },
      },
      required: ['target'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        score: { type: 'number' },
        grade: { type: 'string' },
        archetype: { type: 'string' },
        layers: { type: 'object' },
      },
      required: ['target', 'score', 'grade', 'layers'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
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
        intent: { type: 'string', description: 'User intent to simulate (e.g. "Find API reference and create an API key")' },
      },
      required: ['target'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        persona: { type: 'string' },
        target: { type: 'string' },
        outcome: { type: 'string', enum: ['completed', 'blocked'] },
        success: { type: 'boolean' },
        totalHops: { type: 'number' },
        totalTokensBurned: { type: 'number' },
        schemaFrictionScore: { type: 'number' },
        replayUrl: { type: 'string' },
        failureBottleneck: { type: 'string' },
      },
      required: ['target', 'outcome', 'success', 'totalTokensBurned', 'replayUrl'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
    },
  },
  {
    name: 'glintbase_discover_surfaces',
    description: 'Discover machine-readable entrypoints (robots.txt, llms.txt, ard.json, auth.md, OpenAPI, sitemap). Probes availability, syntax, and compliance.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Target URL to inspect (e.g. "https://docs.stripe.com")' },
      },
      required: ['target'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        discoveredSurfacesCount: { type: 'number' },
        totalSurfaceTypes: { type: 'number' },
        surfaces: { type: 'object' },
        summary: { type: 'string' },
      },
      required: ['target', 'surfaces', 'discoveredSurfacesCount'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
    },
  },
  {
    name: 'glintbase_get_skill',
    description: 'Retrieve full markdown skill playbook for agent readiness (e.g. "agent-readiness", "living-artifacts-architect", "agent-auth-handbook", "mcp-server-hardening").',
    inputSchema: {
      type: 'object',
      properties: {
        skillName: { type: 'string', description: 'Skill name or query (e.g. "agent-readiness", "living-artifacts", "auth", "mcp")' },
      },
      required: ['skillName'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        skill: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        uri: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['skill', 'title', 'content'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
    },
  },
];

const PROMPTS_MANIFEST = Object.values(BUNDLED_SKILLS).map(skill => ({
  name: `optimize_${skill.name.replace(/^glintbase-/, '')}`,
  description: skill.description,
  arguments: [
    {
      name: 'target',
      description: 'Target URL or codebase repository to optimize',
      required: false,
    },
    {
      name: 'notes',
      description: 'Specific context, framework (e.g. Next.js, FastAPI), or constraints',
      required: false,
    },
  ],
}));

const RESOURCES_MANIFEST = [
  ...Object.values(BUNDLED_SKILLS).map(skill => ({
    uri: skill.uri,
    name: skill.title,
    description: skill.description,
    mimeType: 'text/markdown',
  })),
  {
    uri: 'glintbase://schemas/ars3-spec',
    name: 'ARS 3.0 Check Registry Specification',
    description: '119 discrete open protocol checks across 6 layers (Discovery, Access, Usability, Semantic, Architecture, Safety)',
    mimeType: 'application/json',
  },
  {
    uri: 'glintbase://standards/auth-contract',
    name: 'RFC 9728 Machine Auth Contract Template',
    description: 'WorkOS machine-to-machine authentication template for auth.md',
    mimeType: 'text/markdown',
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
          description: 'Hosted Glintbase MCP Endpoint for AI Agents (Claude Desktop, Cursor, Windsurf, ChatGPT)',
          endpoint: 'https://scan.glintbase.dev/api/mcp',
          supportedTools: TOOLS_MANIFEST.map(t => t.name),
          supportedPrompts: PROMPTS_MANIFEST.map(p => p.name),
          supportedResources: RESOURCES_MANIFEST.map(r => r.uri),
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
          tools: { listChanged: false },
          prompts: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
          logging: {},
        },
        serverInfo: {
          name: 'glintbase',
          version: '3.0.0',
        },
      },
    };
  } else if (method === 'notifications/initialized') {
    return new Response(null, { status: 204 });
  } else if (method === 'ping') {
    rpcResponse = {
      jsonrpc: '2.0',
      id,
      result: {},
    };
  } else if (method === 'logging/setLevel') {
    rpcResponse = {
      jsonrpc: '2.0',
      id,
      result: {},
    };
  } else if (method === 'prompts/list') {
    rpcResponse = {
      jsonrpc: '2.0',
      id,
      result: {
        prompts: PROMPTS_MANIFEST,
      },
    };
  } else if (method === 'prompts/get') {
    const promptName = params.name || '';
    const cleanName = promptName.replace(/^optimize_/, '').toLowerCase();
    const skill = resolveSkill(cleanName);

    if (skill) {
      const target = params.arguments?.target || 'the target codebase or API';
      const notes = params.arguments?.notes || '';
      rpcResponse = {
        jsonrpc: '2.0',
        id,
        result: {
          description: skill.description,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `You are executing the Glintbase ARS 3.0 Playbook: **${skill.title}**.\n\nTarget: ${target}\n${notes ? `Notes: ${notes}\n` : ''}\n## Playbook Reference Manual\n\n${skill.content}`,
              },
            },
          ],
        },
      };
    } else {
      rpcResponse = {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `Prompt "${promptName}" not found` },
      };
    }
  } else if (method === 'resources/list') {
    rpcResponse = {
      jsonrpc: '2.0',
      id,
      result: {
        resources: RESOURCES_MANIFEST,
      },
    };
  } else if (method === 'resources/templates/list') {
    rpcResponse = {
      jsonrpc: '2.0',
      id,
      result: {
        resourceTemplates: [],
      },
    };
  } else if (method === 'resources/read') {
    const uri = params.uri || '';
    const matchedSkill = Object.values(BUNDLED_SKILLS).find(
      s => s.uri === uri || uri.endsWith(s.name) || uri.includes(s.name.replace('glintbase-', ''))
    );

    if (matchedSkill) {
      rpcResponse = {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text: matchedSkill.content,
            },
          ],
        },
      };
    } else if (uri === 'glintbase://schemas/ars3-spec') {
      rpcResponse = {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  specification: 'ARS 3.0',
                  version: '3.0.0',
                  totalChecks: 119,
                  pillars: ['discovery', 'access', 'usability', 'semantic', 'architecture', 'safety'],
                },
                null,
                2
              ),
            },
          ],
        },
      };
    } else if (uri === 'glintbase://standards/auth-contract') {
      const authSkill = BUNDLED_SKILLS['agent-auth-handbook'];
      rpcResponse = {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text: authSkill?.content || '# Machine Auth Contract\nRefer to RFC 9728 & auth.md',
            },
          ],
        },
      };
    } else {
      rpcResponse = {
        jsonrpc: '2.0',
        id,
        error: { code: -32002, message: `Resource "${uri}" not found` },
      };
    }
  } else if (method === 'tools/list') {
    rpcResponse = {
      jsonrpc: '2.0',
      id,
      result: {
        tools: TOOLS_MANIFEST,
      },
    };
  } else if (method === 'tools/call') {
    const rawToolName = params.name || '';
    const normalizedName = rawToolName.replace(/^glintbase_/, '').toLowerCase();
    const toolArgs = params.arguments || {};

    try {
      if (normalizedName === 'get_score') {
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
      } else if (normalizedName === 'audit') {
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
      } else if (normalizedName === 'simulate_flight') {
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
      } else if (normalizedName === 'discover_surfaces') {
        const rawTarget = toolArgs.target || 'https://stripe.com';
        const targetUrl = await E2BRunner.resolveTargetUrl(rawTarget);
        const scorecard = await runArs3Probes(targetUrl);

        const discoveryChecks = scorecard.layers.discovery?.checks || [];
        const usabilityChecks = scorecard.layers.usability?.checks || [];
        const accessChecks = scorecard.layers.access?.checks || [];
        const paymentChecks = scorecard.layers.payments?.checks || [];
        const allChecks = [...discoveryChecks, ...usabilityChecks, ...accessChecks, ...paymentChecks];

        const findCheck = (checks: any[], idPrefix: string) =>
          checks.find(c => (c.checkId || c.id || '').toLowerCase().includes(idPrefix.toLowerCase()) || (c.name || '').toLowerCase().includes(idPrefix.toLowerCase()));

        const robotsCheck = findCheck(discoveryChecks, 'robots');
        const ardCheck = findCheck(discoveryChecks, 'ard');
        const aiCatalogCheck = findCheck(discoveryChecks, 'ai-catalog') || findCheck(discoveryChecks, 'catalog');
        const mcpCheck = findCheck(discoveryChecks, 'mcp') || findCheck(discoveryChecks, 'registry-branding');
        const sitemapCheck = findCheck(discoveryChecks, 'sitemap');
        const llmsCheck = findCheck(usabilityChecks, 'llms-txt') || findCheck(usabilityChecks, 'llms');
        const llmsFullCheck = findCheck(usabilityChecks, 'llms-full');
        const authCheck = findCheck(accessChecks, 'auth') || findCheck(usabilityChecks, 'auth');
        const openapiCheck = findCheck(allChecks, 'openapi') || findCheck(allChecks, 'swagger') || findCheck(allChecks, 'spec');

        const surfaces = {
          robots: {
            found: Boolean(robotsCheck && robotsCheck.status !== 'fail'),
            status: robotsCheck?.status || 'untested',
            evidence: robotsCheck?.message || (robotsCheck?.evidence ? JSON.stringify(robotsCheck.evidence) : 'No robots.txt detected'),
          },
          llmsTxt: {
            found: Boolean(llmsCheck && llmsCheck.status !== 'fail'),
            status: llmsCheck?.status || 'untested',
            evidence: llmsCheck?.message || 'No /llms.txt entrypoint detected',
          },
          llmsFullTxt: {
            found: Boolean(llmsFullCheck && llmsFullCheck.status !== 'fail'),
            status: llmsFullCheck?.status || 'untested',
            evidence: llmsFullCheck?.message || 'No /llms-full.txt detected',
          },
          ardCatalog: {
            found: Boolean(ardCheck && ardCheck.status !== 'fail'),
            status: ardCheck?.status || 'untested',
            evidence: ardCheck?.message || 'No /.well-known/ard.json detected',
          },
          aiCatalog: {
            found: Boolean(aiCatalogCheck && aiCatalogCheck.status !== 'fail'),
            status: aiCatalogCheck?.status || 'untested',
            evidence: aiCatalogCheck?.message || 'No /.well-known/ai-catalog.json detected',
          },
          mcpManifest: {
            found: Boolean(mcpCheck && mcpCheck.status !== 'fail'),
            status: mcpCheck?.status || 'untested',
            evidence: mcpCheck?.message || 'No /.well-known/mcp/manifest.json detected',
          },
          authContract: {
            found: Boolean(authCheck && authCheck.status !== 'fail'),
            status: authCheck?.status || 'untested',
            evidence: authCheck?.message || 'No /auth.md or RFC 9728 endpoint detected',
          },
          openapiSpec: {
            found: Boolean(openapiCheck && openapiCheck.status !== 'fail'),
            status: openapiCheck?.status || 'untested',
            evidence: openapiCheck?.message || 'No OpenAPI / Swagger specification detected',
          },
          sitemap: {
            found: Boolean(sitemapCheck && sitemapCheck.status !== 'fail'),
            status: sitemapCheck?.status || 'untested',
            evidence: sitemapCheck?.message || 'No sitemap.xml detected',
          },
        };

        const discoveredCount = Object.values(surfaces).filter(s => s.found).length;

        const responseData = {
          target: targetUrl,
          discoveredSurfacesCount: discoveredCount,
          totalSurfaceTypes: Object.keys(surfaces).length,
          surfaces,
          summary: `Discovered ${discoveredCount}/${Object.keys(surfaces).length} machine entrypoint surfaces for ${targetUrl}.`,
        };

        rpcResponse = {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(responseData, null, 2) }],
          },
        };
      } else if (normalizedName === 'get_skill') {
        const skillQuery = toolArgs.skillName || toolArgs.skill || 'agent-readiness';
        const skill = resolveSkill(skillQuery);

        if (skill) {
          rpcResponse = {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: skill.content }],
            },
          };
        } else {
          const available = Object.values(BUNDLED_SKILLS)
            .map(s => `- **${s.name}**: ${s.description} (uri: ${s.uri})`)
            .join('\n');
          rpcResponse = {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Skill "${skillQuery}" not found. Available ARS 3.0 playbooks:\n\n${available}\n\nCall get_skill with any of the skill names above.`,
                },
              ],
              isError: true,
            },
          };
        }
      } else {
        rpcResponse = {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Tool "${rawToolName}" not found` },
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
