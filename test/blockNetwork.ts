/**
 * Unit tests must not depend on live websites: unmocked fetches fail fast.
 * Set ALLOW_NETWORK_TESTS=1 to run against the real network locally.
 */
import { afterEach, beforeEach } from 'vitest';

const realFetch = globalThis.fetch;

beforeEach(() => {
  if (process.env.ALLOW_NETWORK_TESTS === '1') return;
  globalThis.fetch = (async (input: any) => {
    throw new Error(`Network access blocked in tests: ${String(input?.url ?? input)}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});
