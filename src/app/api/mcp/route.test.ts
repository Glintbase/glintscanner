import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

let n = 0;
async function rpc(body: object, headers: Record<string, string> = {}) {
  // Distinct client IPs keep the in-memory rate limiter out of the way.
  const req = new NextRequest('https://scan.glintbase.dev/api/mcp', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-real-ip': `10.0.0.${++n}`, ...headers },
  });
  const res = await POST(req);
  return res.json();
}

const modernMeta = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

describe('hosted MCP route (dual-era)', () => {
  it('answers server/discover with a DiscoverResult', async () => {
    const out = await rpc(
      { jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: modernMeta } },
      { 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'server/discover' }
    );
    expect(out.result.resultType).toBe('complete');
    expect(out.result.supportedVersions[0]).toBe('2026-07-28');
    expect(out.result.supportedVersions).toContain('2025-11-25');
    expect(out.result._meta['io.modelcontextprotocol/serverInfo'].name).toBe('glintbase');
    expect(out.result.capabilities.tools).toBeDefined();
  });

  it('serves a modern tools/list statelessly', async () => {
    const out = await rpc(
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: { _meta: modernMeta } },
      { 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/list' }
    );
    expect(Array.isArray(out.result.tools)).toBe(true);
  });

  it('rejects an unknown modern version with UnsupportedProtocolVersionError', async () => {
    const out = await rpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
      params: { _meta: { ...modernMeta, 'io.modelcontextprotocol/protocolVersion': '1900-01-01' } },
    });
    expect(out.error.code).toBe(-32022);
    expect(out.error.data.supported).toContain('2026-07-28');
    expect(out.error.data.requested).toBe('1900-01-01');
  });

  it('negotiates the legacy initialize handshake instead of always answering 2024-11-05', async () => {
    const current = await rpc({ jsonrpc: '2.0', id: 4, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    expect(current.result.protocolVersion).toBe('2025-11-25');
    const old = await rpc({ jsonrpc: '2.0', id: 5, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    expect(old.result.protocolVersion).toBe('2024-11-05');
    const unknown = await rpc({ jsonrpc: '2.0', id: 6, method: 'initialize', params: { protocolVersion: '2099-01-01', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    expect(unknown.result.protocolVersion).toBe('2025-11-25');
  });
});
