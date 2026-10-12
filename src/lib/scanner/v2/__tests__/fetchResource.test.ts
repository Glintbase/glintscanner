import { describe, it, expect, afterEach } from 'vitest';
import { fetchResource, sseHasJsonData } from '../fetchResource';

const enc = new TextEncoder();
const realFetch = globalThis.fetch;

function streamOf(chunks: string[], { keepOpen = false, delayMs = 5 } = {}) {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const c of chunks) {
        await new Promise((r) => setTimeout(r, delayMs));
        if (cancelled) return;
        controller.enqueue(enc.encode(c));
      }
      if (!keepOpen) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, wasCancelled: () => cancelled };
}

function stubFetch(make: () => Response) {
  globalThis.fetch = (async () => make()) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('sseHasJsonData', () => {
  it('only matches data lines carrying a JSON object', () => {
    expect(sseHasJsonData(': ping\n\n')).toBe(false);
    expect(sseHasJsonData('event: endpoint\ndata: /messages?id=1\n\n')).toBe(false);
    expect(sseHasJsonData('data: {"jsonrpc":"2.0"')).toBe(false);
    expect(sseHasJsonData('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n')).toBe(true);
  });
});

describe('fetchResource SSE reader', () => {
  it('keeps reading past a priming event until the JSON data event arrives, then cancels', async () => {
    const { stream, wasCancelled } = streamOf(
      [': priming\n\n', 'event: endpoint\ndata: /mcp/messages\n\n', 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\n\n', 'data: {"late":true}\n\n'],
      { keepOpen: true, delayMs: 20 }
    );
    stubFetch(() => new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }));

    const r = await fetchResource('https://acme.dev/mcp', { method: 'POST', body: '{}' });
    expect(r.ok).toBe(true);
    expect(r.body).toContain('"result":{"tools":[]}');
    expect(r.body).not.toContain('late');
    expect(wasCancelled()).toBe(true);
  });

  it('returns within the time budget when the stream never sends JSON', async () => {
    const { stream } = streamOf([': ping\n\n'], { keepOpen: true });
    stubFetch(() => new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }));

    const started = Date.now();
    const r = await fetchResource('https://acme.dev/sse', { timeoutMs: 300 });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(r.body).toContain(': ping');
  });
});

describe('fetchResource body cap', () => {
  it('aborts a streaming body once maxBytes is exceeded and reports too_large', async () => {
    const { stream, wasCancelled } = streamOf(['a'.repeat(600), 'b'.repeat(600), 'c'.repeat(600)], { keepOpen: true });
    stubFetch(() => new Response(stream, { status: 200, headers: { 'content-type': 'text/plain' } }));

    const r = await fetchResource('https://acme.dev/big.txt', { maxBytes: 1000 });
    expect(r.ok).toBe(false);
    expect(r.status).toBe('too_large');
    expect(r.bytes).toBeGreaterThan(1000);
    expect(r.body).toBeUndefined();
    expect(wasCancelled()).toBe(true);
  });

  it('returns bodies under the cap unchanged', async () => {
    stubFetch(() => new Response('User-agent: *\nAllow: /\n', { status: 200, headers: { 'content-type': 'text/plain' } }));
    const r = await fetchResource('https://acme.dev/robots.txt', { maxBytes: 1000 });
    expect(r.ok).toBe(true);
    expect(r.body).toBe('User-agent: *\nAllow: /\n');
  });
});
