import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { probeMcpServer } from '../mcpProbe';
import * as fetchModule from '../fetchResource';

describe('4-Step MCP Live Prober (SPEC-09)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies 2026-07-28 handshake, tools/list, safe call, and in-channel error', async () => {
    vi.spyOn(fetchModule, 'fetchResource').mockImplementation(async (url, opts) => {
      const body = opts?.body ? JSON.parse(opts.body) : {};

      // Step 1: Handshake
      if (body.method === 'initialize') {
        if (opts?.headers?.['mcp-protocol-version'] === '2026-07-28') {
          return {
            ok: true,
            status: 'ok',
            httpStatus: 200,
            headers: { 'mcp-protocol-version': '2026-07-28' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                protocolVersion: '2026-07-28',
                serverInfo: { name: 'test-mcp', version: '1.0.0' },
              },
            }),
            url,
          };
        }
        return {
          ok: true,
          status: 'ok',
          httpStatus: 200,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: { protocolVersion: '2025-03-26', serverInfo: { name: 'test-mcp' } },
          }),
          url,
        };
      }

      // Step 2: tools/list
      if (body.method === 'tools/list') {
        return {
          ok: true,
          status: 'ok',
          httpStatus: 200,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              tools: [
                {
                  name: 'get_status',
                  description: 'Returns server status',
                  inputSchema: { type: 'object', properties: {}, required: [] },
                  readOnlyHint: true,
                },
                {
                  name: 'delete_resource',
                  description: 'Deletes a resource',
                  inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
                  destructiveHint: true,
                },
              ],
            },
          }),
          url,
        };
      }

      // Step 3: tools/call on get_status
      if (body.method === 'tools/call' && body.params?.name === 'get_status') {
        return {
          ok: true,
          status: 'ok',
          httpStatus: 200,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: { content: [{ type: 'text', text: 'operational' }] },
          }),
          url,
        };
      }

      // Step 4: canary invalid tool error channel
      if (body.method === 'tools/call' && body.params?.name === '__glintbase_canary_invalid_tool_probe__') {
        return {
          ok: false,
          status: 'ok',
          httpStatus: 200,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            error: { code: -32601, message: 'Tool not found' },
          }),
          url,
        };
      }

      return { ok: false, status: 'unreachable', url };
    });

    const result = await probeMcpServer('https://mcp.example.com/api/mcp');

    expect(result.live).toBe(true);
    expect(result.wireForm2026Supported).toBe(true);
    expect(result.protocolVersion).toBe('2026-07-28');
    expect(result.toolCount).toBe(2);
    expect(result.tools[0].readOnly).toBe(true);
    expect(result.tools[1].destructive).toBe(true);
    expect(result.inChannelErrorsVerified).toBe(true);
    expect(result.hiddenAuthGateDetected).toBe(false);
    expect(result.reliabilityScore).toBeGreaterThanOrEqual(90);
  });

  it('detects hidden auth gates and dishonest schemas', async () => {
    vi.spyOn(fetchModule, 'fetchResource').mockImplementation(async (url, opts) => {
      const body = opts?.body ? JSON.parse(opts.body) : {};

      if (body.method === 'initialize') {
        return {
          ok: true,
          status: 'ok',
          httpStatus: 200,
          body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { serverInfo: { name: 'trap-mcp' } } }),
          url,
        };
      }

      if (body.method === 'tools/list') {
        return {
          ok: true,
          status: 'ok',
          httpStatus: 200,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              tools: [
                {
                  name: 'dishonest_tool',
                  description: 'Claims 0 required args',
                  inputSchema: { type: 'object', properties: {}, required: [] },
                  annotations: { readOnlyHint: true },
                },
              ],
            },
          }),
          url,
        };
      }

      if (body.method === 'tools/call' && body.params?.name === 'dishonest_tool') {
        return {
          ok: false,
          status: 'ok',
          httpStatus: 200,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            error: { code: -32602, message: 'Missing required argument: apiKey' },
          }),
          url,
        };
      }

      // Non-channel error (raw HTML string in 200 OK)
      return {
        ok: true,
        status: 'ok',
        httpStatus: 200,
        body: '<html>Error 404: Unknown Tool</html>',
        url,
      };
    });

    const result = await probeMcpServer('https://trap.example.com/api/mcp');

    expect(result.live).toBe(true);
    expect(result.dishonestSchemaDetected).toBe(true);
    expect(result.inChannelErrorsVerified).toBe(false);
    expect(result.safeCallTool).toBe('dishonest_tool');
    expect(result.reliabilityScore).toBeLessThan(80);
  });
});

describe('MCP prober safety', () => {
  afterEach(() => vi.restoreAllMocks());

  it('never calls tools that are not annotated readOnlyHint: true', async () => {
    const calledTools: string[] = [];
    vi.spyOn(fetchModule, 'fetchResource').mockImplementation(async (url, opts) => {
      const body = opts?.body ? JSON.parse(opts.body) : {};
      if (body.method === 'initialize') {
        return { ok: true, status: 'ok', httpStatus: 200, url, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { serverInfo: { name: 'x' } } }) };
      }
      if (body.method === 'tools/list') {
        return {
          ok: true, status: 'ok', httpStatus: 200, url,
          body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [
            { name: 'get_everything', inputSchema: { type: 'object', properties: {} } },
            { name: 'reset_account', inputSchema: { type: 'object', properties: {} } },
          ] } }),
        };
      }
      if (body.method === 'tools/call') calledTools.push(body.params?.name);
      return { ok: true, status: 'ok', httpStatus: 200, url, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Unknown tool' } }) };
    });

    const result = await probeMcpServer('https://mcp.example.com/api/mcp');

    expect(result.safeCallTool).toBeUndefined();
    expect(calledTools).toEqual(['__glintbase_canary_invalid_tool_probe__']);
    expect(result.tools.every((t) => !t.annotatedReadOnly)).toBe(true);
  });
});

describe('MCP prober protocol negotiation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not claim 2026-07-28 support when the server answers with an older version', async () => {
    vi.spyOn(fetchModule, 'fetchResource').mockImplementation(async (url, opts) => {
      const body = opts?.body ? JSON.parse(opts.body) : {};
      const reply = (payload: any) => ({ ok: true, status: 'ok' as const, httpStatus: 200, url, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, ...payload }) });
      if (body.method === 'initialize') return reply({ result: { protocolVersion: '2024-11-05', serverInfo: { name: 'old' }, capabilities: {} } });
      if (body.method === 'tools/list') return reply({ result: { tools: [] } });
      return reply({ error: { code: -32601, message: 'Unknown tool' } });
    });

    const result = await probeMcpServer('https://mcp.example.com/mcp');

    expect(result.handshakeAccepted).toBe(true);
    expect(result.wireForm2026Supported).toBe(false);
    expect(result.dualWireCompatible).toBe(false);
    expect(result.protocolVersion).toBe('2024-11-05');
  });
});
