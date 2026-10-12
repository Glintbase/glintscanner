import { describe, it, expect } from 'vitest';
import { POST } from '../route';

const call = (name: string, args: Record<string, unknown> = {}) =>
  POST(
    new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } }),
    }) as any
  );

describe('/api/mcp tools/call target validation', () => {
  for (const tool of ['get_score', 'audit', 'simulate_flight', 'discover_surfaces', 'glintbase_get_score']) {
    it(`${tool} without a target is an invalid-params error (no default site)`, async () => {
      const res = await call(tool);
      const json = await res.json();
      expect(json.id).toBe(7);
      expect(json.error?.code).toBe(-32602);
      expect(JSON.stringify(json)).not.toContain('stripe.com');
    });
  }

  it('rejects a blank target too', async () => {
    const json = await (await call('get_score', { target: '   ' })).json();
    expect(json.error?.code).toBe(-32602);
  });
});
