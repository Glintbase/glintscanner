import { describe, it, expect } from 'vitest';
import { GET, POST } from '../route';
import { NextRequest } from 'next/server';

describe('MCP Route Test', () => {
  it('handles GET request without crashing', async () => {
    const req = new NextRequest('http://localhost:3000/api/mcp');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.server).toBe('glintbase-hosted-mcp');
  });

  it('handles POST ping without crashing', async () => {
    const req = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toEqual({});
  });

  it('handles POST prompts/list', async () => {
    const req = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'prompts/list' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.prompts.length).toBeGreaterThan(0);
  });

  it('handles POST resources/list', async () => {
    const req = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'resources/list' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.resources.length).toBeGreaterThan(0);
  });

  it('runs simulate_flight with overview intent (claude-code) returning Mermaid visual without XML dump or SPARKLES', async () => {
    const req = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'simulate_flight',
          arguments: {
            target: 'https://glintbase.com',
            persona: 'claude-code',
            intent: 'what does glintbase do',
          },
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();

    // Check content blocks
    const content = body.result.content;
    expect(content.some((c: any) => c.type === 'image')).toBe(false); // No unsupported image/svg+xml block!

    const summary = JSON.parse(content[0].text);
    expect(summary.persona).toBe('claude-code');
    expect(summary.totalHops).toBe(4);

    const visual = content[1].text;
    expect(visual).toContain('```mermaid');
    expect(visual).toContain('flowchart LR');
    expect(visual).toContain('N4');
    expect(visual).not.toContain('SPARKLES');
    expect(visual).not.toContain('```xml');
  });

  it('differentiates flight simulation for auth intent (cursor) vs overview intent', async () => {
    const req = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'simulate_flight',
          arguments: {
            target: 'https://glintbase.com',
            persona: 'cursor',
            intent: 'how do I authenticate with the API',
          },
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const content = body.result.content;
    const summary = JSON.parse(content[0].text);

    expect(summary.persona).toBe('cursor');
    expect(summary.totalHops).toBe(6); // 6 hops for auth, distinct from overview (4 hops)
    expect(summary.totalTokensBurned).not.toBe(6900); // Dynamic tokens

    const visual = content[1].text;
    expect(visual).toContain('AUTH');
    expect(visual).not.toContain('SPARKLES');
  });
});

