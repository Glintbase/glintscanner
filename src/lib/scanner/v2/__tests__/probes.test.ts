import { describe, it, expect } from 'vitest';
import { runArs2Probes } from '../probes';

describe('ARS 2.0 4-Layer Probes Suite', () => {
  it('computes 4-layer scorecard and scales by active denominator', async () => {
    // Test using a mock URL with devtool indicators
    const scorecard = await runArs2Probes('https://example.com/docs', {
      surfaces: [
        { type: 'openapi', found: true },
        { type: 'docs', found: true },
      ],
      html: '<h1>API Documentation</h1><p>npm install example</p>',
    });

    expect(['ars-3.0.0', 'ars-2.0.0']).toContain(scorecard.version);
    expect(['devtool', 'api_devtool', 'docs_kb']).toContain(scorecard.archetype.archetype);
    expect(scorecard.activeDenominator).toBeGreaterThanOrEqual(85);
    expect(scorecard.layers.payments.applicable).toBe(false);
    expect(scorecard.score).toBeGreaterThanOrEqual(0);
    expect(scorecard.score).toBeLessThanOrEqual(100);
    expect(scorecard.remediations.length).toBeGreaterThanOrEqual(1);
  }, 25000);
});

describe('Deep MCP Server Probing Suite', () => {
  it('detects live MCP server via Server-Sent Events (SSE) stream without hanging', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = (async (input: any) => {
        const url = String(input);
        if (url.includes('/sse')) {
          return new Response('event: endpoint\ndata: /messages\n\n', {
            status: 200,
            headers: {
              'content-type': 'text/event-stream',
              'mcp-session-id': 'sess-12345',
            },
          });
        }
        return new Response('Not found', { status: 404 });
      }) as any;

      const { probeUsability } = await import('../probes/usability');
      const result = await probeUsability('https://mcp-demo.com');

      expect(result.mcpServer.live).toBe(true);
      expect(result.mcpServer.isStreamableHttp).toBe(true);
      expect(result.mcpServer.endpoint).toContain('/sse');

      const manifestCheck = result.checks.find((c) => c.checkId === 'mcp-server-manifest');
      expect(manifestCheck?.status).toBe('pass');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('detects live MCP server from JSON-RPC 2.0 error response on initialize', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = (async (input: any, init?: any) => {
        const url = String(input);
        if (url.includes('/v1/mcp') || url.includes('/api/mcp')) {
          if (init?.method === 'POST') {
            return new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                error: {
                  code: -32600,
                  message: 'Invalid Request: MCP Session Header required',
                },
              }),
              {
                status: 400,
                headers: { 'content-type': 'application/json' },
              }
            );
          }
          return new Response('Method Not Allowed', { status: 405 });
        }
        return new Response('Not found', { status: 404 });
      }) as any;

      const { probeUsability } = await import('../probes/usability');
      const result = await probeUsability('https://mcp-demo.com');

      expect(result.mcpServer.live).toBe(true);
      expect(result.mcpServer.isStreamableHttp).toBe(true);

      const manifestCheck = result.checks.find((c) => c.checkId === 'mcp-server-manifest');
      expect(manifestCheck?.status).toBe('pass');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('probes and verifies custom candidate MCP URLs supplied in localContext', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = (async (input: any, init?: any) => {
        const url = String(input);
        if (url.includes('/custom/subroute/mcp')) {
          if (init?.method === 'POST') {
            return new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                result: {
                  protocolVersion: '2024-11-05',
                  serverInfo: { name: 'demo-mcp-server', version: '1.0.0' },
                  capabilities: { tools: {} },
                  tools: [{ name: 'query_database' }, { name: 'search_docs' }],
                },
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }
            );
          }
          return new Response('POST required', { status: 405 });
        }
        return new Response('Not found', { status: 404 });
      }) as any;

      const { probeUsability } = await import('../probes/usability');
      const result = await probeUsability('https://mcp-demo.com', {
        localContext: {
          candidateMcpUrls: ['https://mcp-demo.com/custom/subroute/mcp'],
        },
      });

      expect(result.mcpServer.live).toBe(true);
      expect(result.mcpServer.endpoint).toBe('https://mcp-demo.com/custom/subroute/mcp');
      expect(result.mcpServer.toolCount).toBe(2);

      const toolsListingCheck = result.checks.find((c) => c.checkId === 'mcp-tools-listing');
      expect(toolsListingCheck?.status).toBe('pass');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
