/**
 * Dual-era MCP live prober (ARS 3.3)
 *
 * Follows the client-side backward-compatibility procedure in MCP 2026-07-28, as the
 * Remote MCP Server Reliability study harness does (glintbase-research,
 * benchmarks/production-mcp-reliability-crisis/harness/probe.py):
 *
 * 1. Handshake: `server/discover` with per-request `_meta` and `MCP-Protocol-Version` /
 *    `Mcp-Method` headers. A DiscoverResult (`supportedVersions`) or a modern-only error
 *    marks the server as modern. Otherwise `initialize` (2025-11-25, retried with 2025-03-26),
 *    then `notifications/initialized` with the session id if one was issued.
 * 2. Anonymous tools discovery (`tools/list`) and hidden auth gates.
 * 3. Safe execution probe: only a zero-argument tool the server annotates `readOnlyHint: true`.
 * 4. Error channel integrity: a call to a non-existent tool must come back in-channel.
 */

import { fetchResource, type FetchResourceResult } from './fetchResource';

export const MODERN_PROTOCOL_VERSION = '2026-07-28';
const LEGACY_PROTOCOL_VERSION = '2025-11-25';
const LEGACY_FALLBACK_VERSION = '2025-03-26';
/** Legacy revisions that define the MCP-Protocol-Version header on post-initialize requests. */
const HEADER_VERSIONS = new Set(['2025-06-18', '2025-11-25']);
/** Errors only a modern server emits about the request itself (no legacy fallback). */
const MODERN_ONLY_ERROR_CODES = new Set([-32020, -32021]);
/** UnsupportedProtocolVersion: a dual-era client retries with an older revision. */
const UNSUPPORTED_VERSION_CODE = -32022;
const CANARY_TOOL = '__glintbase_canary_invalid_tool_probe__';
const CLIENT_INFO = { name: 'glintbase-live-probe', version: '3.3.0' };

export interface McpProbeStepResult {
  step: 'handshake' | 'tools_list' | 'safe_call' | 'error_channel';
  passed: boolean;
  wireFormat?: '2026-07-28' | '2025-03-26' | 'legacy' | 'unsupported';
  latencyMs: number;
  httpStatus?: number;
  message?: string;
  data?: any;
}

export interface McpLiveProbeResult {
  live: boolean;
  endpoint: string;
  /** The server completed a handshake (server/discover result or initialize result). */
  handshakeAccepted: boolean;
  /** `modern` answered server/discover; `legacy` completed initialize. */
  era?: 'modern' | 'legacy';
  protocolVersion?: string;
  /** Revisions a modern server lists in its DiscoverResult. */
  supportedVersions?: string[];
  /** Modern server that also completed a legacy initialize handshake. */
  dualWireCompatible: boolean;
  wireForm2026Supported: boolean;
  legacyWireSupported: boolean;
  authGated: boolean;
  hiddenAuthGateDetected: boolean;
  dishonestSchemaDetected: boolean;
  inChannelErrorsVerified: boolean;
  toolCount: number;
  /** True only when tools/list returned a well-formed tools array. */
  toolsListed: boolean;
  /** Server capabilities from the handshake result (prompts, resources, logging, ...). */
  capabilities: Record<string, any>;
  /** Raw WWW-Authenticate header when the endpoint answered 401. */
  wwwAuthenticate?: string;
  /** Name of the tool exercised by the safe-call step, if any. */
  safeCallTool?: string;
  tools: Array<{
    name: string;
    description?: string;
    /** Name-based guess (get_/list_) or annotation; display only. */
    readOnly?: boolean;
    destructive?: boolean;
    /** Explicit MCP annotations, as declared by the server. */
    annotatedReadOnly: boolean;
    annotatedDestructive: boolean;
    schemaValid: boolean;
    /** inputSchema is an object schema whose properties all declare a type. */
    schemaStrict: boolean;
    declaredRequiredCount: number;
    /** `$schema` declared on inputSchema, if any (MCP's default dialect is JSON Schema 2020-12). */
    schemaDialect?: string;
  }>;
  /** Characters in the serialized tool definitions from the first tools/list page. */
  toolDefinitionChars: number;
  steps: McpProbeStepResult[];
  reliabilityScore: number; // 0 - 100
}

/** JSON objects carried in SSE `data:` fields, one per event. */
function parseSseMessages(text: string): any[] {
  const out: any[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart());
    if (!data.length) continue;
    try {
      const obj = JSON.parse(data.join('\n'));
      if (obj && typeof obj === 'object') out.push(obj);
    } catch {
      /* not JSON */
    }
  }
  return out;
}

/** The JSON-RPC response in a body (plain JSON or an SSE stream), preferring the given id. */
function extractJson(body?: string, rpcId?: number): any {
  if (!body) return null;
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    /* SSE or embedded JSON */
  }
  const messages = parseSseMessages(trimmed);
  const isResponse = (m: any) => 'result' in m || 'error' in m;
  const match = messages.find((m) => m.id === rpcId && isResponse(m)) || messages.find(isResponse);
  if (match) return match;
  const m = trimmed.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {
      /* give up */
    }
  }
  return null;
}

function modernMeta() {
  return {
    'io.modelcontextprotocol/protocolVersion': MODERN_PROTOCOL_VERSION,
    'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
    'io.modelcontextprotocol/clientCapabilities': {},
  };
}

function modernHeaders(method: string, name?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'mcp-protocol-version': MODERN_PROTOCOL_VERSION,
    'mcp-method': method,
    ...(name ? { 'mcp-name': name } : {}),
  };
}

function legacyHeaders(version?: string, session?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(version && HEADER_VERSIONS.has(version) ? { 'mcp-protocol-version': version } : {}),
    ...(session ? { 'mcp-session-id': session } : {}),
  };
}

function isAuthChallenge(res: FetchResourceResult): boolean {
  return res.httpStatus === 401 || (res.httpStatus === 403 && Boolean(res.headers?.['www-authenticate']));
}

/**
 * Executes the dual-era MCP live diagnostic probe against an endpoint.
 */
export async function probeMcpServer(endpointUrl: string): Promise<McpLiveProbeResult> {
  const steps: McpProbeStepResult[] = [];
  let wireForm2026Supported = false;
  let legacyWireSupported = false;
  let dualWireCompatible = false;
  let authGated = false;
  let hiddenAuthGateDetected = false;
  let dishonestSchemaDetected = false;
  let inChannelErrorsVerified = false;
  let protocolVersion: string | undefined;
  let supportedVersions: string[] | undefined;
  let era: McpLiveProbeResult['era'];
  let capabilities: Record<string, any> = {};
  let session: string | undefined;
  let wwwAuthenticate: string | undefined;
  const tools: McpLiveProbeResult['tools'] = [];

  const post = (body: object, headers: Record<string, string>, timeoutMs = 3500) =>
    fetchResource(endpointUrl, {
      method: 'POST',
      body: JSON.stringify(body),
      timeoutMs,
      headers,
      allowErrorBody: true,
    });

  const noteAuth = (res: FetchResourceResult) => {
    if (!isAuthChallenge(res)) return false;
    authGated = true;
    wwwAuthenticate = wwwAuthenticate || res.headers?.['www-authenticate'];
    return true;
  };

  /** Headers and _meta for a request after the handshake, in the server's era. */
  const requestShape = (method: string, name?: string) =>
    era === 'modern'
      ? { headers: modernHeaders(method, name), meta: { _meta: modernMeta() } }
      : { headers: legacyHeaders(protocolVersion, session), meta: {} };

  // =========================================================================
  // STEP 1: Handshake (server/discover, then initialize)
  // =========================================================================
  const t0 = Date.now();

  const discoverRes = await post(
    { jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: modernMeta() } },
    modernHeaders('server/discover')
  );
  const discoverJson = extractJson(discoverRes.body, 1);
  const discoverResult = discoverJson?.result;
  const discoverErrorCode = typeof discoverJson?.error?.code === 'number' ? discoverJson.error.code : undefined;
  noteAuth(discoverRes);

  const isModern =
    (discoverResult && typeof discoverResult === 'object' && Array.isArray(discoverResult.supportedVersions)) ||
    (discoverErrorCode !== undefined && MODERN_ONLY_ERROR_CODES.has(discoverErrorCode));

  let initRes: FetchResourceResult | undefined;
  if (isModern) {
    era = 'modern';
    wireForm2026Supported = true;
    protocolVersion = MODERN_PROTOCOL_VERSION;
    if (Array.isArray(discoverResult?.supportedVersions)) {
      supportedVersions = discoverResult.supportedVersions.filter((v: unknown): v is string => typeof v === 'string');
    }
    if (discoverResult?.capabilities && typeof discoverResult.capabilities === 'object') {
      capabilities = discoverResult.capabilities;
    }
  }

  // Legacy initialize: the handshake for legacy servers, and the dual-era check for modern
  // servers that say they still accept an older revision.
  const claimsLegacy = Boolean(supportedVersions?.some((v) => v !== MODERN_PROTOCOL_VERSION));
  if (!authGated && (!isModern || claimsLegacy)) {
    const initialize = (version: string) =>
      post(
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'initialize',
          params: { protocolVersion: version, capabilities: {}, clientInfo: CLIENT_INFO },
        },
        legacyHeaders()
      );
    initRes = await initialize(LEGACY_PROTOCOL_VERSION);
    let initJson = extractJson(initRes.body, 2);
    if (initJson?.error && !initJson?.result) {
      // Some older servers reject an unknown protocolVersion instead of negotiating down.
      initRes = await initialize(LEGACY_FALLBACK_VERSION);
      initJson = extractJson(initRes.body, 2);
    }
    noteAuth(initRes);
    const initResult = initJson?.result;
    if (initResult && typeof initResult === 'object') {
      legacyWireSupported = true;
      if (isModern) {
        dualWireCompatible = true;
      } else {
        era = 'legacy';
        protocolVersion = typeof initResult.protocolVersion === 'string' ? initResult.protocolVersion : undefined;
        if (initResult.capabilities && typeof initResult.capabilities === 'object') capabilities = initResult.capabilities;
        session = initRes.headers?.['mcp-session-id'];
        await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, legacyHeaders(protocolVersion, session), 2500);
      }
    }
  }

  const handshakePassed = era !== undefined;

  steps.push({
    step: 'handshake',
    passed: handshakePassed || authGated,
    wireFormat: era === 'modern' ? '2026-07-28' : era === 'legacy' ? 'legacy' : 'unsupported',
    latencyMs: Date.now() - t0,
    httpStatus: discoverRes.httpStatus || initRes?.httpStatus,
    message: handshakePassed
      ? era === 'modern'
        ? `server/discover answered (2026-07-28${dualWireCompatible ? '; legacy initialize also accepted' : ''})`
        : `initialize accepted (negotiated ${protocolVersion || 'no version'}; server/discover not supported${discoverErrorCode === UNSUPPORTED_VERSION_CODE ? ': 2026-07-28 rejected' : ''})`
      : authGated
      ? 'Endpoint requires authentication at handshake stage'
      : 'Handshake failed or invalid JSON-RPC response',
  });

  // =========================================================================
  // STEP 2: Tools Discovery (tools/list)
  // =========================================================================
  const t1 = Date.now();
  let toolsListed = false;
  let toolsListPassed = false;
  let toolDefinitionChars = 0;
  let listStatus: number | undefined;

  if (handshakePassed) {
    const shape = requestShape('tools/list');
    const listRes = await post({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: { ...shape.meta } }, shape.headers);
    listStatus = listRes.httpStatus;
    noteAuth(listRes);
    const listJson = extractJson(listRes.body, 3);
    const rawTools = Array.isArray(listJson?.result?.tools) ? listJson.result.tools : [];
    toolsListed = Array.isArray(listJson?.result?.tools);
    toolsListPassed = toolsListed;

    for (const t of rawTools) {
      if (!t?.name) continue;
      const reqList = Array.isArray(t.inputSchema?.required) ? t.inputSchema.required : [];
      const props = t.inputSchema?.properties && typeof t.inputSchema.properties === 'object' ? Object.values<any>(t.inputSchema.properties) : [];
      const annotatedReadOnly = t.annotations?.readOnlyHint === true || t.readOnlyHint === true;
      const annotatedDestructive = typeof t.annotations?.destructiveHint === 'boolean' || typeof t.destructiveHint === 'boolean';
      tools.push({
        name: t.name,
        description: t.description,
        readOnly: Boolean(annotatedReadOnly || t.name.startsWith('get_') || t.name.startsWith('list_')),
        destructive: Boolean(t.annotations?.destructiveHint || t.destructiveHint || t.name.startsWith('delete_') || t.name.startsWith('drop_')),
        annotatedReadOnly,
        annotatedDestructive,
        schemaValid: Boolean(t.inputSchema && typeof t.inputSchema === 'object'),
        schemaStrict: Boolean(
          t.inputSchema?.type === 'object' &&
          props.every((p) => p && typeof p === 'object' && (p.type || p.enum || p.const !== undefined || p.anyOf || p.oneOf || p.allOf || p.$ref))
        ),
        declaredRequiredCount: reqList.length,
        schemaDialect: typeof t.inputSchema?.$schema === 'string' ? t.inputSchema.$schema : undefined,
      });
    }
    toolDefinitionChars = JSON.stringify(rawTools).length;
  }

  steps.push({
    step: 'tools_list',
    passed: toolsListPassed,
    latencyMs: Date.now() - t1,
    httpStatus: listStatus,
    message: toolsListPassed
      ? `Discovered ${tools.length} declared tools`
      : handshakePassed
      ? 'Failed to retrieve tools catalog anonymously'
      : 'Skipped: no handshake',
    data: { declaredCount: tools.length },
  });

  // =========================================================================
  // STEP 3: Safe Call & Schema Honesty Probe
  // =========================================================================
  const t2 = Date.now();
  let safeCallPassed = false;

  // Pick a tool with 0 declared required arguments that the server itself annotates as
  // read-only. Never call unannotated tools on third-party servers: they may mutate state.
  const zeroArgTool = tools.find((t) => t.declaredRequiredCount === 0 && t.annotatedReadOnly);

  if (zeroArgTool) {
    const shape = requestShape('tools/call', zeroArgTool.name);
    const callRes = await post(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: zeroArgTool.name, arguments: {}, ...shape.meta } },
      shape.headers,
      4000
    );
    const callJson = extractJson(callRes.body, 4);

    // Hidden auth gate: the handshake worked anonymously, but the call requires auth.
    if (callRes.httpStatus === 401 || (callJson?.error?.code === -32001 && /auth|token|credential/i.test(callJson?.error?.message || ''))) {
      hiddenAuthGateDetected = true;
    }

    // Dishonest schema: declared 0 required args, but the server complains about missing ones.
    if (/missing.*required|argument.*required|validation.*failed/i.test(callJson?.error?.message || '')) {
      dishonestSchemaDetected = true;
    }

    if (callJson?.result?.content || (callJson?.jsonrpc === '2.0' && callJson.result && !callJson.error)) {
      safeCallPassed = true;
    }

    steps.push({
      step: 'safe_call',
      passed: safeCallPassed,
      latencyMs: Date.now() - t2,
      httpStatus: callRes.httpStatus,
      message: safeCallPassed
        ? `Safe execution verified on tool "${zeroArgTool.name}"`
        : hiddenAuthGateDetected
        ? `Hidden auth gate detected on call time for "${zeroArgTool.name}"`
        : dishonestSchemaDetected
        ? `Dishonest schema detected: undeclared arguments required for "${zeroArgTool.name}"`
        : `Safe tool call returned error: ${callJson?.error?.message || 'unknown error'}`,
    });
  } else {
    steps.push({
      step: 'safe_call',
      passed: false,
      latencyMs: Date.now() - t2,
      message: tools.length === 0 ? 'Skipped: No tools discovered' : 'Skipped: No zero-argument tool annotated readOnlyHint: true',
    });
  }

  // =========================================================================
  // STEP 4: Error Channel Integrity Probe (in-channel vs 200 masquerade)
  // =========================================================================
  const t3 = Date.now();
  let errStatus: number | undefined;

  if (handshakePassed) {
    const shape = requestShape('tools/call', CANARY_TOOL);
    const errRes = await post(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: CANARY_TOOL, arguments: {}, ...shape.meta } },
      shape.headers,
      3000
    );
    errStatus = errRes.httpStatus;
    const errJson = extractJson(errRes.body, 5);
    // Must be a JSON-RPC error or result.isError: true, not HTML or an HTTP 200 plain-text masquerade.
    if (errJson?.error && typeof errJson.error === 'object') {
      inChannelErrorsVerified = true;
    } else if (errJson?.result?.isError === true) {
      inChannelErrorsVerified = true;
    }
  }

  steps.push({
    step: 'error_channel',
    passed: inChannelErrorsVerified,
    latencyMs: Date.now() - t3,
    httpStatus: errStatus,
    message: inChannelErrorsVerified
      ? 'Errors signalled properly in-channel via JSON-RPC error envelope or isError: true'
      : handshakePassed
      ? 'Failed: Error was masqueraded as HTTP 200 plain string, HTML, or unparseable envelope'
      : 'Skipped: no handshake',
  });

  // =========================================================================
  // Compute Overall Reliability Score
  // =========================================================================
  let score = 0;
  if (handshakePassed) score += 30;
  if (wireForm2026Supported) score += 10;
  if (toolsListPassed) score += 25;
  if (safeCallPassed) score += 15;
  if (handshakePassed && !hiddenAuthGateDetected) score += 5;
  if (handshakePassed && !dishonestSchemaDetected) score += 5;
  if (inChannelErrorsVerified) score += 10;

  return {
    live: handshakePassed || authGated,
    endpoint: endpointUrl,
    handshakeAccepted: handshakePassed,
    era,
    protocolVersion,
    supportedVersions,
    dualWireCompatible,
    wireForm2026Supported,
    legacyWireSupported,
    authGated,
    hiddenAuthGateDetected,
    dishonestSchemaDetected,
    inChannelErrorsVerified,
    toolCount: tools.length,
    toolsListed,
    toolDefinitionChars,
    capabilities,
    wwwAuthenticate,
    safeCallTool: zeroArgTool?.name,
    tools,
    steps,
    reliabilityScore: Math.min(100, score),
  };
}
