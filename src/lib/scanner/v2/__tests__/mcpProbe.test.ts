import { describe, it, expect, vi, beforeEach } from 'vitest';
import { probeMcpServer } from '../mcpProbe';
import * as fetchModule from '../fetchResource';
import type { FetchResourceResult } from '../fetchResource';

type Req = { body: any; headers: Record<string, string> };
type Handler = (req: Req) => Partial<FetchResourceResult> | undefined;

const CANARY = '__glintbase_canary_invalid_tool_probe__';

/** Mocks fetchResource with a fixture MCP server; records every JSON-RPC request. */
function fixtureServer(handler: Handler) {
  const requests: Req[] = [];
  vi.spyOn(fetchModule, 'fetchResource').mockImplementation(async (url, opts) => {
    const req = { body: opts?.body ? JSON.parse(opts.body) : {}, headers: opts?.headers || {} };
    requests.push(req);
    const res = handler(req) || { httpStatus: 404, body: 'Not Found' };
    return { ok: (res.httpStatus ?? 200) < 400, status: 'ok', httpStatus: 200, url, ...res } as FetchResourceResult;
  });
  return requests;
}

const rpc = (id: any, payload: object) => ({ httpStatus: 200, body: JSON.stringify({ jsonrpc: '2.0', id, ...payload }) });
const methodNotFound = (id: any) => rpc(id, { error: { code: -32601, message: 'Method not found' } });

const TOOLS = [
  { name: 'get_status', description: 'Status', inputSchema: { type: 'object', properties: {}, required: [] }, annotations: { readOnlyHint: true } },
  { name: 'delete_item', description: 'Delete', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, annotations: { destructiveHint: true } },
];

/** A well-behaved tools/list + tools/call implementation shared by the fixtures. */
function toolMethods(req: Req) {
  const { method, id, params } = req.body;
  if (method === 'tools/list') return rpc(id, { result: { tools: TOOLS } });
  if (method === 'tools/call' && params?.name === 'get_status') return rpc(id, { result: { content: [{ type: 'text', text: 'ok' }] } });
  if (method === 'tools/call') return rpc(id, { error: { code: -32602, message: `Unknown tool: ${params?.name}` } });
  return undefined;
}

describe('dual-era MCP live prober', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('detects a modern-only 2026-07-28 server via server/discover and uses modern request shape', async () => {
    const requests = fixtureServer((req) => {
      const { method, id } = req.body;
      if (method === 'server/discover') {
        return rpc(id, { result: { supportedVersions: ['2026-07-28'], capabilities: { tools: {}, logging: {} } } });
      }
      if (method === 'initialize') return rpc(id, { error: { code: -32601, message: 'initialize removed' } });
      return toolMethods(req);
    });

    const result = await probeMcpServer('https://mcp.example.com/mcp');

    expect(result.era).toBe('modern');
    expect(result.handshakeAccepted).toBe(true);
    expect(result.wireForm2026Supported).toBe(true);
    expect(result.protocolVersion).toBe('2026-07-28');
    expect(result.supportedVersions).toEqual(['2026-07-28']);
    expect(result.dualWireCompatible).toBe(false);
    expect(result.capabilities.logging).toBeDefined();
    expect(result.toolsListed).toBe(true);
    expect(result.toolCount).toBe(2);
    expect(result.inChannelErrorsVerified).toBe(true);
    expect(result.safeCallTool).toBe('get_status');
    // A modern-only server is never sent initialize.
    expect(requests.some((r) => r.body.method === 'initialize')).toBe(false);
    const list = requests.find((r) => r.body.method === 'tools/list')!;
    expect(list.headers['mcp-protocol-version']).toBe('2026-07-28');
    expect(list.headers['mcp-method']).toBe('tools/list');
    expect(list.body.params._meta['io.modelcontextprotocol/protocolVersion']).toBe('2026-07-28');
    const canary = requests.find((r) => r.body.params?.name === CANARY)!;
    expect(canary.headers['mcp-name']).toBe(CANARY);
  });

  it('marks a modern server dual-era only when it also completes a legacy initialize', async () => {
    fixtureServer((req) => {
      const { method, id } = req.body;
      if (method === 'server/discover') return rpc(id, { result: { supportedVersions: ['2026-07-28', '2025-11-25'] } });
      if (method === 'initialize') return rpc(id, { result: { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'x' } } });
      return toolMethods(req);
    });

    const result = await probeMcpServer('https://mcp.example.com/mcp');

    expect(result.era).toBe('modern');
    expect(result.dualWireCompatible).toBe(true);
    expect(result.legacyWireSupported).toBe(true);
    expect(result.protocolVersion).toBe('2026-07-28');
  });

  it('falls back to initialize for a legacy server, forwarding the session and negotiated version', async () => {
    const requests = fixtureServer((req) => {
      const { method, id } = req.body;
      if (method === 'server/discover') return methodNotFound(id);
      if (method === 'initialize') {
        return {
          ...rpc(id, { result: { protocolVersion: '2025-11-25', capabilities: { prompts: {} }, serverInfo: { name: 'legacy' } } }),
          headers: { 'mcp-session-id': 'sess-123' },
        };
      }
      if (method === 'notifications/initialized') return { httpStatus: 202, body: '' };
      if (req.headers['mcp-session-id'] !== 'sess-123') return { httpStatus: 400, body: 'missing session' };
      return toolMethods(req);
    });

    const result = await probeMcpServer('https://legacy.example.com/mcp');

    expect(result.era).toBe('legacy');
    expect(result.wireForm2026Supported).toBe(false);
    expect(result.legacyWireSupported).toBe(true);
    expect(result.protocolVersion).toBe('2025-11-25');
    expect(result.capabilities.prompts).toBeDefined();
    expect(result.toolsListed).toBe(true);
    expect(result.inChannelErrorsVerified).toBe(true);
    const list = requests.find((r) => r.body.method === 'tools/list')!;
    expect(list.headers['mcp-session-id']).toBe('sess-123');
    expect(list.headers['mcp-protocol-version']).toBe('2025-11-25');
    expect(list.body.params._meta).toBeUndefined();
    expect(requests.some((r) => r.body.method === 'notifications/initialized')).toBe(true);
  });

  it('retries initialize with 2025-03-26 when an older server rejects 2025-11-25', async () => {
    fixtureServer((req) => {
      const { method, id, params } = req.body;
      if (method === 'server/discover') return methodNotFound(id);
      if (method === 'initialize' && params.protocolVersion === '2025-11-25') {
        return rpc(id, { error: { code: -32602, message: 'Unsupported protocol version' } });
      }
      if (method === 'initialize') return rpc(id, { result: { protocolVersion: '2024-11-05', capabilities: {} } });
      return toolMethods(req);
    });

    const result = await probeMcpServer('https://old.example.com/mcp');

    expect(result.handshakeAccepted).toBe(true);
    expect(result.protocolVersion).toBe('2024-11-05');
    expect(result.wireForm2026Supported).toBe(false);
    expect(result.dualWireCompatible).toBe(false);
  });

  it('does not count a legacy server that claims 2026-07-28 in initialize as modern', async () => {
    fixtureServer((req) => {
      const { method, id } = req.body;
      if (method === 'server/discover') return methodNotFound(id);
      if (method === 'initialize') return rpc(id, { result: { protocolVersion: '2026-07-28', capabilities: {} } });
      return toolMethods(req);
    });

    const result = await probeMcpServer('https://claims.example.com/mcp');

    expect(result.era).toBe('legacy');
    expect(result.wireForm2026Supported).toBe(false);
  });

  it('reports an auth-gated server without a handshake and keeps the WWW-Authenticate challenge', async () => {
    const challenge = 'Bearer resource_metadata="https://auth.example.com/.well-known/oauth-protected-resource"';
    const requests = fixtureServer(() => ({ httpStatus: 401, body: '', headers: { 'www-authenticate': challenge } }));

    const result = await probeMcpServer('https://gated.example.com/mcp');

    expect(result.live).toBe(true);
    expect(result.authGated).toBe(true);
    expect(result.handshakeAccepted).toBe(false);
    expect(result.wwwAuthenticate).toBe(challenge);
    expect(result.toolsListed).toBe(false);
    // Nothing beyond the first challenge is sent.
    expect(requests).toHaveLength(1);
  });

  it('parses JSON-RPC responses delivered as an SSE stream', async () => {
    const sse = (id: number, payload: object) => ({
      httpStatus: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress' })}\n\nevent: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, ...payload })}\n\n`,
    });
    fixtureServer((req) => {
      const { method, id } = req.body;
      if (method === 'server/discover') return sse(id, { result: { supportedVersions: ['2026-07-28'] } });
      if (method === 'tools/list') return sse(id, { result: { tools: TOOLS } });
      if (method === 'tools/call') return sse(id, { result: { isError: true, content: [{ type: 'text', text: 'nope' }] } });
      return undefined;
    });

    const result = await probeMcpServer('https://sse.example.com/mcp');

    expect(result.era).toBe('modern');
    expect(result.toolCount).toBe(2);
    expect(result.inChannelErrorsVerified).toBe(true);
  });

  it('flags an HTTP 200 error masquerade and dishonest schemas', async () => {
    fixtureServer((req) => {
      const { method, id, params } = req.body;
      if (method === 'server/discover') return methodNotFound(id);
      if (method === 'initialize') return rpc(id, { result: { protocolVersion: '2025-03-26', capabilities: {} } });
      if (method === 'tools/list') {
        return rpc(id, {
          result: {
            tools: [{ name: 'dishonest_tool', inputSchema: { type: 'object', properties: {}, required: [] }, annotations: { readOnlyHint: true } }],
          },
        });
      }
      if (method === 'tools/call' && params.name === 'dishonest_tool') {
        return rpc(id, { error: { code: -32602, message: 'Validation failed: missing required argument "query"' } });
      }
      if (method === 'tools/call') return { httpStatus: 200, body: 'Error: tool not found' };
      return undefined;
    });

    const result = await probeMcpServer('https://bad.example.com/mcp');

    expect(result.dishonestSchemaDetected).toBe(true);
    expect(result.safeCallTool).toBe('dishonest_tool');
    expect(result.inChannelErrorsVerified).toBe(false);
    expect(result.reliabilityScore).toBeLessThan(80);
  });

  it('never calls tools that are not annotated readOnlyHint: true', async () => {
    const requests = fixtureServer((req) => {
      const { method, id } = req.body;
      if (method === 'server/discover') return rpc(id, { result: { supportedVersions: ['2026-07-28'] } });
      if (method === 'tools/list') {
        return rpc(id, {
          result: {
            tools: [
              { name: 'get_records', inputSchema: { type: 'object', properties: {} } },
              { name: 'list_users', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: false } },
            ],
          },
        });
      }
      if (method === 'tools/call') return rpc(id, { error: { code: -32602, message: 'Unknown tool' } });
      return undefined;
    });

    const result = await probeMcpServer('https://mcp.example.com/mcp');

    const calledTools = requests.filter((r) => r.body.method === 'tools/call').map((r) => r.body.params.name);
    expect(result.safeCallTool).toBeUndefined();
    expect(calledTools).toEqual([CANARY]);
    expect(result.tools.every((t) => !t.annotatedReadOnly)).toBe(true);
  });

  it('records tool definition size and declared schema dialects', async () => {
    fixtureServer((req) => {
      const { method, id } = req.body;
      if (method === 'server/discover') return rpc(id, { result: { supportedVersions: ['2026-07-28'] } });
      if (method === 'tools/list') {
        return rpc(id, {
          result: {
            tools: [
              { name: 'a', inputSchema: { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties: {} } },
              { name: 'b', inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: {} } },
              { name: 'c', inputSchema: { type: 'object', properties: {} } },
            ],
          },
        });
      }
      return rpc(id, { error: { code: -32602, message: 'Unknown tool' } });
    });

    const result = await probeMcpServer('https://mcp.example.com/mcp');

    expect(result.toolDefinitionChars).toBeGreaterThan(100);
    expect(result.tools.map((t) => t.schemaDialect)).toEqual([
      'http://json-schema.org/draft-07/schema#',
      'https://json-schema.org/draft/2020-12/schema',
      undefined,
    ]);
  });

  it('reports no handshake for an endpoint that does not speak MCP', async () => {
    const requests = fixtureServer(() => ({ httpStatus: 200, body: '<html><body>Hello</body></html>' }));

    const result = await probeMcpServer('https://www.example.com/mcp');

    expect(result.live).toBe(false);
    expect(result.handshakeAccepted).toBe(false);
    expect(result.inChannelErrorsVerified).toBe(false);
    expect(result.reliabilityScore).toBe(0);
    // server/discover plus initialize (and its retry is not triggered without a JSON-RPC error).
    expect(requests.map((r) => r.body.method)).toEqual(['server/discover', 'initialize']);
  });
});
