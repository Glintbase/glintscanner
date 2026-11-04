/**
 * Unit tests must not depend on live websites: unmocked fetches fail fast.
 * Set ALLOW_NETWORK_TESTS=1 to run against the real network locally.
 */
import { afterEach, beforeEach } from 'vitest';
import { resetWellKnownControlCache } from '../src/lib/scanner/v2/wellKnown';

const realFetch = globalThis.fetch;

beforeEach(() => {
  // The .well-known catch-all control is cached per origin; fixtures reuse origins with different mocks.
  resetWellKnownControlCache();
  if (process.env.ALLOW_NETWORK_TESTS === '1') return;
  globalThis.fetch = (async (input: any) => {
    throw new Error(`Network access blocked in tests: ${String(input?.url ?? input)}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});
