/**
 * ARS Report — AI-Native Journey Pack (v1.0)
 *
 * 10 universal, product-agnostic benchmarks for the "State of Agent Readiness 2026" report.
 * These apply across ALL AI company types — model providers, vector DBs, orchestration
 * frameworks, observability tools, agents platforms, and more.
 *
 * Load via:  JOURNEY_PACK=ai-native (env var) or --pack ai-native (CLI flag)
 *
 * Each benchmark maps to a `JourneyDef` as defined in journey.ts.
 * These are deliberately NOT merged into JOURNEYS to avoid modifying existing code.
 */

// Re-use the JourneyDef interface shape from journey.ts without importing it
// (keeps this file as a zero-dependency peer module)
interface JourneyDef {
  id: string;
  label: string;
  goal: string;
  mode: 'canonical' | 'recovery' | 'ambiguous';
  startTypes: string[];
  targetNodeId?: string;
  targetType?: string;
  preferMachineStart?: boolean;
  intentKeywords: string[];
  maxHops: number;
  requireEvidence?: boolean;
}

// ─── Dependency Map ───────────────────────────────────────────────────────────
// If none of the surface kinds in the array are present in the scan,
// that benchmark is skipped and logged as "surface_unavailable".
// A skip is still a finding — the absence of a changelog surface IS the data point.

export const AI_NATIVE_DEPENDENCIES: Record<string, string[]> = {
  cold_start_discoverability:    [],                                    // Always runs
  machine_entrypoint_quality:    [],                                    // Always runs
  auth_path_completeness:        ['auth', 'docs', 'landing', 'api'],
  quickstart_completeness:       ['docs', 'landing'],
  sdk_discoverability:           ['sdk', 'docs', 'github'],
  api_reference_navigability:    ['api', 'openapi', 'docs'],
  core_concept_disambiguation:   ['docs', 'landing'],                   // Intentionally broad
  error_surface_completeness:    ['docs', 'api', 'support'],
  rate_limit_transparency:       ['api', 'docs', 'support'],
  versioning_change_signal:      ['changelog', 'docs', 'github'],
};

// ─── The 10 Benchmarks ────────────────────────────────────────────────────────

export const AI_NATIVE_JOURNEYS: JourneyDef[] = [

  // ── TIER 1: DISCOVERY & ENTRY ─────────────────────────────────────────────

  {
    id: 'cold_start_discoverability',
    label: 'B-01: Cold Start Discoverability',
    goal: 'Starting from the root domain with zero prior context, locate the canonical developer entry point in ≤ 3 hops.',
    mode: 'canonical',
    startTypes: ['page', 'canonical_link'],
    targetType: 'canonical_link',
    intentKeywords: [
      'docs', 'api', 'developer', 'documentation', 'reference',
      'getting started', 'quickstart', 'platform', 'developers',
    ],
    maxHops: 3,
  },

  {
    id: 'machine_entrypoint_quality',
    label: 'B-02: Machine Entrypoint Quality',
    goal: 'Locate a machine-readable entrypoint (llms.txt, OpenAPI, MCP) AND verify it has substantive content — not a soft-404 or empty shell.',
    mode: 'canonical',
    startTypes: ['page', 'canonical_link', 'machine_entrypoint'],
    targetType: 'machine_entrypoint',
    preferMachineStart: true,
    intentKeywords: [
      'llms.txt', 'openapi', 'openapi.json', 'swagger', 'mcp', 'sitemap',
      'machine', 'api spec', 'specification', 'schema',
    ],
    maxHops: 4,
    requireEvidence: true,
  },

  {
    id: 'auth_path_completeness',
    label: 'B-03: Authentication Path Completeness',
    goal: 'Navigate to authentication documentation AND find all three components co-located or within 2 hops: (1) where to get credentials, (2) the header/parameter format, (3) a working code example with auth.',
    mode: 'canonical',
    startTypes: ['canonical_link', 'page', 'machine_entrypoint'],
    targetNodeId: 'concept:authentication',
    intentKeywords: [
      'auth', 'api key', 'token', 'credential', 'oauth', 'bearer',
      'authentication', 'authorization', 'secret', 'api-key', 'access token',
    ],
    maxHops: 6,
    requireEvidence: true,
  },

  // ── TIER 2: CORE INTEGRATION LOOP ────────────────────────────────────────

  {
    id: 'quickstart_completeness',
    label: 'B-04: Quickstart Completeness',
    goal: 'Navigate the full quickstart path as a connected graph: install → authenticate → make primary call → validate response. Every step must link to the next.',
    mode: 'canonical',
    startTypes: ['canonical_link', 'page', 'machine_entrypoint'],
    targetType: 'workflow',
    intentKeywords: [
      'quickstart', 'getting started', 'quick start', 'tutorial',
      'hello world', 'first call', 'introduction', 'onboarding', '5 minutes',
    ],
    maxHops: 7,
    requireEvidence: true,
  },

  {
    id: 'sdk_discoverability',
    label: 'B-05: SDK & Library Discoverability',
    goal: 'Locate SDK/client library documentation including: which languages are officially supported, the install command, and the basic initialization code — all without leaving the primary docs surface.',
    mode: 'canonical',
    startTypes: ['canonical_link', 'page', 'machine_entrypoint'],
    targetType: 'sdk',
    targetNodeId: 'concept:sdk_usage',
    intentKeywords: [
      'sdk', 'client', 'library', 'npm', 'pip', 'install', 'package',
      'python', 'javascript', 'typescript', 'go', 'ruby', 'java',
    ],
    maxHops: 6,
    requireEvidence: true,
  },

  {
    id: 'api_reference_navigability',
    label: 'B-06: API Reference Navigability',
    goal: 'From the docs root or machine entrypoint, navigate to a concrete, actionable API operation — not just a landing page, but an actual endpoint with parameters, request/response schema, and at least one example.',
    mode: 'canonical',
    startTypes: ['canonical_link', 'machine_entrypoint', 'page'],
    targetType: 'operation',
    intentKeywords: [
      'api reference', 'endpoints', 'api docs', 'rest api', 'http',
      'request', 'response', 'parameters', 'schema', 'endpoint',
    ],
    maxHops: 5,
    requireEvidence: true,
  },

  {
    id: 'core_concept_disambiguation',
    label: 'B-07: Core Concept Disambiguation',
    goal: 'An agent has a conceptual task (e.g. "process data in batches", "handle async operations", "paginate results"). Navigate from conceptual intent to a specific code-level solution — without knowing the company\'s specific terminology.',
    mode: 'ambiguous',
    startTypes: ['canonical_link', 'page', 'machine_entrypoint'],
    targetType: 'concept',
    intentKeywords: [
      'batch', 'async', 'retry', 'pagination', 'streaming', 'rate limit',
      'timeout', 'error', 'callback', 'webhook', 'queue', 'cursor',
    ],
    maxHops: 8,
    requireEvidence: true,
  },

  // ── TIER 3: PRODUCTION RESILIENCE ─────────────────────────────────────────

  {
    id: 'error_surface_completeness',
    label: 'B-08: Error Surface Completeness',
    goal: 'Starting from an error state, navigate to: (1) error code reference, (2) specific meaning of that error, (3) actionable resolution path — all three, not just a generic error page.',
    mode: 'recovery',
    startTypes: ['support_path', 'canonical_link', 'page'],
    targetNodeId: 'concept:error_handling',
    intentKeywords: [
      'error', 'errors', 'status codes', 'error codes', 'troubleshooting',
      '4xx', '5xx', '400', '401', '403', '404', '429', '500', 'failed', 'failure',
    ],
    maxHops: 6,
    requireEvidence: true,
  },

  {
    id: 'rate_limit_transparency',
    label: 'B-09: Rate Limit & Quota Transparency',
    goal: 'Locate: (1) specific rate limits (RPM/TPM or equivalent), (2) the backoff/retry strategy expected, (3) whether limits are exposed programmatically via headers or a limits endpoint — all without contacting sales.',
    mode: 'recovery',
    startTypes: ['support_path', 'canonical_link', 'page', 'api'],
    targetNodeId: 'concept:rate_limiting',
    intentKeywords: [
      'rate limit', 'rate limits', 'quota', 'throttle', 'throttling',
      'requests per minute', 'rpm', 'tpm', 'tokens per minute',
      'retry-after', 'backoff', '429', 'too many requests',
    ],
    maxHops: 5,
    requireEvidence: true,
  },

  {
    id: 'versioning_change_signal',
    label: 'B-10: Versioning & Change Signal Clarity',
    goal: 'Agent locates: (1) current API version, (2) a changelog or release notes surface, (3) whether deprecated endpoints are flagged in the API reference itself — not just in a separate changelog.',
    mode: 'canonical',
    startTypes: ['canonical_link', 'page', 'machine_entrypoint'],
    targetNodeId: 'concept:api_versioning',
    intentKeywords: [
      'changelog', 'release notes', 'breaking changes', 'deprecated',
      'deprecation', 'versioning', 'api version', 'migration', 'upgrade',
      'what\'s new', 'updates', 'v1', 'v2', 'version',
    ],
    maxHops: 6,
    requireEvidence: true,
  },
];

// ─── Export helpers ───────────────────────────────────────────────────────────

export const PACK_NAME = 'ai-native';
export const PACK_VERSION = '1.0';
export const PACK_LABEL = 'AI-Native Agent Benchmarks (ARS 2026)';
