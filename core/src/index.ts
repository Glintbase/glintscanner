/**
 * @glintbase/scanner-core
 *
 * The ARS 3.3 agent-readiness engine used by scan.glintbase.dev, published as a
 * standalone package so the CLI (and anyone else) scores sites with exactly the same
 * probes, check registry and scoring rules. The engine source lives in
 * ../src/lib/scanner and is bundled into dist by tsup (see tsup.config.ts).
 */

// ── Version identifiers ─────────────────────────────────────────────────────
export {
  GLINTBASE_VERSION,
  ARS_SCORE_VERSION,
  ARS_LABEL,
  isCurrentArsVersion,
  isArs3Version,
} from '@scanner/version';

// ── ARS 3.x probe suite & scoring ───────────────────────────────────────────
export {
  runArs3Probes,
  runArs3ProbesDetailed,
  runArs2Probes,
  MIN_LAYER_COVERAGE,
  type RunProbesOptions,
  type Ars2Scorecard,
} from '@scanner/v2/probes';
export type { DiscoveryProbeResult } from '@scanner/v2/probes/discovery';
export type { AccessProbeResult } from '@scanner/v2/probes/access';
export type { UsabilityProbeResult } from '@scanner/v2/probes/usability';
export type { PaymentsProbeResult } from '@scanner/v2/probes/payments';

export type {
  Ars3Scorecard,
  ArsPillarSummary,
  CheckResult,
  CheckRemediation,
  CheckDefinition,
  CheckStatus,
  CheckTier,
  CheckKind,
  EvaluatorMode,
  LayerId,
  LayerScoreSummary,
  ScanEvidenceSummary,
  RemediationSummary,
  CriticalVulnerability,
  SimulationResult,
} from '@scanner/v2/probes/types';

// ── Check registry ──────────────────────────────────────────────────────────
export {
  ALL_CHECKS,
  getAllChecks,
  getCheckById,
  getChecksForLayer,
  getBonusChecks,
  getChecksForSpec,
} from '@scanner/v2/probes/registry';

// ── Targeted re-checks ──────────────────────────────────────────────────────
export {
  parseCheckIds,
  partitionCheckIds,
  unknownCheckResult,
  recheckFromResults,
  type RecheckResult,
} from '@scanner/v2/probes/recheck';

// ── Archetype classification ────────────────────────────────────────────────
export {
  classifyArchetype,
  normalizeArchetypeOverride,
  CANONICAL_ARCHETYPES,
  type SiteArchetype,
  type CanonicalArchetype,
  type ArchetypeOverride,
  type ArchetypeProfile,
  type ArchetypeInput,
  type LayerWeightConfig,
} from '@scanner/v2/archetype';

// ── Score bands & grades ────────────────────────────────────────────────────
export {
  scoreBand,
  scoreBandLabel,
  scoreBandTextClass,
  scoreBandColorHex,
  badgeColorForScore,
  SCORE_BANDS,
  getArsGrade,
  ARS_GRADE_BANDS,
  type ArsGrade,
  type GradeBand,
  type ScoreBand,
  type ScoreBandKey,
} from '@scanner/shared/scoreBand';

// ── URL policy (SSRF guards) & URL helpers ──────────────────────────────────
export {
  validateScanUrl,
  policyToErrorCode,
  type UrlPolicyCode,
  type UrlPolicyResult,
} from '@scanner/v2/urlPolicy';
export {
  normalizeUrl,
  deriveCompany,
  deriveCompanySlug,
  registrableDomain,
  brandFromHostname,
} from '@scanner/shared/url';

// ── Network fetch (policy-checked, size-capped) ─────────────────────────────
export {
  fetchResource,
  verifyUrlExists,
  sseHasJsonData,
  type FetchStatus,
  type FetchResourceOptions,
  type FetchResourceResult,
} from '@scanner/v2/fetchResource';

// ── MCP live probe & OpenAPI inspection ─────────────────────────────────────
export {
  probeMcpServer,
  type McpProbeStepResult,
  type McpLiveProbeResult,
} from '@scanner/v2/mcpProbe';
export {
  inspectOpenApi,
  listOperations,
  isJsonMediaType,
  jsonMediaOf,
  type OpenApiInspection,
  type OpenApiOperationRef,
} from '@scanner/v2/openapiInspect';

// ── Bundled agent-readiness skills (playbooks served by the MCP servers & CLI) ──
export { BUNDLED_SKILLS, type BundledSkill } from '@scanner/mcp/skills';

// ── Full scan pipeline (discovery + graph + journeys + ARS) ─────────────────
export {
  runScan,
  formatScanMarkdown,
  checkReachability,
  parseSpec,
  type ScanOptions,
  type ScanResult,
  type RunScanHooks,
  type ScanProgressEvent,
  type ReachabilityResult,
  type SpecType,
  type SpecParseResult,
} from '@scanner/core';
