/**
 * What kind of evidence each check rests on (Research Plan v2 §3.1):
 *
 * - `live`: the scanner sent a request and the verdict depends on how the target behaved
 *   (handshakes, canaries, negotiation, links that resolve, challenges, latency).
 * - `content`: the scanner parsed a fetched artifact (HTML, headers, OpenAPI, tool schemas).
 * - `presence`: the scanner only knows that something exists or is listed.
 * - `declared`: the value came from local codebase context, not from the live site.
 *
 * Only `live` and `content` checks feed the measured runtime pillar.
 */

import type { CheckMeasurement } from './types';

const PRESENCE = [
  // Discovery
  'ard-catalog', 'ai-catalog-published', 'ard-trust-manifest', 'chatgpt-app-listed', 'wikipedia-presence',
  'mcp-registry-listed', 'npm-sdk-package', 'agent-plugins-repo', 'skills-sh-listed',
  // Access
  'llms-txt-exists', 'markdown-url-fallback', 'openapi-spec', 'developer-portal', 'ssl-tls-enforced',
  'sitemap-xml-present', 'security-txt-rfc9116', 'llms-full-txt-present', 'plain-text-accessible',
  // Usability
  'mcp-server-manifest', 'api-sandbox-environment', 'api-graphql-schema', 'api-grpc-reflection',
  // Payments
  'acp-support', 'acp-delegate-payment', 'ucp-support', 'ap2-support', 'x402-support', 'mpp-support',
];

const LIVE = [
  // Discovery
  'brand-search-accuracy', 'agentic-search-specific', 'agentic-search-usecase',
  // Access
  'anti-spa-404', 'llms-txt-links-resolve', 'markdown-negotiation', 'markdown-negotiation-vary',
  'markdown-alternate-link', 'http2-support', 'response-latency-p95', 'status-code-accuracy',
  'dns-caa-record', 'anti-crawler-challenge-free', 'robots-edge-consistency',
  // Usability
  'mcp-tools-listing', 'mcp-auth-requirement', 'mcp-transport-streamable', 'mcp-error-reporting',
  'mcp-protocol-version', 'mcp-protocol-modern', 'mcp-wire-compatibility', 'mcp-ssrf-guard',
  'mcp-honest-schemas', 'mcp-auth-scope-challenge', 'agent-auth-www-authenticate',
  'auth-md-walkthrough-simulation',
];

const DECLARED = ['agent-rules-repo'];

const BY_ID = new Map<string, CheckMeasurement>([
  ...PRESENCE.map((id) => [id, 'presence'] as const),
  ...LIVE.map((id) => [id, 'live'] as const),
  ...DECLARED.map((id) => [id, 'declared'] as const),
]);

/** Measurement kind for a check; anything not listed parses fetched content. */
export function measurementFor(checkId: string): CheckMeasurement {
  return BY_ID.get(checkId) ?? 'content';
}

/** Checks explicitly classified as something other than `content` (for tests). */
export const EXPLICIT_MEASUREMENTS: ReadonlyMap<string, CheckMeasurement> = BY_ID;
