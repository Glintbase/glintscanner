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

  it('runs simulate_flight as a measured preview with a Mermaid visual', async () => {
    const req = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'simulate_flight',
          arguments: { target: 'https://glintbase.com', persona: 'claude-code', intent: 'what does glintbase do' },
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const content = body.result.content;
    expect(content.some((c: any) => c.type === 'image')).toBe(false);

    const summary = JSON.parse(content[0].text);
    expect(summary.persona).toBe('claude-code');
    expect(summary.mode).toBe('preview');
    expect(summary.totalHops).toBe(5); // homepage + 4 agent files, whatever the intent
    expect(summary.agentFilesChecked).toBe(4);
    expect(summary).not.toHaveProperty('schemaFrictionScore');

    const visual = content[1].text;
    expect(visual).toContain('```mermaid');
    expect(visual).toContain('N5');
    expect(visual).toContain('Preview (no agent run)');
    expect(visual).not.toContain('SPARKLES');
  });
});

