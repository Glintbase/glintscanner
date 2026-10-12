/**
 * ARS 3.0 Layer 3 Probe: Usability & Interoperability
 * Evaluates Kind-Aware MCP Rubrics (Docs Focus vs Product Breadth),
 * WorkOS auth.md 8-stage parser & GET simulation, WebMCP, and API contracts.
 *
 * Status rules (shared with the scoring in ./index.ts):
 * - pass: the evidence was observed; earns the registry points.
 * - warn / fail: checked and missing; base checks count against the layer.
 * - na: the surface the check inspects does not exist (e.g. no MCP server, no OpenAPI).
 *   Existence is scored once by its own check, so quality checks are not applicable.
 * - skip: the surface exists but this scan could not verify the check.
 * Points and bonus status always come from the registry.
 */

import { fetchResource } from '../fetchResource';
import { probeMcpServer, type McpLiveProbeResult } from '../mcpProbe';
import { inspectOpenApi } from '../openapiInspect';
import { getChecksForLayer } from './registry';
import { registrableDomain } from '../../shared/url';
import type { CheckDefinition, CheckRemediation, CheckResult, CheckStatus } from './types';

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

const STATIC_CARD_RE = /(server-card\.json|manifest\.json|mcp\.json)$/i;

function isMcpLikePath(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    // Dedicated MCP hosts often serve at the root (https://mcp.stripe.com).
    return /mcp|sse/i.test(u.pathname) || /^mcp\./i.test(u.hostname);
  } catch {
    return false;
  }
}

function isAuthStatus(httpStatus: number | undefined): boolean {
  return httpStatus === 401 || httpStatus === 403;
}

function isJsonRpcEnvelope(json: any): boolean {
  return json?.jsonrpc === '2.0';
}

/** RFC 9728: an MCP server's 401 points clients at its protected-resource metadata. */
function hasResourceMetadataChallenge(headers: Record<string, string> | undefined): boolean {
  return /resource_metadata=/i.test(headers?.['www-authenticate'] || '');
}

/** Endpoint URL declared inside a static MCP server card / manifest, if any. */
function endpointFromCard(json: any, base: string): string | undefined {
  const candidates = [
    json?.url,
    json?.endpoint,
    json?.remotes?.[0]?.url,
    json?.transport?.url,
    json?.servers?.[0]?.url,
  ];
  for (const c of candidates) {
    if (typeof c !== 'string' || !c) continue;
    try {
      return new URL(c, base).href;
    } catch {
      /* ignore */
    }
  }
  return undefined;
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
  const defsById = new Map<string, CheckDefinition>(checkDefs.map((d) => [d.id, d]));
  const results: CheckResult[] = [];
  const kind = options?.kind || 'generic';
  const isLocal = Boolean(options?.localContext?.isLocalCodebase);

  const record = (
    checkId: string,
    status: CheckStatus,
    message: string,
    extra: { evidence?: Record<string, any>; remediation?: CheckRemediation } = {}
  ) => {
    const def = defsById.get(checkId);
    const maxPoints = def?.points ?? 0;
    results.push({
      checkId,
      status,
      earnedPoints: status === 'pass' ? maxPoints : 0,
      maxPoints,
      isBonus: def?.isBonus ?? true,
      message,
      ...extra,
    });
  };

  let u: URL;
  try {
    u = new URL(targetUrl);
  } catch {
    for (const def of checkDefs) {
      record(def.id, 'fail', 'Invalid target URL for usability probe');
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
  // 1. MCP Server Discovery
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

  // Registrable domain, so www.acme.co.uk probes docs.acme.co.uk (not docs.co.uk).
  const apex = registrableDomain(u.hostname) || u.hostname;
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
    '/mcp.json',
  ];

  if (!isLocal) {
    for (const host of candidateHosts) {
      if (!host) continue;
      const pathsForHost = (host === origin || host === origin.replace('://www.', '://'))
        ? standardPaths
        : host.startsWith(`${proto}//mcp.`)
        ? ['', '/mcp', '/sse', '/.well-known/mcp/server-card.json']
        : ['/mcp', '/api/mcp', '/docs/mcp', '/sse', '/.well-known/mcp/server-card.json'];

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

    // The target itself may be an MCP endpoint (e.g. https://mcp.example.com/mcp).
    if (isMcpLikePath(targetUrl) && !endpointCandidates.includes(targetUrl)) {
      endpointCandidates.unshift(targetUrl);
    }
  }

  // A local codebase can declare an MCP route, but nothing about it can be verified remotely.
  let mcpLive = Boolean(options?.localContext?.hasMcpRoute);
  let mcpEndpoint: string | undefined = mcpLive ? '/api/mcp' : undefined;
  let rpcEndpoint: string | undefined; // endpoint that speaks JSON-RPC (not a static card)
  let hasServerCard = false;
  let legacySse = false;
  let postSpeaksJsonRpc = false; // answered a POST with a JSON-RPC envelope (even an error)
  let cardTools: any[] | undefined;

  const probeCandidate = async (ep: string) => {
    if (mcpLive) return;
    try {
      // Step A: GET probe (legacy SSE stream, static card, or auth challenge)
      const res = await fetchResource(ep, {
        timeoutMs: 2500,
        headers: { Accept: 'application/json, text/event-stream' },
        allowErrorBody: true,
      });
      if (mcpLive) return;

      const getIsSse = Boolean(res.contentType?.toLowerCase().includes('text/event-stream'));
      const getJson = extractJsonPayload(res.body);
      const mcpPath = isMcpLikePath(ep);

      if (getIsSse && res.httpStatus === 200) {
        mcpLive = true;
        mcpEndpoint = ep;
        rpcEndpoint = ep;
        legacySse = true;
        return;
      }

      // A 401/403 alone (or any WWW-Authenticate / JSON error) is what every gated
      // app route returns. Only an MCP-shaped answer counts: a JSON-RPC envelope or an
      // RFC 9728 protected-resource challenge (resource_metadata=).
      const getAuthChallenge = isAuthStatus(res.httpStatus) && mcpPath && (
        isJsonRpcEnvelope(getJson) || hasResourceMetadataChallenge(res.headers)
      );
      if (getAuthChallenge) {
        mcpLive = true;
        mcpEndpoint = ep;
        rpcEndpoint = ep;
        return;
      }

      if (getJson && STATIC_CARD_RE.test(ep) && (getJson.mcpServers || getJson.capabilities || getJson.tools || getJson.serverInfo || getJson.name)) {
        mcpLive = true;
        mcpEndpoint = ep;
        hasServerCard = true;
        if (Array.isArray(getJson.tools)) cardTools = getJson.tools;
        rpcEndpoint = endpointFromCard(getJson, ep);
        return;
      }

      if (!mcpPath) return;

      // Step B: POST JSON-RPC initialize handshake
      const postRes = await fetchResource(ep, {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'glintbase-audit', version: '3.1.0' },
          },
        }),
        timeoutMs: 3000,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        allowErrorBody: true,
      });
      if (mcpLive) return;

      const postJson = extractJsonPayload(postRes.body);
      const isJsonRpc = isJsonRpcEnvelope(postJson);
      const authChallenge = isAuthStatus(postRes.httpStatus) &&
        (isJsonRpc || hasResourceMetadataChallenge(postRes.headers));

      if (isJsonRpc || authChallenge) {
        mcpLive = true;
        mcpEndpoint = ep;
        rpcEndpoint = ep;
        postSpeaksJsonRpc = isJsonRpc;
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

  // Live 4-step probe: handshake, tools/list, safe read-only call, error channel.
  let live: McpLiveProbeResult | undefined;
  if (rpcEndpoint && !isLocal) {
    live = await probeMcpServer(rpcEndpoint).catch(() => undefined);
  }

  const authGated = Boolean(live?.authGated);
  const handshakeOk = Boolean(live?.handshakeAccepted);
  const streamableHttp = handshakeOk || authGated || postSpeaksJsonRpc;
  const tools = live?.toolsListed ? live.tools : undefined;
  const listedToolCount = tools?.length ?? (cardTools ? cardTools.length : undefined);
  const toolCount = listedToolCount ?? 0;
  const canInspectTools = Boolean(tools && tools.length > 0);
  const capabilities = live?.capabilities || {};

  // Status for checks that inspect a running MCP server.
  const unverifiable = (why: string): [CheckStatus, string] => [mcpLive ? 'skip' : 'na', mcpLive ? why : 'No MCP server detected'];
  const notVerifiableReason = isLocal
    ? 'MCP route declared in codebase; not verifiable without a running server'
    : authGated
    ? 'MCP server requires authentication; tools could not be inspected anonymously'
    : 'MCP server did not complete a JSON-RPC handshake';

  // mcp-server-manifest
  record(
    'mcp-server-manifest',
    mcpLive ? 'pass' : 'warn',
    mcpLive ? `MCP server endpoint found at ${mcpEndpoint}` : 'No active MCP server endpoint detected',
    {
      evidence: { endpoint: mcpEndpoint, rpcEndpoint, toolCount: listedToolCount, hasServerCard, authGated },
      remediation: !mcpLive ? {
        title: 'Mount Streamable HTTP MCP Server',
        file: 'app/api/mcp/route.ts',
        diffSnippet: [
          '+ import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";',
          '+ export async function POST(req: Request) { ... }',
        ],
        fixCommand: 'glintbase remediate mcp',
      } : undefined,
    }
  );

  // mcp-tools-listing
  if (!mcpLive) {
    record('mcp-tools-listing', 'warn', 'MCP tools listing unavailable');
  } else if (listedToolCount !== undefined && listedToolCount > 0) {
    record('mcp-tools-listing', 'pass', `MCP tools catalog lists ${listedToolCount} tools${tools ? ' (tools/list)' : ' (server card)'}`);
  } else if (authGated) {
    record('mcp-tools-listing', 'warn', 'tools/list requires authentication; agents cannot discover tools before signing in');
  } else if (isLocal) {
    record('mcp-tools-listing', 'skip', notVerifiableReason);
  } else {
    record('mcp-tools-listing', 'warn', 'MCP endpoint found but tools/list returned no tools');
  }

  // Kind-Aware Rubric: Docs focus vs Product breadth
  if (kind === 'docs') {
    const [s, m] = listedToolCount !== undefined
      ? (listedToolCount >= 1 && listedToolCount <= 3
        ? ['pass', `Docs MCP keeps a focused tool surface (${listedToolCount} tools)`]
        : ['warn', `Docs MCP tool count (${listedToolCount}) outside the focused 1-3 tool window`])
      : unverifiable(notVerifiableReason);
    record('mcp-tools-focus', s as CheckStatus, m);
    record('mcp-tools-breadth', 'skip', 'Skipped for Docs archetype (Docs MCP rewards focus)');
  } else {
    const [s, m] = listedToolCount !== undefined
      ? (listedToolCount >= 3
        ? ['pass', `Product MCP provides a rich toolset (${listedToolCount} tools)`]
        : ['warn', `Product MCP lacks tool breadth (${listedToolCount} < 3 tools)`])
      : unverifiable(notVerifiableReason);
    record('mcp-tools-breadth', s as CheckStatus, m);
    record('mcp-tools-focus', 'skip', 'Skipped for Product archetype (Product MCP requires breadth)');
  }

  // Tool schema & annotation checks inspect tools/list output.
  if (canInspectTools && tools) {
    const loose = tools.filter((t) => !t.schemaStrict).map((t) => t.name);
    record(
      'mcp-tools-schema-strict',
      loose.length === 0 ? 'pass' : 'warn',
      loose.length === 0
        ? `All ${tools.length} tools declare object inputSchemas with typed properties`
        : `${loose.length}/${tools.length} tools have loose or missing inputSchemas (${loose.slice(0, 5).join(', ')})`,
      { evidence: { looseTools: loose } }
    );
    const readOnlyCount = tools.filter((t) => t.annotatedReadOnly).length;
    record(
      'mcp-tools-readonly-hint',
      readOnlyCount > 0 ? 'pass' : 'warn',
      readOnlyCount > 0 ? `${readOnlyCount} tools declare readOnlyHint: true` : 'No tool declares readOnlyHint annotations'
    );
    const destructiveCount = tools.filter((t) => t.annotatedDestructive).length;
    record(
      'mcp-tools-destructive-hint',
      destructiveCount > 0 ? 'pass' : 'warn',
      destructiveCount > 0 ? `${destructiveCount} tools declare destructiveHint` : 'No tool declares destructiveHint annotations'
    );
  } else {
    for (const id of ['mcp-tools-schema-strict', 'mcp-tools-readonly-hint', 'mcp-tools-destructive-hint']) {
      const [s, m] = unverifiable(notVerifiableReason);
      record(id, s, m);
    }
  }

  // mcp-auth-requirement: is the server's auth posture right for its kind, and discoverable?
  if (!mcpLive) {
    record('mcp-auth-requirement', 'na', 'No MCP server detected');
  } else if (isLocal) {
    record('mcp-auth-requirement', 'skip', notVerifiableReason);
  } else if (kind === 'docs') {
    record(
      'mcp-auth-requirement',
      authGated ? 'warn' : 'pass',
      authGated ? 'Docs MCP requires authentication; public knowledge should be zero-auth' : 'Docs MCP is publicly accessible without authentication'
    );
  } else if (authGated) {
    const discoverable = Boolean(live?.wwwAuthenticate);
    record(
      'mcp-auth-requirement',
      discoverable ? 'pass' : 'warn',
      discoverable
        ? 'Product MCP requires auth and advertises it via WWW-Authenticate'
        : 'Product MCP rejects anonymous requests without a WWW-Authenticate challenge'
    );
  } else {
    record('mcp-auth-requirement', 'pass', 'Product MCP accepts anonymous handshakes (public tools)');
  }

  // Transports
  if (!mcpLive) {
    record('mcp-transport-streamable', 'warn', 'No Streamable HTTP MCP transport detected');
    record('mcp-transport-sse', 'warn', 'No SSE MCP transport detected');
  } else if (isLocal) {
    record('mcp-transport-streamable', 'skip', notVerifiableReason);
    record('mcp-transport-sse', 'skip', notVerifiableReason);
  } else {
    record(
      'mcp-transport-streamable',
      streamableHttp ? 'pass' : 'warn',
      handshakeOk
        ? `Streamable HTTP JSON-RPC handshake accepted at ${rpcEndpoint}`
        : authGated
        ? `Streamable HTTP endpoint at ${rpcEndpoint} answered with an auth challenge`
        : postSpeaksJsonRpc
        ? `Streamable HTTP endpoint at ${rpcEndpoint} answers JSON-RPC over POST`
        : 'MCP surface found but no endpoint speaks JSON-RPC over HTTP POST'
    );
    record(
      'mcp-transport-sse',
      legacySse ? 'pass' : 'warn',
      legacySse ? 'Legacy SSE stream served on GET' : 'No legacy SSE stream served on GET'
    );
  }

  // MCP UI and App Specs (not yet probed)
  record('mcp-app-registry', 'na', 'MCP App UI resource schemas not probed (bonus)');
  record('mcp-apps-ui-quality', 'na', 'MCP App HTML profile compliance not probed (bonus)');
  record('mcp-view-csp', 'na', 'MCP View CSP frame-ancestors not yet probed (bonus)');

  // Capabilities from the initialize result
  if (handshakeOk) {
    record('mcp-prompts-listing', capabilities.prompts ? 'pass' : 'warn', capabilities.prompts ? 'Server declares the prompts capability' : 'Server does not declare the prompts capability');
    record('mcp-resources-listing', capabilities.resources ? 'pass' : 'warn', capabilities.resources ? 'Server declares the resources capability' : 'Server does not declare the resources capability');
    record('mcp-logging-notifications', capabilities.logging ? 'pass' : 'warn', capabilities.logging ? 'Server declares the logging capability' : 'Server does not declare the logging capability');
    record(
      'mcp-protocol-version',
      live?.protocolVersion ? 'pass' : 'warn',
      live?.protocolVersion ? `Negotiated protocol version ${live.protocolVersion}` : 'initialize result did not include a protocolVersion'
    );
    record(
      'mcp-wire-compatibility',
      live?.dualWireCompatible ? 'pass' : 'warn',
      live?.dualWireCompatible
        ? 'Accepts both 2026-07-28 and legacy initialize wire forms'
        : `Accepts only the ${live?.wireForm2026Supported ? '2026-07-28' : 'legacy'} initialize wire form`
    );
  } else {
    for (const id of ['mcp-prompts-listing', 'mcp-resources-listing', 'mcp-logging-notifications', 'mcp-protocol-version', 'mcp-wire-compatibility']) {
      const [s, m] = unverifiable(notVerifiableReason);
      record(id, s, m);
    }
  }

  // Error channel integrity (canary call to a non-existent tool)
  if (handshakeOk && live) {
    const ok = live.inChannelErrorsVerified;
    record(
      'mcp-error-reporting',
      ok ? 'pass' : 'fail',
      ok
        ? 'Errors signalled in-channel (JSON-RPC error or isError: true) for an unknown-tool call'
        : 'Unknown-tool call was not signalled in-channel (HTTP 200 text, HTML, or unparseable)'
    );
  } else {
    const [s, m] = unverifiable(notVerifiableReason);
    record('mcp-error-reporting', s, m);
  }

  // Schema honesty needs a safe (readOnlyHint, zero-argument) tool to call.
  if (live?.dishonestSchemaDetected) {
    record('mcp-honest-schemas', 'fail', `Tool "${live.safeCallTool}" declares no required arguments but rejects calls without them`);
  } else if (live?.safeCallTool) {
    record('mcp-honest-schemas', 'pass', `Tool "${live.safeCallTool}" executed with its declared schema`);
  } else {
    const [s, m] = unverifiable('No zero-argument tool annotated readOnlyHint: true to exercise safely');
    record('mcp-honest-schemas', s, m);
  }

  record('mcp-ssrf-guard', mcpLive ? 'skip' : 'na', mcpLive ? 'SSRF guard not probed (requires sending private-network URLs to the server)' : 'No MCP server detected');
  record('mcp-sampling-support', 'na', 'MCP sampling is a client capability; not probed (bonus)');
  record('mcp-roots-support', 'na', 'MCP roots is a client capability; not probed (bonus)');

  // ========================================================
  // 2. WorkOS auth.md 8-Stage Parser & Non-Mutating GET Simulation
  // ========================================================
  const authChecks = [
    `${origin}/auth.md`,
    `${origin}/.well-known/auth.md`,
    `${origin}/docs/auth.md`,
  ];

  let foundAuth = Boolean(options?.localContext?.hasAuthFile);
  let authUrl: string | undefined;
  let authContent = options?.localContext?.authContent || '';

  if (!authContent && !isLocal) {
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

  record(
    'auth-md-structure',
    isComplete8Stage ? 'pass' : foundAuth ? 'warn' : 'na',
    isComplete8Stage
      ? `WorkOS auth.md structure verified (${detectedStagesCount}/8 canonical stages present)`
      : foundAuth
      ? `auth.md covers ${detectedStagesCount}/8 canonical stages`
      : 'auth.md not published (bonus skipped)',
    {
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
    }
  );

  // Individual stage checks: each stage must actually appear in auth.md.
  const stageChecks: Array<[keyof typeof stages, string, string]> = [
    ['discover', 'auth-md-stage-discover', 'Stage 1 (Discover Endpoints)'],
    ['methods', 'auth-md-stage-methods', 'Stage 2 (Pick a Method)'],
    ['register', 'auth-md-stage-register', 'Stage 3 (Client Registration with curl/JSON)'],
    ['claim', 'auth-md-stage-claim', 'Stage 4 (Token Claim Protocol)'],
    ['exchange', 'auth-md-stage-exchange', 'Stage 5 (Token Exchange)'],
    ['use', 'auth-md-stage-use', 'Stage 6 (Bearer Token Usage)'],
    ['errors', 'auth-md-stage-errors', 'Stage 7 (Auth Errors)'],
    ['revocation', 'auth-md-stage-revocation', 'Stage 8 (Revocation)'],
  ];
  for (const [stage, checkId, label] of stageChecks) {
    record(
      checkId,
      stages[stage] ? 'pass' : 'warn',
      stages[stage] ? `auth.md ${label} documented` : foundAuth ? `auth.md missing ${label}` : `${label} missing (no auth.md published)`
    );
  }

  // Non-mutating GET simulation: PRM hop -> AS metadata hop -> zero side effects
  const readJsonDoc = async (url: string) => {
    if (isLocal) return null;
    const res = await fetchResource(url, { timeoutMs: 2500 });
    if (!res.ok) return null;
    const json = extractJsonPayload(res.body);
    return json && typeof json === 'object' ? json : null;
  };
  const [prmDoc, asDoc] = await Promise.all([
    readJsonDoc(`${origin}/.well-known/oauth-protected-resource`),
    readJsonDoc(`${origin}/.well-known/oauth-authorization-server`),
  ]);
  const prmOk = Boolean(prmDoc?.resource || prmDoc?.authorization_servers);
  const asOk = Boolean(asDoc?.issuer && (asDoc?.token_endpoint || asDoc?.authorization_endpoint));
  const getSimulationPassed = prmOk && asOk;

  record(
    'auth-md-walkthrough-simulation',
    getSimulationPassed ? 'pass' : 'na',
    getSimulationPassed
      ? 'Read-only GET simulation succeeded (PRM hop -> AS metadata -> zero mutations)'
      : 'PRM -> AS metadata walkthrough not available (bonus skipped)'
  );

  const wwwAuth = live?.wwwAuthenticate || '';
  record(
    'agent-auth-www-authenticate',
    /resource_metadata=/i.test(wwwAuth) ? 'pass' : authGated ? 'warn' : 'na',
    /resource_metadata=/i.test(wwwAuth)
      ? 'WWW-Authenticate challenge links resource metadata (RFC 9728)'
      : authGated
      ? 'Auth-gated MCP endpoint omits resource_metadata in WWW-Authenticate'
      : 'No auth-gated endpoint observed (bonus skipped)'
  );

  record('oauth-rfc8414-metadata', asOk ? 'pass' : 'na', asOk ? 'RFC 8414 OAuth Authorization Server metadata verified' : 'RFC 8414 metadata not found (bonus)');
  record('oauth-rfc9728-prm', prmOk ? 'pass' : 'na', prmOk ? 'RFC 9728 Protected Resource Metadata (PRM) published' : 'RFC 9728 PRM not published (bonus)');

  const hasAuthSurface = Boolean(foundAuth || authGated || prmOk || asOk);
  const bearerEvidence =
    (Array.isArray(prmDoc?.bearer_methods_supported) && prmDoc.bearer_methods_supported.includes('header')) ||
    /^bearer\b/i.test(wwwAuth) ||
    stages.use;
  record(
    'auth-bearer-token-support',
    !hasAuthSurface ? 'na' : bearerEvidence ? 'pass' : 'warn',
    !hasAuthSurface
      ? 'No machine auth surface published (excluded from score)'
      : bearerEvidence
      ? 'Authorization: Bearer usage declared (PRM, WWW-Authenticate, or auth.md)'
      : 'Auth surface found but Bearer token usage is not declared'
  );

  const scopes = [
    ...(Array.isArray(prmDoc?.scopes_supported) ? prmDoc.scopes_supported : []),
    ...(Array.isArray(asDoc?.scopes_supported) ? asDoc.scopes_supported : []),
  ];
  record(
    'auth-scoped-permissions',
    !hasAuthSurface ? 'na' : scopes.length > 0 ? 'pass' : 'warn',
    !hasAuthSurface
      ? 'No machine auth surface published (excluded from score)'
      : scopes.length > 0
      ? `Machine authorization scopes declared (${Array.from(new Set(scopes)).slice(0, 6).join(', ')})`
      : 'No scopes_supported declared in OAuth metadata'
  );

  // ========================================================
  // 3. WebMCP & Browser Interaction
  // ========================================================
  const homeRes = isLocal
    ? { ok: Boolean(options?.localContext?.pageContent), body: options?.localContext?.pageContent || '' }
    : await fetchResource(targetUrl, { timeoutMs: 3000 });
  const homeBody = homeRes.body || '';

  const hasModelContext = homeBody.includes('modelContext') || homeBody.includes('window.modelContext');
  const hasFormAttributes = /<form\b[^>]*\btoolname=/i.test(homeBody) || /<form\b[^>]*\btooldescription=/i.test(homeBody);
  const webMcpPassed = hasModelContext || hasFormAttributes;

  record(
    'webmcp',
    webMcpPassed ? 'pass' : 'na',
    webMcpPassed
      ? 'W3C WebMCP declarations verified (modelContext & declarative tool attributes)'
      : 'WebMCP in-browser tools not declared (bonus skipped)'
  );
  record('webmcp-model-context', hasModelContext ? 'pass' : 'na', hasModelContext ? 'window.modelContext tool registration verified' : 'modelContext omitted (bonus)');
  record('webmcp-form-attributes', hasFormAttributes ? 'pass' : 'na', hasFormAttributes ? 'Declarative HTML form tool attributes found' : 'Form tool attributes omitted (bonus)');

  const hasTopLevelJsRegistration = /registerTool\s*\(/i.test(homeBody) || /document\.modelContext\.registerTool/i.test(homeBody) || /window\.modelContext\.registerTool/i.test(homeBody);
  record(
    'webmcp-js-registration',
    hasTopLevelJsRegistration ? 'pass' : (hasFormAttributes ? 'warn' : 'na'),
    hasTopLevelJsRegistration
      ? 'Top-level document.modelContext.registerTool registration verified for ChatGPT Site Tools'
      : (hasFormAttributes
        ? 'WebMCP tools defined only via HTML form attributes (visible to Chrome, but invisible to ChatGPT Site Tools)'
        : 'WebMCP top-level JS registration omitted (bonus skipped)')
  );

  // ========================================================
  // 4. API Usability & Standard Contracts (inspected from the OpenAPI document)
  // ========================================================
  const spec = options?.localContext?.openApiSpec;
  const hasOpenApi = Boolean(options?.localContext?.hasOpenApiFile || spec);
  const api = spec ? inspectOpenApi(spec) : undefined;

  type ApiVerdict = [boolean, string, string];
  const apiChecks: Array<[string, (a: NonNullable<typeof api>) => ApiVerdict]> = [
    ['api-operation-ids', (a) => [
      a.operationCount > 0 && a.operationIds.withId === a.operationCount && a.operationIds.duplicates.length === 0,
      `All ${a.operationCount} operations have unique operationIds`,
      a.operationIds.duplicates.length
        ? `Duplicate operationIds: ${a.operationIds.duplicates.slice(0, 5).join(', ')}`
        : `${a.operationCount - a.operationIds.withId}/${a.operationCount} operations lack an operationId`,
    ]],
    ['api-json-schemas', (a) => [
      a.requestBodies.total === 0 || a.requestBodies.withJsonSchema === a.requestBodies.total,
      a.requestBodies.total === 0 ? 'No operations take a request body' : `All ${a.requestBodies.total} request bodies declare a JSON schema`,
      `${a.requestBodies.total - a.requestBodies.withJsonSchema}/${a.requestBodies.total} request bodies lack a JSON schema`,
    ]],
    ['api-error-schemas', (a) => [
      a.operationCount > 0 && a.errorResponses.operationsWithTypedError / a.operationCount >= 0.5,
      `${a.errorResponses.operationsWithTypedError}/${a.operationCount} operations declare typed error responses`,
      `Only ${a.errorResponses.operationsWithTypedError}/${a.operationCount} operations declare typed 4xx/5xx/default responses`,
    ]],
    ['api-idempotency-keys', (a) => [
      a.idempotencyKey || Boolean(options?.localContext?.hasIdempotencyKey),
      'Idempotency-Key header declared on mutation routes',
      'No Idempotency-Key header parameter declared',
    ]],
    ['api-rate-limit-headers', (a) => [a.rateLimitHeaders, 'Rate limit / Retry-After headers documented', 'No RateLimit or Retry-After headers documented']],
    ['api-curl-examples', (a) => [a.curlExamples, 'cURL examples embedded in the spec', 'No cURL examples in the spec']],
    ['api-code-samples', (a) => [a.codeSamples, 'x-codeSamples declared', 'No x-codeSamples declared']],
    ['api-versioning-in-uri', (a) => [a.versionedUris, 'Explicit URI version segment (/v1/...)', 'No version segment in server URLs or paths']],
    ['api-search-endpoint', (a) => [a.searchEndpoint, 'Search / filter endpoint declared', 'No search or filter endpoint declared']],
    ['api-rfc7807-problem-details', (a) => [a.problemDetails, 'application/problem+json error responses declared', 'No RFC 7807 problem+json responses declared']],
    ['api-pagination-cursor', (a) => [a.cursorPagination, 'Cursor-style pagination parameters declared', 'No cursor pagination parameters declared']],
    ['api-webhook-declarations', (a) => [a.webhooks, 'Webhooks or callbacks declared', 'No webhooks or callbacks declared']],
    ['api-openapi-3-1-strict', (a) => [a.isOpenApi31, `OpenAPI ${a.version} document`, `Spec is ${a.version || 'unknown version'}, not OpenAPI 3.1`]],
  ];

  for (const [checkId, evaluate] of apiChecks) {
    if (!hasOpenApi) {
      record(checkId, 'na', 'OpenAPI specification not detected (excluded from score)');
    } else if (!api) {
      record(checkId, 'skip', 'OpenAPI spec found but not inspected (YAML or local file)');
    } else {
      const [passed, passMsg, failMsg] = evaluate(api);
      record(checkId, passed ? 'pass' : 'warn', passed ? passMsg : failMsg);
    }
  }

  record('api-sdk-documentation', hasOpenApi ? 'skip' : 'na', hasOpenApi ? 'SDK documentation not yet probed' : 'OpenAPI specification not detected (excluded from score)');
  record('api-error-actionability', hasOpenApi || mcpLive ? 'skip' : 'na', 'Error payload actionability not yet probed (bonus)');
  record('api-bulk-batch-operations', 'na', 'Bulk batch endpoints not probed (bonus)');
  record('api-sandbox-environment', 'na', 'Public testnet sandbox URL not probed (bonus)');
  record('api-graphql-schema', 'na', 'GraphQL schema not probed (bonus)');
  record('api-grpc-reflection', 'na', 'gRPC reflection not probed (bonus)');

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
      isStreamableHttp: streamableHttp,
      toolCount,
      hasServerCard,
      authRequired: authGated,
    },
    authHandbook: {
      found: foundAuth,
      url: authUrl,
      hasOauthResource: prmOk,
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
