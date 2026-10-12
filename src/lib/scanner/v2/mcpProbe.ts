/**
 * 4-Step Empirical MCP Live Prober (SPEC-09 / ARS 3.1)
 * Evaluates production MCP servers across:
 * 1. Dual Wire-Form Handshake (2026-07-28 in _meta/headers vs legacy)
 * 2. Anonymous Tools Discovery & Hidden Auth Gates
 * 3. Safe Execution Probe & Schema Honesty
 * 4. Error Channel Integrity (isError: true vs 200 string masquerade)
 */

import { fetchResource } from './fetchResource';

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
  /** initialize returned a JSON-RPC result on either wire form. */
  handshakeAccepted: boolean;
  protocolVersion?: string;
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
  /** Server capabilities from the initialize result (prompts, resources, logging, ...). */
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
  }>;
  steps: McpProbeStepResult[];
  reliabilityScore: number; // 0 - 100
}

function extractJson(body?: string): any {
  if (!body) return null;
  const trimmed = body.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Attempt to locate JSON inside JSON-RPC / SSE stream chunks
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {}
    }
  }
  return null;
}

/**
 * Executes the 4-step MCP live diagnostic probe against an endpoint.
 */
export async function probeMcpServer(endpointUrl: string): Promise<McpLiveProbeResult> {
  const steps: McpProbeStepResult[] = [];
  let wireForm2026Supported = false;
  let legacyWireSupported = false;
  let authGated = false;
  let hiddenAuthGateDetected = false;
  let dishonestSchemaDetected = false;
  let inChannelErrorsVerified = false;
  let protocolVersion: string | undefined;
  const tools: McpLiveProbeResult['tools'] = [];

  // =========================================================================
  // STEP 1: Handshake Probe (Dual Wire Form)
  // =========================================================================
  const t0 = Date.now();

  // Test modern 2026-07-28 wire form with _meta and headers
  const modernInitPayload = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2026-07-28',
      _meta: { protocolVersion: '2026-07-28' },
      capabilities: { tools: { listChanged: true } },
      clientInfo: { name: 'glintbase-live-probe', version: '3.1.0' },
    },
  });

  const modernRes = await fetchResource(endpointUrl, {
    method: 'POST',
    body: modernInitPayload,
    timeoutMs: 3500,
    headers: {
      'Content-Type': 'application/json',
      'mcp-protocol-version': '2026-07-28',
      Accept: 'application/json, text/event-stream',
    },
    allowErrorBody: true,
  });

  const modernJson = extractJson(modernRes.body);
  // The server picks the version in its initialize result. Answering a 2026-07-28 request
  // with an older protocolVersion means it does NOT support the 2026-07-28 wire form.
  const modernAnswered = Boolean(modernJson?.result?.serverInfo || modernJson?.result?.protocolVersion);
  const modernSuccess = Boolean(
    modernJson?.result?.protocolVersion === '2026-07-28' ||
    (modernAnswered && modernRes.headers?.['mcp-protocol-version'] === '2026-07-28')
  );

  if (modernSuccess) {
    wireForm2026Supported = true;
    protocolVersion = '2026-07-28';
  } else if (modernAnswered && typeof modernJson?.result?.protocolVersion === 'string') {
    protocolVersion = modernJson.result.protocolVersion;
  }

  // Also probe legacy 2025-03-26 / 2024-11-05 wire form
  const legacyInitPayload = JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: { tools: { listChanged: true } },
      clientInfo: { name: 'glintbase-live-probe', version: '3.1.0' },
    },
  });

  const legacyRes = await fetchResource(endpointUrl, {
    method: 'POST',
    body: legacyInitPayload,
    timeoutMs: 3500,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    allowErrorBody: true,
  });

  const legacyJson = extractJson(legacyRes.body);
  const legacySuccess = Boolean(
    legacyJson?.result?.serverInfo ||
    legacyJson?.result?.capabilities ||
    legacyJson?.result?.protocolVersion
  );

  if (legacySuccess) {
    legacyWireSupported = true;
    if (!protocolVersion) {
      protocolVersion = legacyJson?.result?.protocolVersion || '2025-03-26';
    }
  }

  const handshakePassed = wireForm2026Supported || legacyWireSupported || modernAnswered;
  const isAuthProtected = modernRes.httpStatus === 401 || legacyRes.httpStatus === 401;
  const capabilities: Record<string, any> =
    modernJson?.result?.capabilities || legacyJson?.result?.capabilities || {};
  // Streamable HTTP servers may require the session from initialize on later requests.
  const sessionId = modernRes.headers?.['mcp-session-id'] || legacyRes.headers?.['mcp-session-id'];
  const sessionHeaders: Record<string, string> = sessionId ? { 'mcp-session-id': sessionId } : {};
  const wwwAuthenticate = modernRes.headers?.['www-authenticate'] || legacyRes.headers?.['www-authenticate'];

  if (isAuthProtected) {
    authGated = true;
  }

  steps.push({
    step: 'handshake',
    passed: handshakePassed || isAuthProtected,
    wireFormat: wireForm2026Supported ? '2026-07-28' : legacyWireSupported ? '2025-03-26' : 'unsupported',
    latencyMs: Date.now() - t0,
    httpStatus: modernRes.httpStatus || legacyRes.httpStatus,
    message: handshakePassed
      ? `Handshake accepted (2026-07-28: ${wireForm2026Supported ? 'yes' : 'no'}, legacy: ${legacyWireSupported ? 'yes' : 'no'})`
      : isAuthProtected
      ? 'Endpoint requires authentication at handshake stage'
      : 'Handshake failed or invalid JSON-RPC response',
  });

  // =========================================================================
  // STEP 2: Tools Discovery (tools/list)
  // =========================================================================
  const t1 = Date.now();
  const listPayload = JSON.stringify({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/list',
    params: {},
  });

  const listRes = await fetchResource(endpointUrl, {
    method: 'POST',
    body: listPayload,
    timeoutMs: 3500,
    headers: {
      'Content-Type': 'application/json',
      ...(wireForm2026Supported ? { 'mcp-protocol-version': '2026-07-28' } : {}),
      ...sessionHeaders,
      Accept: 'application/json, text/event-stream',
    },
    allowErrorBody: true,
  });

  const listJson = extractJson(listRes.body);
  const rawTools = Array.isArray(listJson?.result?.tools)
    ? listJson.result.tools
    : Array.isArray(listJson?.tools)
    ? listJson.tools
    : [];

  const toolsListed = Array.isArray(listJson?.result?.tools) || Array.isArray(listJson?.tools);
  const toolsListPassed = rawTools.length > 0 || (listJson?.jsonrpc === '2.0' && !listJson.error);

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
        props.every((p) => p && typeof p === 'object' && (p.type || p.enum || p.anyOf || p.oneOf || p.$ref))
      ),
      declaredRequiredCount: reqList.length,
    });
  }

  steps.push({
    step: 'tools_list',
    passed: toolsListPassed,
    latencyMs: Date.now() - t1,
    httpStatus: listRes.httpStatus,
    message: toolsListPassed
      ? `Discovered ${tools.length} declared tools`
      : 'Failed to retrieve tools catalog anonymously',
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
    const callPayload = JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: zeroArgTool.name,
        arguments: {},
      },
    });

    const callRes = await fetchResource(endpointUrl, {
      method: 'POST',
      body: callPayload,
      timeoutMs: 4000,
      headers: {
        'Content-Type': 'application/json',
        ...(wireForm2026Supported ? { 'mcp-protocol-version': '2026-07-28' } : {}),
        ...sessionHeaders,
        Accept: 'application/json, text/event-stream',
      },
      allowErrorBody: true,
    });

    const callJson = extractJson(callRes.body);

    // Check for Hidden Auth Gate: handshake passed anonymously, but call requires auth
    if (callRes.httpStatus === 401 || (callJson?.error?.code === -32001 && /auth|token|credential/i.test(callJson?.error?.message || ''))) {
      hiddenAuthGateDetected = true;
    }

    // Check for Dishonest Schema: declared 0 required args, but server complains about missing required args
    if (/missing.*required|argument.*required|validation.*failed/i.test(callJson?.error?.message || '')) {
      dishonestSchemaDetected = true;
    }

    if (callJson?.result?.content || (callJson?.jsonrpc === '2.0' && !callJson.error)) {
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
      passed: tools.length > 0, // Soft pass if tools exist but none is safe to call
      latencyMs: Date.now() - t2,
      message: tools.length === 0 ? 'Skipped: No tools discovered' : 'Skipped: No zero-argument tool annotated readOnlyHint: true',
    });
  }

  // =========================================================================
  // STEP 4: Error Channel Integrity Probe (In-channel vs 200 masquerade)
  // =========================================================================
  const t3 = Date.now();
  const canaryInvalidPayload = JSON.stringify({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: '__glintbase_canary_invalid_tool_probe__',
      arguments: {},
    },
  });

  const errRes = await fetchResource(endpointUrl, {
    method: 'POST',
    body: canaryInvalidPayload,
    timeoutMs: 3000,
    headers: {
      'Content-Type': 'application/json',
      ...sessionHeaders,
      Accept: 'application/json, text/event-stream',
    },
    allowErrorBody: true,
  });

  const errJson = extractJson(errRes.body);

  // In-channel error verification:
  // Must return valid JSON-RPC error or result.isError: true, NOT raw HTML or HTTP 200 plain text masquerade
  if (errJson) {
    if (errJson.error && typeof errJson.error === 'object') {
      inChannelErrorsVerified = true;
    } else if (errJson.result?.isError === true) {
      inChannelErrorsVerified = true;
    }
  }

  steps.push({
    step: 'error_channel',
    passed: inChannelErrorsVerified,
    latencyMs: Date.now() - t3,
    httpStatus: errRes.httpStatus,
    message: inChannelErrorsVerified
      ? 'Errors signalled properly in-channel via JSON-RPC error envelope or isError: true'
      : 'Failed: Error was masqueraded as HTTP 200 plain string, HTML, or unparseable envelope',
  });

  // =========================================================================
  // Compute Overall Reliability Score
  // =========================================================================
  let score = 0;
  if (handshakePassed) score += 30;
  if (wireForm2026Supported) score += 10;
  if (toolsListPassed) score += 25;
  if (safeCallPassed) score += 15;
  if (!hiddenAuthGateDetected) score += 5;
  if (!dishonestSchemaDetected) score += 5;
  if (inChannelErrorsVerified) score += 10;

  return {
    live: handshakePassed || isAuthProtected,
    endpoint: endpointUrl,
    handshakeAccepted: handshakePassed,
    protocolVersion,
    dualWireCompatible: wireForm2026Supported && legacyWireSupported,
    wireForm2026Supported,
    legacyWireSupported,
    authGated,
    hiddenAuthGateDetected,
    dishonestSchemaDetected,
    inChannelErrorsVerified,
    toolCount: tools.length,
    toolsListed,
    capabilities,
    wwwAuthenticate,
    safeCallTool: zeroArgTool?.name,
    tools,
    steps,
    reliabilityScore: Math.min(100, score),
  };
}
