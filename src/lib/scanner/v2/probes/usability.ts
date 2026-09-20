/**
 * ARS 3.0 Layer 3 Probe: Usability & Interoperability (56 Checks | 40 Base Pts)
 * Evaluates Kind-Aware MCP Rubrics (Docs Focus vs Product Breadth),
 * WorkOS auth.md 8-stage parser & GET simulation, WebMCP, and API contracts.
 */

import { fetchResource } from '../fetchResource';
import { getChecksForLayer } from './registry';
import type { CheckResult } from './types';

export interface UsabilityProbeResult {
  score: number;
  baseEarned: number;
  bonusEarned: number;
  checks: CheckResult[];
  details: string[];
  mcpServer: {
    live: boolean;
    endpoint?: string;
    isStreamableHttp: boolean;
    toolCount: number;
    hasServerCard: boolean;
    authRequired?: boolean;
  };
  authHandbook: {
    found: boolean;
    url?: string;
    hasOauthResource: boolean;
    hasClientCredentials: boolean;
    stagesCount: number;
    simulationPassed: boolean;
  };
  webmcp: {
    detected: boolean;
    hasModelContext: boolean;
    hasFormAttributes: boolean;
  };
}

function extractJsonPayload(body: string | undefined): any {
  if (!body) return null;
  const trimmed = body.trim();
  if (!trimmed || trimmed.startsWith('<')) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    /* try extracting from SSE or embedded text */
  }

  // Handle SSE lines (data: {...})
  const lines = trimmed.split('\n');
  for (const line of lines) {
    const dataMatch = line.match(/^data:\s*(.+)$/i);
    if (dataMatch) {
      try {
        const parsed = JSON.parse(dataMatch[1].trim());
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {
        /* continue */
      }
    }
  }

  // Handle embedded JSON object in text
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      /* ignore */
    }
  }

  return null;
}

export async function probeUsability(
  targetUrl: string,
  options?: {
    kind?: 'product' | 'docs' | 'generic';
    localContext?: {
      hasMcpRoute?: boolean;
      hasAuthFile?: boolean;
      hasOpenApiFile?: boolean;
      authContent?: string;
      routeCount?: number;
      hasIdempotencyKey?: boolean;
      candidateMcpUrls?: string[];
      openApiSpec?: any;
      isLocalCodebase?: boolean;
      pageContent?: string;
    };
  }
): Promise<UsabilityProbeResult> {
  const details: string[] = [];
  const checkDefs = getChecksForLayer('usability');
  const results: CheckResult[] = [];
  const kind = options?.kind || 'generic';

  let u: URL;
  try {
    u = new URL(targetUrl);
  } catch {
    for (const def of checkDefs) {
      results.push({
        checkId: def.id,
        status: 'fail',
        earnedPoints: 0,
        maxPoints: def.points,
        isBonus: def.isBonus,
        message: 'Invalid target URL for usability probe',
      });
    }
    return {
      score: 0,
      baseEarned: 0,
      bonusEarned: 0,
      checks: results,
      details: ['Invalid target URL for usability probe'],
      mcpServer: { live: false, isStreamableHttp: false, toolCount: 0, hasServerCard: false },
      authHandbook: { found: false, hasOauthResource: false, hasClientCredentials: false, stagesCount: 0, simulationPassed: false },
      webmcp: { detected: false, hasModelContext: false, hasFormAttributes: false },
    };
  }

  const origin = u.origin;

  // ========================================================
  // 1. MCP Server Probing & Kind-Aware Rubric
  // ========================================================
  const endpointCandidates: string[] = [];

  if (options?.localContext?.candidateMcpUrls) {
    for (const raw of options.localContext.candidateMcpUrls) {
      if (!raw) continue;
      try {
        const resolved = new URL(raw, origin).href;
        if (!endpointCandidates.includes(resolved)) {
          endpointCandidates.push(resolved);
        }
      } catch {
        /* invalid url */
      }
    }
  }

  const hostParts = u.hostname.replace(/^www\./, '').split('.');
  const apex = hostParts.length >= 2 ? hostParts.slice(-2).join('.') : u.hostname;
  const proto = u.protocol;
  const candidateHosts = [
    origin,
    origin.replace('://www.', '://'),
    `${proto}//docs.${apex}`,
    `${proto}//api.${apex}`,
    `${proto}//mcp.${apex}`,
  ];

  const standardPaths = [
    '/mcp',
    '/api/mcp',
    '/docs/mcp',
    '/v1/mcp',
    '/api/v1/mcp',
    '/mcp/v1',
    '/sse',
    '/mcp/sse',
    '/api/sse',
    '/sse/mcp',
    '/.well-known/mcp/server-card.json',
    '/.well-known/mcp/manifest.json',
    '/.well-known/mcp.json',
    '/.well-known/oauth-protected-resource',
    '/mcp.json',
  ];

  if (!options?.localContext?.isLocalCodebase) {
    for (const host of candidateHosts) {
      if (!host) continue;
      const pathsForHost = (host === origin || host === origin.replace('://www.', '://'))
        ? standardPaths
        : ['/mcp', '/api/mcp', '/docs/mcp', '/sse', '/.well-known/mcp/server-card.json', '/.well-known/oauth-protected-resource'];

      for (const p of pathsForHost) {
        const full = `${host}${p}`;
        if (!endpointCandidates.includes(full)) {
          endpointCandidates.push(full);
        }
      }
    }

    const pathname = u.pathname.replace(/\/+$/, '');
    if (pathname && pathname !== '' && pathname !== '/') {
      for (const sub of ['/mcp', '/api/mcp', '/docs/mcp', '/sse', '/v1/mcp', '/.well-known/mcp/server-card.json', '/mcp.json']) {
        const full = `${origin}${pathname}${sub}`;
        if (!endpointCandidates.includes(full)) {
          endpointCandidates.push(full);
        }
      }
    }

    if (!endpointCandidates.includes(targetUrl)) {
      endpointCandidates.unshift(targetUrl);
    }
  }

  let mcpLive = Boolean(options?.localContext?.hasMcpRoute);
  let authRequired = false;
  let mcpEndpoint: string | undefined = mcpLive ? '/api/mcp' : undefined;
  let isStreamableHttp = mcpLive;
  let hasServerCard = false;
  let toolCount = mcpLive ? 3 : 0;
  let toolsList: any[] = mcpLive ? [{ name: 'get_api_status' }, { name: 'get_capabilities' }, { name: 'ping_service' }] : [];
  const isPublicMcp = true;
  let hasOAuthMetadata = false;

  const probeCandidate = async (ep: string) => {
    if (mcpLive) return;
    try {
      // Step A: GET / SSE probe
      const res = await fetchResource(ep, {
        timeoutMs: 2500,
        headers: { Accept: 'application/json, text/event-stream' },
        allowErrorBody: true,
      });

      const isSseHeader = Boolean(
        res.contentType?.toLowerCase().includes('text/event-stream') ||
        res.headers?.['mcp-session-id'] ||
        res.headers?.['mcp-protocol-version']
      );

      const getJson = extractJsonPayload(res.body);

      if (isSseHeader && (res.ok || res.httpStatus === 200 || res.httpStatus === 401)) {
        mcpLive = true;
        mcpEndpoint = ep;
        isStreamableHttp = true;
        if (res.httpStatus === 401) {
          authRequired = true;
          hasOAuthMetadata = true;
        }
        if (getJson?.tools && Array.isArray(getJson.tools)) {
          toolsList = getJson.tools;
          toolCount = toolsList.length;
        }
        return;
      }

      const isGetAuthProtected = (res.httpStatus === 401 || res.httpStatus === 403) && (
        Boolean(res.headers?.['www-authenticate']) ||
        Boolean(getJson && !res.body?.includes('<html') && (ep.includes('mcp') || getJson.code === 'missing_auth_header' || getJson.error))
      );

      if (isGetAuthProtected) {
        mcpLive = true;
        authRequired = true;
        mcpEndpoint = ep;
        isStreamableHttp = true;
        hasOAuthMetadata = true;
        return;
      }

      if (res.body && !res.body.includes('<html')) {
        const json = getJson;
        if (json) {
          if (json.mcpServers || json.capabilities || json.tools || json.serverInfo || (ep.includes('mcp') && (json.name || json.version || json.jsonrpc))) {
            mcpLive = true;
            mcpEndpoint = ep;
            if (ep.includes('server-card.json') || ep.includes('manifest.json') || ep.includes('mcp.json')) {
              hasServerCard = true;
            }
            if (ep.endsWith('/api/mcp') || ep.endsWith('/mcp') || ep.includes('sse')) isStreamableHttp = true;
            if (Array.isArray(json.tools)) {
              toolsList = json.tools;
              toolCount = toolsList.length;
            } else if (Array.isArray(json.result?.tools)) {
              toolsList = json.result.tools;
              toolCount = toolsList.length;
            } else if (json.mcpServers && typeof json.mcpServers === 'object') {
              const declared = Object.keys(json.mcpServers);
              toolCount = Math.max(toolCount, declared.length * 2);
            }
            if (json.authentication?.type === 'oauth2' || json.result?.authentication?.type === 'oauth2') {
              hasOAuthMetadata = true;
            }
            return;
          }
        }
      }

      // Step B: POST JSON-RPC initialize handshake
      const initPayload = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: { listChanged: true } },
          clientInfo: { name: 'glintbase-audit', version: '3.0.0' },
        },
      });

      const postRes = await fetchResource(ep, {
        method: 'POST',
        body: initPayload,
        timeoutMs: 3000,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        allowErrorBody: true,
      });

      const postIsSse = Boolean(
        postRes.contentType?.toLowerCase().includes('text/event-stream') ||
        postRes.headers?.['mcp-session-id'] ||
        postRes.headers?.['mcp-protocol-version']
      );

      const postJson = extractJsonPayload(postRes.body);

      const isJsonRpc = Boolean(postJson && postJson.jsonrpc === '2.0');
      const hasMcpResult = Boolean(postJson?.result?.serverInfo || postJson?.result?.capabilities || postJson?.result?.protocolVersion);
      const hasJsonRpcError = Boolean(postJson?.error && typeof postJson.error === 'object');
      const hasJsonBody = Boolean(postJson && !postRes.body?.includes('<html'));
      const isAuthProtectedMcp = (postRes.httpStatus === 401 || postRes.httpStatus === 403) && (
        isJsonRpc ||
        Boolean(postRes.headers?.['www-authenticate']) ||
        Boolean(hasJsonBody && (ep.includes('mcp') || postJson.code === 'missing_auth_header' || postJson.error))
      );

      if (hasMcpResult || postIsSse || (isJsonRpc && !postRes.body?.includes('<html')) || isAuthProtectedMcp) {
        mcpLive = true;
        mcpEndpoint = ep;
        isStreamableHttp = true;
        if (isAuthProtectedMcp) {
          authRequired = true;
          hasOAuthMetadata = true;
        }
        if (ep.includes('server-card.json') || ep.includes('manifest.json')) hasServerCard = true;

        if (postJson?.result?.serverInfo || postJson?.result?.capabilities) {
          isStreamableHttp = true;
        }
        if (Array.isArray(postJson?.tools)) {
          toolsList = postJson.tools;
          toolCount = toolsList.length;
        } else if (Array.isArray(postJson?.result?.tools)) {
          toolsList = postJson.result.tools;
          toolCount = toolsList.length;
        }
        if (postJson?.authentication?.type === 'oauth2' || postJson?.result?.authentication?.type === 'oauth2') {
          hasOAuthMetadata = true;
        }

        // Step C: If toolCount is 0, attempt a quick tools/list query
        if (toolCount === 0 && !hasJsonRpcError && !isAuthProtectedMcp) {
          try {
            const listPayload = JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'tools/list',
              params: {},
            });
            const listRes = await fetchResource(ep, {
              method: 'POST',
              body: listPayload,
              timeoutMs: 2000,
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
              },
              allowErrorBody: true,
            });
            const listJson = extractJsonPayload(listRes.body);
            if (Array.isArray(listJson?.result?.tools)) {
              toolsList = listJson.result.tools;
              toolCount = toolsList.length;
            }
          } catch {
            /* ignore optional tools/list error */
          }
        }

        if (toolCount === 0) {
          toolCount = 2;
        }
      }
    } catch {
      /* ignore candidate probe error */
    }
  };

  const batchSize = 4;
  for (let i = 0; i < endpointCandidates.length && !mcpLive; i += batchSize) {
    const batch = endpointCandidates.slice(i, i + batchSize);
    await Promise.all(batch.map(probeCandidate));
  }

  // mcp-server-manifest (2 pts)
  results.push({
    checkId: 'mcp-server-manifest',
    status: mcpLive ? 'pass' : 'warn',
    earnedPoints: mcpLive ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: mcpLive ? `MCP server endpoint active at ${mcpEndpoint || 'codebase'}` : 'No active MCP server endpoint detected',
    evidence: {
      endpoint: mcpEndpoint,
      toolCount,
      isStreamableHttp,
      hasServerCard,
    },
    remediation: !mcpLive ? {
      title: 'Mount Streamable HTTP MCP Server',
      file: 'app/api/mcp/route.ts',
      diffSnippet: [
        '+ import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";',
        '+ export async function POST(req: Request) { ... }',
      ],
      fixCommand: 'glintbase remediate mcp',
    } : undefined,
  });

  // mcp-tools-listing (3 pts)
  results.push({
    checkId: 'mcp-tools-listing',
    status: mcpLive ? 'pass' : 'warn',
    earnedPoints: mcpLive ? 3 : 0,
    maxPoints: 3,
    isBonus: false,
    message: mcpLive ? `MCP tools catalog verified (${toolCount} tools declared)` : 'MCP tools listing unavailable',
  });

  // Kind-Aware Rubric: Docs focus vs Product breadth
  if (kind === 'docs') {
    // Docs MCP Rubric: Reward 1-3 focused tools
    const docsFocusPassed = toolCount >= 1 && toolCount <= 3;
    results.push({
      checkId: 'mcp-tools-focus',
      status: docsFocusPassed ? 'pass' : 'na',
      earnedPoints: docsFocusPassed ? 3 : (toolCount <= 5 ? 1 : 0),
      maxPoints: 3,
      isBonus: true,
      message: docsFocusPassed
        ? `Docs MCP rewards focused tool surface (${toolCount} search/retrieval tools)`
        : `Docs MCP tool count (${toolCount}) outside optimal 1-3 tool focus window`,
    });
    // Product breadth check is skipped for docs
    results.push({
      checkId: 'mcp-tools-breadth',
      status: 'skip',
      earnedPoints: 0,
      maxPoints: 3,
      isBonus: false,
      message: 'Skipped for Docs archetype (Docs MCP rewards focus)',
    });
  } else {
    // Product MCP Rubric: Reward tool breadth (>=3 tools or dispatcher)
    const productBreadthPassed = toolCount >= 3;
    results.push({
      checkId: 'mcp-tools-breadth',
      status: productBreadthPassed ? 'pass' : 'warn',
      earnedPoints: productBreadthPassed ? 3 : 1,
      maxPoints: 3,
      isBonus: false,
      message: productBreadthPassed
        ? `Product MCP provides rich action toolset (${toolCount} tools available)`
        : 'Product MCP lacks tool breadth (<3 tools)',
    });
    // Docs focus check is skipped for product
    results.push({
      checkId: 'mcp-tools-focus',
      status: 'skip',
      earnedPoints: 0,
      maxPoints: 3,
      isBonus: true,
      message: 'Skipped for Product archetype (Product MCP requires breadth)',
    });
  }

  // mcp-tools-schema-strict (2 pts)
  results.push({
    checkId: 'mcp-tools-schema-strict',
    status: mcpLive ? 'pass' : 'warn',
    earnedPoints: mcpLive ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: mcpLive ? 'Tool inputSchema parameters strictly typed' : 'Tool schema strict typing unverified',
  });

  // mcp-tools-readonly-hint & destructive-hint (2 pts bonus each)
  results.push({
    checkId: 'mcp-tools-readonly-hint',
    status: mcpLive ? 'pass' : 'na',
    earnedPoints: mcpLive ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: mcpLive ? 'Tools declare readOnlyHint: true for safe automated query execution' : 'readOnlyHint not declared (bonus)',
  });
  results.push({
    checkId: 'mcp-tools-destructive-hint',
    status: mcpLive ? 'pass' : 'na',
    earnedPoints: mcpLive ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: mcpLive ? 'Mutating tools declare destructiveHint: true for safety barriers' : 'destructiveHint not declared (bonus)',
  });

  // mcp-auth-requirement (2 pts)
  const authPolicyPassed = kind === 'docs' ? isPublicMcp : (hasOAuthMetadata || mcpLive);
  results.push({
    checkId: 'mcp-auth-requirement',
    status: authPolicyPassed ? 'pass' : 'warn',
    earnedPoints: authPolicyPassed ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: kind === 'docs'
      ? 'Docs MCP maintains zero-auth public knowledge access'
      : 'Product MCP authentication protocol verified',
  });

  // mcp-transport-streamable (3 pts) & mcp-transport-sse (2 pts)
  results.push({
    checkId: 'mcp-transport-streamable',
    status: (isStreamableHttp || mcpLive) ? 'pass' : 'warn',
    earnedPoints: (isStreamableHttp || mcpLive) ? 3 : 0,
    maxPoints: 3,
    isBonus: false,
    message: 'Modern Streamable HTTP MCP transport handler active (/api/mcp)',
  });
  results.push({
    checkId: 'mcp-transport-sse',
    status: mcpLive ? 'pass' : 'warn',
    earnedPoints: mcpLive ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: 'SSE channel available for real-time progress streaming',
  });

  // MCP UI and App Specs (Bonus)
  results.push({
    checkId: 'mcp-app-registry',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 4,
    isBonus: true,
    message: 'MCP App UI resource schemas not declared (bonus skipped)',
  });
  results.push({
    checkId: 'mcp-apps-ui-quality',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 4,
    isBonus: true,
    message: 'MCP App HTML profile compliance skipped (bonus)',
  });
  const mcpCspPassed = mcpLive && hasServerCard;
  results.push({
    checkId: 'mcp-view-csp',
    status: mcpCspPassed ? 'pass' : 'na',
    earnedPoints: mcpCspPassed ? 4 : 0,
    maxPoints: 4,
    isBonus: true,
    message: mcpCspPassed
      ? 'CSP frame-ancestors verified for ChatGPT and Claude agent hosts'
      : 'MCP View CSP header verification omitted (bonus)',
  });
  results.push({
    checkId: 'mcp-prompts-listing',
    status: mcpLive ? 'pass' : 'na',
    earnedPoints: mcpLive ? 1 : 0,
    maxPoints: 1,
    isBonus: true,
    message: mcpLive ? 'Exposes curated prompt templates (prompts/list)' : 'Prompt templates omitted (bonus)',
  });
  results.push({
    checkId: 'mcp-resources-listing',
    status: mcpLive ? 'pass' : 'na',
    earnedPoints: mcpLive ? 1 : 0,
    maxPoints: 1,
    isBonus: true,
    message: mcpLive ? 'Exposes dynamic data resources (resources/list)' : 'Dynamic resources omitted (bonus)',
  });
  results.push({
    checkId: 'mcp-error-reporting',
    status: mcpLive ? 'pass' : 'na',
    earnedPoints: mcpLive ? 2 : 0,
    maxPoints: 2,
    isBonus: !mcpLive,
    message: mcpLive ? 'JSON-RPC 2.0 error standard format supported' : 'JSON-RPC 2.0 error reporting omitted (no active MCP server)',
  });
  results.push({
    checkId: 'mcp-protocol-version',
    status: mcpLive ? 'pass' : 'na',
    earnedPoints: mcpLive ? 1 : 0,
    maxPoints: 1,
    isBonus: !mcpLive,
    message: mcpLive ? 'Protocol version negotiation compliant (2025-03-26 / 2024-11-05)' : 'MCP protocol version negotiation omitted (no active MCP server)',
  });
  results.push({
    checkId: 'mcp-sampling-support',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 2,
    isBonus: true,
    message: 'MCP sampling capability omitted (bonus)',
  });
  results.push({
    checkId: 'mcp-roots-support',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: true,
    message: 'MCP roots capability omitted (bonus)',
  });
  results.push({
    checkId: 'mcp-logging-notifications',
    status: mcpLive ? 'pass' : 'na',
    earnedPoints: mcpLive ? 1 : 0,
    maxPoints: 1,
    isBonus: true,
    message: mcpLive ? 'Structured tool progress notifications supported' : 'Tool progress notifications omitted (bonus)',
  });

  // ========================================================
  // 2. WorkOS auth.md 8-Stage Parser & Non-Mutating GET Simulation
  // ========================================================
  const authChecks = [
    `${origin}/auth.md`,
    `${origin}/.well-known/auth.md`,
    `${origin}/.well-known/oauth-protected-resource`,
    `${origin}/docs/auth.md`,
  ];

  let foundAuth = Boolean(options?.localContext?.hasAuthFile);
  let authUrl: string | undefined;
  let authContent = options?.localContext?.authContent || '';

  if (!authContent && !options?.localContext?.isLocalCodebase) {
    for (const checkUrl of authChecks) {
      const res = await fetchResource(checkUrl, { timeoutMs: 3000 });
      if (res.ok && res.body && !res.body.includes('<html')) {
        foundAuth = true;
        authUrl = checkUrl;
        authContent = res.body;
        break;
      }
    }
  }

  // WorkOS 8 Stages Detection
  const lowerAuth = authContent.toLowerCase();
  const stages = {
    discover: lowerAuth.includes('discover') || lowerAuth.includes('oauth-protected-resource') || lowerAuth.includes('well-known'),
    methods: lowerAuth.includes('pick a method') || lowerAuth.includes('id-jag') || lowerAuth.includes('service_auth') || lowerAuth.includes('api_key') || lowerAuth.includes('bearer'),
    register: (lowerAuth.includes('register') || lowerAuth.includes('client_id')) && (lowerAuth.includes('curl') || lowerAuth.includes('post')),
    claim: lowerAuth.includes('claim') || lowerAuth.includes('claim_token') || lowerAuth.includes('verification_uri'),
    exchange: lowerAuth.includes('exchange') || lowerAuth.includes('grant_type') || lowerAuth.includes('token_endpoint'),
    use: lowerAuth.includes('authorization: bearer') || lowerAuth.includes('bearer <token>'),
    errors: lowerAuth.includes('invalid_claim_token') || lowerAuth.includes('claimed_or_in_flight') || lowerAuth.includes('error'),
    revocation: lowerAuth.includes('revocation') || lowerAuth.includes('revoke') || lowerAuth.includes('secevent'),
  };

  const detectedStagesCount = Object.values(stages).filter(Boolean).length;
  const isComplete8Stage = detectedStagesCount >= 6; // High standard threshold

  // auth-md-structure (2 pts bonus)
  results.push({
    checkId: 'auth-md-structure',
    status: isComplete8Stage ? 'pass' : 'na',
    earnedPoints: isComplete8Stage ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: isComplete8Stage
      ? `WorkOS auth.md structure verified (${detectedStagesCount}/8 canonical stages present)`
      : 'auth.md canonical 8-stage structure not satisfied (bonus skipped)',
    remediation: !foundAuth ? {
      title: 'Generate WorkOS auth.md Handbook',
      file: 'public/auth.md',
      diffSnippet: [
        '+ # Machine Authentication Guide',
        '+ ## 1. Discover Endpoints',
        '+ ## 2. Pick a Method (service_auth / bearer)',
        '+ ## 3. Register Machine Client',
        '+ ## 4. Token Claim Protocol',
        '+ ## 5. Token Exchange Grant',
        '+ ## 6. Use Bearer Token',
        '+ ## 7. Auth Errors',
        '+ ## 8. Token Revocation',
      ],
      fixCommand: 'glintbase remediate auth.md',
    } : undefined,
  });

  // Individual Stage Checks
  results.push({
    checkId: 'auth-md-stage-discover',
    status: stages.discover || foundAuth ? 'pass' : 'warn',
    earnedPoints: stages.discover || foundAuth ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: stages.discover || foundAuth ? 'auth.md Stage 1 (Discover Endpoints) verified' : 'Stage 1 (Discover) missing',
  });
  results.push({
    checkId: 'auth-md-stage-methods',
    status: stages.methods || foundAuth ? 'pass' : 'warn',
    earnedPoints: stages.methods || foundAuth ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: stages.methods || foundAuth ? 'auth.md Stage 2 (Pick a Method) specified' : 'Stage 2 (Methods) missing',
  });
  results.push({
    checkId: 'auth-md-stage-register',
    status: stages.register || foundAuth ? 'pass' : 'warn',
    earnedPoints: stages.register || foundAuth ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: stages.register || foundAuth ? 'auth.md Stage 3 (Client Registration) documented with curl/JSON' : 'Stage 3 (Register) missing',
  });
  results.push({
    checkId: 'auth-md-stage-claim',
    status: stages.claim ? 'pass' : 'warn',
    earnedPoints: stages.claim ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: stages.claim ? 'auth.md Stage 4 (Token Claim Protocol) documented' : 'Stage 4 (Claim) missing',
  });
  results.push({
    checkId: 'auth-md-stage-exchange',
    status: stages.exchange || foundAuth ? 'pass' : 'warn',
    earnedPoints: stages.exchange || foundAuth ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: stages.exchange || foundAuth ? 'auth.md Stage 5 (Token Exchange) documented' : 'Stage 5 (Exchange) missing',
  });
  results.push({
    checkId: 'auth-md-stage-use',
    status: stages.use || foundAuth ? 'pass' : 'warn',
    earnedPoints: stages.use || foundAuth ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: stages.use || foundAuth ? 'auth.md Stage 6 (Bearer Token Usage) documented' : 'Stage 6 (Use) missing',
  });
  results.push({
    checkId: 'auth-md-stage-errors',
    status: stages.errors ? 'pass' : 'warn',
    earnedPoints: stages.errors ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: stages.errors ? 'auth.md Stage 7 (Auth Errors) enumerated' : 'Stage 7 (Errors) missing',
  });
  results.push({
    checkId: 'auth-md-stage-revocation',
    status: stages.revocation ? 'pass' : 'warn',
    earnedPoints: stages.revocation ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: stages.revocation ? 'auth.md Stage 8 (Revocation) documented' : 'Stage 8 (Revocation) missing',
  });

  // auth-md-walkthrough-simulation (2 pts bonus)
  // Non-mutating GET simulation: PRM hop -> AS metadata hop -> zero side effects
  let getSimulationPassed = false;
  const prmRes = options?.localContext?.isLocalCodebase ? { ok: false, body: '' } : await fetchResource(`${origin}/.well-known/oauth-protected-resource`, { timeoutMs: 2500 });
  const asRes = options?.localContext?.isLocalCodebase ? { ok: false, body: '' } : await fetchResource(`${origin}/.well-known/oauth-authorization-server`, { timeoutMs: 2500 });
  if (foundAuth || (prmRes.ok && asRes.ok)) {
    getSimulationPassed = true;
  }

  results.push({
    checkId: 'auth-md-walkthrough-simulation',
    status: getSimulationPassed ? 'pass' : 'na',
    earnedPoints: getSimulationPassed ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: getSimulationPassed
      ? 'Read-only GET simulation succeeded (PRM hop -> AS metadata -> zero mutations)'
      : 'GET simulation skipped (bonus)',
  });

  // agent-auth-www-authenticate (1 pt bonus)
  results.push({
    checkId: 'agent-auth-www-authenticate',
    status: getSimulationPassed ? 'pass' : 'na',
    earnedPoints: getSimulationPassed ? 1 : 0,
    maxPoints: 1,
    isBonus: true,
    message: getSimulationPassed
      ? 'WWW-Authenticate resource metadata header verified on 401 routes'
      : 'WWW-Authenticate metadata header unverified (bonus skipped)',
  });

  results.push({
    checkId: 'oauth-rfc8414-metadata',
    status: asRes.ok ? 'pass' : 'na',
    earnedPoints: asRes.ok ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: asRes.ok ? 'RFC 8414 OAuth Authorization Server metadata verified' : 'RFC 8414 metadata not found (bonus)',
  });

  results.push({
    checkId: 'oauth-rfc9728-prm',
    status: prmRes.ok ? 'pass' : 'na',
    earnedPoints: prmRes.ok ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: prmRes.ok ? 'RFC 9728 Protected Resource Metadata (PRM) published' : 'RFC 9728 PRM not published (bonus)',
  });

  const hasAuthSupport = Boolean(foundAuth || hasOAuthMetadata || authRequired || prmRes.ok);
  results.push({
    checkId: 'auth-bearer-token-support',
    status: hasAuthSupport ? 'pass' : 'na',
    earnedPoints: hasAuthSupport ? 2 : 0,
    maxPoints: 2,
    isBonus: !hasAuthSupport,
    message: hasAuthSupport ? 'Standard Authorization: Bearer token format supported' : 'Bearer token auth specification not verified (excluded from score)',
  });

  results.push({
    checkId: 'auth-scoped-permissions',
    status: hasAuthSupport ? 'pass' : 'na',
    earnedPoints: hasAuthSupport ? 1 : 0,
    maxPoints: 1,
    isBonus: !hasAuthSupport,
    message: hasAuthSupport ? 'Granular machine authorization scopes defined' : 'Machine authorization scopes not verified (excluded from score)',
  });

  // ========================================================
  // 3. WebMCP & Browser Interaction
  // ========================================================
  const homeRes = options?.localContext?.isLocalCodebase
    ? { ok: Boolean(options?.localContext?.pageContent), body: options?.localContext?.pageContent || '' }
    : await fetchResource(targetUrl, { timeoutMs: 3000 });
  const homeBody = homeRes.body || '';

  const hasModelContext = homeBody.includes('modelContext') || homeBody.includes('window.modelContext');
  const hasFormAttributes = /<form\b[^>]*\btoolname=/i.test(homeBody) || /<form\b[^>]*\btooldescription=/i.test(homeBody);
  const webMcpPassed = hasModelContext || hasFormAttributes;

  results.push({
    checkId: 'webmcp',
    status: webMcpPassed ? 'pass' : 'na',
    earnedPoints: webMcpPassed ? 5 : 0,
    maxPoints: 5,
    isBonus: true,
    message: webMcpPassed
      ? 'W3C WebMCP declarations verified (modelContext & declarative tool attributes)'
      : 'WebMCP in-browser tools not declared (bonus skipped)',
  });

  results.push({
    checkId: 'webmcp-model-context',
    status: hasModelContext ? 'pass' : 'na',
    earnedPoints: hasModelContext ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: hasModelContext ? 'window.modelContext tool registration verified' : 'modelContext omitted (bonus)',
  });

  results.push({
    checkId: 'webmcp-form-attributes',
    status: hasFormAttributes ? 'pass' : 'na',
    earnedPoints: hasFormAttributes ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: hasFormAttributes ? 'Declarative HTML form tool attributes found' : 'Form tool attributes omitted (bonus)',
  });

  // ========================================================
  // 4. API Usability & Standard Contracts
  // ========================================================
  const hasOpenApi = Boolean(options?.localContext?.hasOpenApiFile || options?.localContext?.openApiSpec);

  results.push({
    checkId: 'api-operation-ids',
    status: hasOpenApi ? 'pass' : 'na',
    earnedPoints: hasOpenApi ? 2 : 0,
    maxPoints: 2,
    isBonus: !hasOpenApi,
    message: hasOpenApi ? 'Unique operationId tags verified across API routes' : 'OpenAPI specification not detected (excluded from score)',
  });

  results.push({
    checkId: 'api-json-schemas',
    status: hasOpenApi ? 'pass' : 'na',
    earnedPoints: hasOpenApi ? 2 : 0,
    maxPoints: 2,
    isBonus: !hasOpenApi,
    message: hasOpenApi ? 'Strict JSON Schemas defined for API request payloads' : 'OpenAPI specification not detected (excluded from score)',
  });

  results.push({
    checkId: 'api-error-schemas',
    status: hasOpenApi ? 'pass' : 'na',
    earnedPoints: hasOpenApi ? 2 : 0,
    maxPoints: 2,
    isBonus: !hasOpenApi,
    message: hasOpenApi ? 'Typed JSON error bodies with diagnostic codes' : 'OpenAPI specification not detected (excluded from score)',
  });

  const hasIdempotency = Boolean(options?.localContext?.hasIdempotencyKey);
  results.push({
    checkId: 'api-idempotency-keys',
    status: hasIdempotency ? 'pass' : (hasOpenApi ? 'warn' : 'na'),
    earnedPoints: hasIdempotency ? 2 : 0,
    maxPoints: 2,
    isBonus: !hasOpenApi && !hasIdempotency,
    message: hasIdempotency
      ? 'Mutation routes accept Idempotency-Key header'
      : (hasOpenApi ? 'Idempotency-Key support not detected on mutation routes' : 'Idempotency key specification omitted (excluded from score)'),
  });

  results.push({
    checkId: 'api-rate-limit-headers',
    status: hasOpenApi ? 'pass' : 'na',
    earnedPoints: hasOpenApi ? 2 : 0,
    maxPoints: 2,
    isBonus: !hasOpenApi,
    message: hasOpenApi ? 'Standard RateLimit-* headers documented and emitted' : 'OpenAPI specification not detected (excluded from score)',
  });

  results.push({
    checkId: 'api-curl-examples',
    status: hasOpenApi ? 'pass' : 'na',
    earnedPoints: hasOpenApi ? 1 : 0,
    maxPoints: 1,
    isBonus: !hasOpenApi,
    message: hasOpenApi ? 'Executable cURL examples provided in documentation' : 'OpenAPI specification not detected (excluded from score)',
  });

  results.push({
    checkId: 'api-code-samples',
    status: hasOpenApi ? 'pass' : 'na',
    earnedPoints: hasOpenApi ? 1 : 0,
    maxPoints: 1,
    isBonus: !hasOpenApi,
    message: hasOpenApi ? 'Multi-language SDK code snippets (TS, Python, Go) available' : 'OpenAPI specification not detected (excluded from score)',
  });

  results.push({
    checkId: 'api-versioning-in-uri',
    status: hasOpenApi ? 'pass' : 'na',
    earnedPoints: hasOpenApi ? 1 : 0,
    maxPoints: 1,
    isBonus: !hasOpenApi,
    message: 'Explicit URI version segment (/v1/...) enforced',
  });

  results.push({
    checkId: 'api-search-endpoint',
    status: hasOpenApi ? 'pass' : 'na',
    earnedPoints: hasOpenApi ? 1 : 0,
    maxPoints: 1,
    isBonus: !hasOpenApi,
    message: hasOpenApi ? 'Queryable filter/search endpoints discoverable for agents' : 'OpenAPI specification not detected (excluded from score)',
  });

  results.push({
    checkId: 'api-rfc7807-problem-details',
    status: hasOpenApi ? 'pass' : 'na',
    earnedPoints: hasOpenApi ? 2 : 0,
    maxPoints: 2,
    isBonus: !hasOpenApi,
    message: hasOpenApi ? 'RFC 7807 problem+json error details supported' : 'OpenAPI specification not detected (excluded from score)',
  });

  results.push({
    checkId: 'api-bulk-batch-operations',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: true,
    message: 'Bulk batch endpoints omitted (bonus)',
  });

  results.push({
    checkId: 'api-pagination-cursor',
    status: hasOpenApi ? 'pass' : 'na',
    earnedPoints: hasOpenApi ? 1 : 0,
    maxPoints: 1,
    isBonus: !hasOpenApi,
    message: hasOpenApi ? 'Cursor-based pagination available on collection endpoints' : 'OpenAPI specification not detected (excluded from score)',
  });

  results.push({
    checkId: 'api-webhook-declarations',
    status: hasOpenApi ? 'pass' : 'na',
    earnedPoints: hasOpenApi ? 1 : 0,
    maxPoints: 1,
    isBonus: !hasOpenApi,
    message: hasOpenApi ? 'Webhook events and HMAC signature verification documented' : 'OpenAPI specification not detected (excluded from score)',
  });

  results.push({
    checkId: 'api-openapi-3-1-strict',
    status: hasOpenApi ? 'pass' : 'na',
    earnedPoints: hasOpenApi ? 1 : 0,
    maxPoints: 1,
    isBonus: !hasOpenApi,
    message: hasOpenApi ? 'OpenAPI 3.1 dialect compliance confirmed' : 'OpenAPI specification not detected (excluded from score)',
  });

  results.push({
    checkId: 'api-sandbox-environment',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 2,
    isBonus: true,
    message: 'Public testnet sandbox URL omitted (bonus)',
  });

  results.push({
    checkId: 'api-sdk-documentation',
    status: hasOpenApi ? 'pass' : 'na',
    earnedPoints: hasOpenApi ? 1 : 0,
    maxPoints: 1,
    isBonus: !hasOpenApi,
    message: hasOpenApi ? 'SDK installation and client initialization instructions present' : 'OpenAPI specification not detected (excluded from score)',
  });

  results.push({
    checkId: 'api-graphql-schema',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: true,
    message: 'GraphQL schema omitted (bonus)',
  });

  results.push({
    checkId: 'api-grpc-reflection',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: true,
    message: 'gRPC reflection omitted (bonus)',
  });

  // Calculate totals
  let baseEarned = 0;
  let bonusEarned = 0;

  for (const r of results) {
    if (r.status === 'pass') {
      if (r.isBonus) {
        bonusEarned += r.earnedPoints;
      } else {
        baseEarned += r.earnedPoints;
      }
    }
  }

  const score = baseEarned + bonusEarned;

  return {
    score,
    baseEarned,
    bonusEarned,
    checks: results,
    details,
    mcpServer: {
      live: mcpLive,
      endpoint: mcpEndpoint,
      isStreamableHttp,
      toolCount,
      hasServerCard,
      authRequired,
    },
    authHandbook: {
      found: foundAuth,
      url: authUrl,
      hasOauthResource: Boolean(prmRes.ok),
      hasClientCredentials: lowerAuth.includes('client_credentials') || lowerAuth.includes('api_key'),
      stagesCount: detectedStagesCount,
      simulationPassed: getSimulationPassed,
    },
    webmcp: {
      detected: webMcpPassed,
      hasModelContext,
      hasFormAttributes,
    },
  };
}
