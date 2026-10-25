import { describe, it, expect, vi, afterEach } from 'vitest';
import { signInternalRequest, verifyInternalRequest, INTERNAL_SIGNATURE_MAX_SKEW_MS } from '../internalAuth';
import { runWithScannerIdentity, currentScannerUserAgent, SCANNER_USER_AGENTS, fetchResource } from '../v2/fetchResource';

describe('internal request signatures', () => {
  const secret = 'test-secret';
  const body = '{"url":"https://example.com"}';
  const now = 1_800_000_000_000;
  const ts = String(now);

  it('accepts a correctly signed, fresh request', () => {
    expect(verifyInternalRequest(secret, ts, signInternalRequest(secret, ts, body), body, now)).toBe(true);
  });

  it('rejects a wrong secret, a changed body, a stale timestamp or a missing secret', () => {
    const sig = signInternalRequest(secret, ts, body);
    expect(verifyInternalRequest('other', ts, sig, body, now)).toBe(false);
    expect(verifyInternalRequest(secret, ts, sig, body + ' ', now)).toBe(false);
    expect(verifyInternalRequest(secret, ts, sig, body, now + INTERNAL_SIGNATURE_MAX_SKEW_MS + 1)).toBe(false);
    expect(verifyInternalRequest(undefined, ts, sig, body, now)).toBe(false);
    expect(verifyInternalRequest(secret, ts, 'not-hex', body, now)).toBe(false);
  });
});

describe('scanner identity', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the override inside runWithScannerIdentity and the default outside it', async () => {
    const seen: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      seen.push(String((init?.headers as Record<string, string>)['User-Agent']));
      return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
    });
    await runWithScannerIdentity('agent', () => fetchResource('https://example.com/a'));
    await fetchResource('https://example.com/b');
    expect(seen[0]).toBe(SCANNER_USER_AGENTS.agent);
    expect(seen[1]).toBe(currentScannerUserAgent());
  });

  it('keeps concurrent scans on their own identities', async () => {
    const [a, b] = await Promise.all([
      runWithScannerIdentity('agent', async () => {
        await new Promise((r) => setTimeout(r, 10));
        return currentScannerUserAgent();
      }),
      runWithScannerIdentity('browser', async () => currentScannerUserAgent()),
    ]);
    expect(a).toBe(SCANNER_USER_AGENTS.agent);
    expect(b).toBe(SCANNER_USER_AGENTS.browser);
  });
});
