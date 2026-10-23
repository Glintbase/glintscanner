/**
 * ARS 3.0 Master Probe Suite & Dynamic Denominator Evaluator
 * Specification: GLINTBASE_AUDIT_3_0_UPGRADE_SPEC.md (Section 2)
 *
 * Scoring Formula:
 * Final Score = min(100, round((S_base_earned + S_bonus_earned) / (D_archetype_base + S_bonus_earned) * 100))
 */

import { classifyArchetype, ArchetypeProfile, ArchetypeInput } from '../archetype';
import { probeDiscovery, DiscoveryProbeResult } from './discovery';
import { probeAccess, AccessProbeResult } from './access';
import { probeUsability, UsabilityProbeResult } from './usability';
import { probePayments, PaymentsProbeResult } from './payments';
import { getArsGrade } from '../../shared/scoreBand';
import { getAllChecks, getCheckById, getChecksForLayer } from './registry';
import { ARS_SCORE_VERSION } from '../../version';
import type {
  Ars3Scorecard,
  ScanEvidenceSummary,
  CheckResult,
  RemediationSummary,
  LayerId,
  LayerScoreSummary,
  ScoreGate,
} from './types';

export type {
  Ars3Scorecard,
  CheckResult,
  RemediationSummary,
  LayerId,
  LayerScoreSummary,
};

export interface Ars2Scorecard {
  score: number;
  version: string;
  grade?: string;
  archetype: ArchetypeProfile;
  earnedPoints: number;
  activeDenominator: number;
  layers: {
    discovery: { score: number; maxScore: number; details: string[]; data: DiscoveryProbeResult };
    access: { score: number; maxScore: number; details: string[]; data: AccessProbeResult };
    usability: { score: number; maxScore: number; details: string[]; data: UsabilityProbeResult };
    payments: { score: number; maxScore: number; applicable: boolean; details: string[]; data: PaymentsProbeResult };
  };
  remediations: Array<{
    id: string;
    layer: 'discovery' | 'access' | 'usability' | 'payments';
    severity: 'critical' | 'high' | 'medium';
    title: string;
    description: string;
    fixCommand: string;
    targetFile: string;
    /** Unified-diff style fix, newline-joined (from the check's remediation). */
    diffSnippet?: string;
  }>;
  results?: CheckResult[];
}

export interface RunProbesOptions {
  spec?: 'ars' | 'strict' | 'core';
  kind?: 'product' | 'docs' | 'ecommerce' | 'auto';
  archetypeInput?: Partial<ArchetypeInput>;
  localContext?: {
    hasClaudeRules?: boolean;
    hasCursorRules?: boolean;
    hasWindsurfRules?: boolean;
    hasPluginJson?: boolean;
    packageName?: string;
    hasOpenApiFile?: boolean;
    hasLlmsFile?: boolean;
    hasLlmsFullFile?: boolean;
    middlewareHasVaryAccept?: boolean;
    has404Handler?: boolean;
    hasMcpRoute?: boolean;
    hasAuthFile?: boolean;
    authContent?: string;
    routeCount?: number;
    hasIdempotencyKey?: boolean;
    hasArdFile?: boolean;
    ardContent?: string;
    hasRobotsFile?: boolean;
    robotsContent?: string;
    llmsContent?: string;
    pageContent?: string;
    hasCatchAllSpaLeak?: boolean;
    isLocalCodebase?: boolean;
    hasCommerceRoutes?: boolean;
    hasStripeOrPayment?: boolean;
    hasX402Header?: boolean;
    hasUcpFile?: boolean;
    hasAcpFile?: boolean;
    candidateMcpUrls?: string[];
  };
  onLayerComplete?: (layerId: LayerId, summary: LayerScoreSummary) => void;
}

/**
 * The registry is the single source of truth for each check's points and bonus status.
 * Probes only decide the status; earned points are the full registry value on pass, else 0
 * (no partial credit for warn).
 */
function alignWithRegistry<T extends { checks: CheckResult[] }>(probe: T): T {
  for (const check of probe.checks) {
    const def = getCheckById(check.checkId);
    if (!def) continue;
    check.maxPoints = def.points;
    check.isBonus = def.isBonus;
    check.earnedPoints = check.status === 'pass' ? def.points : 0;
  }
  return probe;
}

/** Below this share of verified base points a layer is flagged lowConfidence. */
export const MIN_LAYER_COVERAGE = 0.5;

/** Highest score a scan with a failed gate can get: the top of grade D. */
export const GATE_SCORE_CAP = 47;

/** Checks whose `fail` stops a plain-fetch agent outright. */
const GATE_CHECKS: Array<[string, string]> = [
  ['anti-crawler-challenge-free', 'The homepage served a bot challenge or HTTP 403 to the scanner'],
  ['content-no-js', 'The homepage has almost no content without JavaScript'],
];

function layerCoverage(layer: LayerId, checks: CheckResult[]): { verified: number; registered: number } {
  const registered = getChecksForLayer(layer).filter((d) => !d.isBonus).reduce((sum, d) => sum + d.points, 0);
  const verified = checks
    .filter((c) => !c.isBonus && c.status !== 'na' && c.status !== 'skip')
    .reduce((sum, c) => sum + c.maxPoints, 0);
  return { verified, registered };
}

export async function runArs3Probes(
  url: string,
  options: RunProbesOptions = {}
): Promise<Ars3Scorecard> {
  return (await runArs3ProbesDetailed(url, options)).scorecard;
}

/** Same as runArs3Probes, but also returns each layer's raw probe output. */
/** Does the edge honour what robots.txt allows? (The Silent Wall, RQ3.) */
export function robotsEdgeConsistency(discovery: DiscoveryProbeResult, access: AccessProbeResult): CheckResult {
  const base = { checkId: 'robots-edge-consistency', earnedPoints: 0, maxPoints: 0, isBonus: true };
  const policy = discovery.robotsPolicy;
  const blockedCheck = access.checks.find((c) => c.checkId === 'anti-crawler-challenge-free');
  if (!policy?.found || !blockedCheck || blockedCheck.status === 'skip') {
    return { ...base, status: 'na', message: 'Needs both a robots.txt and an observed homepage response' };
  }
  const allows = policy.botsAllowed.length > 0;
  const refused = blockedCheck.status === 'fail';
  if (allows && refused) {
    return {
      ...base,
      status: 'warn',
      message: `robots.txt allows AI agents (${policy.botsAllowed.join(', ')}) but the edge refused the scanner: ${blockedCheck.message}`,
    };
  }
  return {
    ...base,
    status: 'pass',
    message: refused
      ? 'robots.txt and the edge agree: both refuse AI agents'
      : `The edge served the homepage${allows ? ', as robots.txt allows' : ''}`,
  };
}

export async function runArs3ProbesDetailed(
  url: string,
  options: RunProbesOptions = {}
): Promise<{
  scorecard: Ars3Scorecard;
  discovery: DiscoveryProbeResult;
  access: AccessProbeResult;
  usability: UsabilityProbeResult;
  payments: PaymentsProbeResult;
}> {
  const spec = options.spec || 'ars';
  const kind = options.kind || 'auto';

  // 1. Determine site archetype & base denominator
  const archetype = classifyArchetype({
    url,
    kindOverride: kind,
    ...options.archetypeInput,
  });

  // Helpers for layer score calculation
  const computeLayerBase = (checks: CheckResult[], maxLayerWeight: number) => {
    if (maxLayerWeight <= 0) return 0;
    const baseChecks = checks.filter(c => !c.isBonus && c.status !== 'skip' && c.status !== 'na');
    const rawPossible = baseChecks.reduce((sum, c) => sum + c.maxPoints, 0);
    const rawEarned = baseChecks.filter(c => c.status === 'pass').reduce((sum, c) => sum + c.earnedPoints, 0);
    if (rawPossible <= 0) return 0;
    return Math.min(maxLayerWeight, Math.round((rawEarned / rawPossible) * maxLayerWeight));
  };

  const makeLayerSummary = (
    layer: LayerId,
    name: string,
    layerBase: number,
    checks: CheckResult[],
    baseMax: number,
    applicable: boolean = true
  ): LayerScoreSummary => {
    const layerBonus = layer === 'payments' ? 0 : checks.filter(c => c.isBonus && c.status === 'pass').reduce((sum, c) => sum + c.earnedPoints, 0);
    const { verified, registered } = layerCoverage(layer, checks);
    const coverage = registered > 0 ? Math.min(1, verified / registered) : 1;
    return {
      layer,
      name,
      baseEarned: layerBase,
      bonusEarned: layerBonus,
      totalEarned: layerBase + layerBonus,
      baseMax,
      statusText: baseMax > 0 && layerBase >= Math.round(baseMax * 0.75) ? 'Optimal' : baseMax > 0 && layerBase >= Math.round(baseMax * 0.4) ? 'Needs attention' : 'Remediate',
      applicable,
      coverage,
      lowConfidence: applicable && baseMax > 0 && coverage < MIN_LAYER_COVERAGE,
      checks,
    };
  };

  let isLoopback = false;
  try {
    const parsed = new URL(url);
    isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {}

  const baseLocalContext = {
    ...options.localContext,
    isLocalCodebase: options.localContext?.isLocalCodebase ?? (isLoopback && Boolean(options.localContext)),
  };

  // 2. Execute 4 Layer probes in parallel with real-time layer callbacks
  const discoveryPromise = probeDiscovery(url, baseLocalContext).then(alignWithRegistry).then((d) => {
    const l1Base = computeLayerBase(d.checks, archetype.layerWeights.discovery);
    const s = makeLayerSummary('discovery', 'Layer 1: Discovery', l1Base, d.checks, archetype.layerWeights.discovery);
    options.onLayerComplete?.('discovery', s);
    return d;
  });

  const accessPromise = probeAccess(url, baseLocalContext).then(alignWithRegistry).then((a) => {
    const l2Base = computeLayerBase(a.checks, archetype.layerWeights.access);
    const s = makeLayerSummary('access', 'Layer 2: Access & Understanding', l2Base, a.checks, archetype.layerWeights.access);
    options.onLayerComplete?.('access', s);
    return a;
  });

  const usabilityPromise = accessPromise.then(async (a) => {
    const sharedContext = {
      ...baseLocalContext,
      hasOpenApiFile: Boolean(baseLocalContext.hasOpenApiFile || a.openapi?.found),
      openApiSpec: a.openapi?.spec,
    };
    // Explicit kind wins; otherwise docs/knowledge-base sites get the docs MCP rubric.
    const usabilityKind = kind === 'docs' || (kind === 'auto' && archetype.canonicalArchetype === 'docs_kb') ? 'docs' : 'product';
    const u = alignWithRegistry(await probeUsability(url, { kind: usabilityKind, localContext: sharedContext }));
    const l3Base = archetype.layerWeights.usability > 0 ? computeLayerBase(u.checks, archetype.layerWeights.usability) : 0;
    const s = makeLayerSummary('usability', 'Layer 3: Usability & Interoperability', l3Base, u.checks, archetype.layerWeights.usability, archetype.layerWeights.usability > 0);
    options.onLayerComplete?.('usability', s);
    return u;
  });

  const paymentsPromise = probePayments(url, archetype.archetype, baseLocalContext).then((p) => {
    const l4Base = p.isApplicable ? p.score : 0;
    const s = makeLayerSummary('payments', 'Layer 4: Payments & Machine Commerce', l4Base, p.checks, archetype.layerWeights.payments, p.isApplicable);
    options.onLayerComplete?.('payments', s);
    return p;
  });

  const [discovery, access, usability, payments] = await Promise.all([
    discoveryPromise,
    accessPromise,
    usabilityPromise,
    paymentsPromise,
  ]);

  // Policy vs. enforcement (reported, 0 pts): robots.txt allows AI agents but the edge refused
  // the scanner. The refusal itself is scored by the anti-crawler gate; this names the mismatch.
  access.checks.push(robotsEdgeConsistency(discovery, access));

  // 3. Aggregate all checks
  const allResults: CheckResult[] = [
    ...discovery.checks,
    ...access.checks,
    ...usability.checks,
    ...payments.checks,
  ];

  // 4. Calculate Layer Base Scores & Dynamic Denominator Mathematics
  const l1BaseEarned = computeLayerBase(discovery.checks, archetype.layerWeights.discovery);
  const l2BaseEarned = computeLayerBase(access.checks, archetype.layerWeights.access);
  const l3BaseEarned = archetype.layerWeights.usability > 0 ? computeLayerBase(usability.checks, archetype.layerWeights.usability) : 0;
  const l4BaseEarned = payments.isApplicable ? payments.score : 0;

  const baseEarned = l1BaseEarned + l2BaseEarned + l3BaseEarned + l4BaseEarned;

  // Bonus earned: sum of bonus points for passed bonus checks (excluding payments which is factored into l4BaseEarned via OR-scoring)
  let bonusEarned = 0;
  for (const check of allResults) {
    if (check.status === 'pass' && check.isBonus) {
      const isPayment = check.checkId.startsWith('acp') || check.checkId.startsWith('ucp') || check.checkId.startsWith('ap2') || check.checkId.startsWith('x402') || check.checkId.startsWith('mpp');
      if (!isPayment) {
        bonusEarned += check.earnedPoints;
      }
    }
  }

  const baseDenominator = archetype.baseDenominator || 85;
  const activeDenominator = baseDenominator + bonusEarned;

  // Formula: min(100, round((baseEarned + bonusEarned) / activeDenominator * 100))
  const totalEarned = baseEarned + bonusEarned;
  const rawScore = Math.round((totalEarned / activeDenominator) * 100);
  const uncappedScore = Math.max(0, Math.min(100, rawScore));

  // Gates: failures that stopped retrieval outright in AgentReady.org's controlled experiment
  // (agents refused at the edge, answer only after running JavaScript). Weighted points can't
  // offset them, so any gate caps the score.
  const gates: ScoreGate[] = [];
  for (const [checkId, reason] of GATE_CHECKS) {
    const check = allResults.find((c) => c.checkId === checkId);
    if (check?.status === 'fail') gates.push({ checkId, reason });
  }
  const score = gates.length ? Math.min(uncappedScore, GATE_SCORE_CAP) : uncappedScore;

  const gradeInfo = getArsGrade(score);

  // 5. Layer Summaries
  const layerSummaries = {
    discovery: makeLayerSummary('discovery', 'Layer 1: Discovery', l1BaseEarned, discovery.checks, archetype.layerWeights.discovery),
    access: makeLayerSummary('access', 'Layer 2: Access & Understanding', l2BaseEarned, access.checks, archetype.layerWeights.access),
    usability: makeLayerSummary('usability', 'Layer 3: Usability & Interoperability', l3BaseEarned, usability.checks, archetype.layerWeights.usability, archetype.layerWeights.usability > 0),
    payments: makeLayerSummary('payments', 'Layer 4: Payments & Machine Commerce', l4BaseEarned, payments.checks, archetype.layerWeights.payments, payments.isApplicable),
  };

  // 6. Actionable Remediations
  const remediations: RemediationSummary[] = [];

  for (const check of allResults) {
    if (check.remediation && (check.status === 'fail' || check.status === 'warn')) {
      remediations.push({
        id: check.checkId,
        // The registry owns each check's layer; id prefixes are not reliable.
        layer: getCheckById(check.checkId)?.layer ?? 'discovery',
        severity: check.status === 'fail' ? 'critical' : 'high',
        title: check.remediation.title,
        description: check.message,
        fixCommand: check.remediation.fixCommand,
        targetFile: check.remediation.file,
        diffSnippet: check.remediation.diffSnippet ? check.remediation.diffSnippet.join('\n') : undefined,
        mcpPrompt: check.remediation.mcpPrompt,
      });
    }
  }

  // Compute ARS 3.1 Decoupled Pillars
  const discBase = layerSummaries.discovery.baseEarned + layerSummaries.access.baseEarned;
  const discBonus = layerSummaries.discovery.bonusEarned + layerSummaries.access.bonusEarned;
  const discMax = layerSummaries.discovery.baseMax + layerSummaries.access.baseMax;
  const discScore = discMax > 0 ? Math.min(100, Math.round(((discBase + discBonus) / (discMax + discBonus)) * 100)) : 0;
  const discGrade = getArsGrade(discScore).grade;

  const runBase = layerSummaries.usability.baseEarned + (layerSummaries.payments.applicable ? layerSummaries.payments.baseEarned : 0);
  const runBonus = layerSummaries.usability.bonusEarned + (layerSummaries.payments.applicable ? layerSummaries.payments.bonusEarned : 0);
  const runMax = layerSummaries.usability.baseMax + (layerSummaries.payments.applicable ? layerSummaries.payments.baseMax : 0);
  const runScore = runMax > 0 ? Math.min(100, Math.round(((runBase + runBonus) / (runMax + runBonus)) * 100)) : 0;
  const runGrade = getArsGrade(runScore).grade;

  const scoredLayers = (Object.keys(layerSummaries) as LayerId[]).filter(
    (id) => layerSummaries[id].applicable && layerSummaries[id].baseMax > 0 && id !== 'payments'
  );
  const coverageTotals = scoredLayers.reduce(
    (acc, id) => {
      const { verified, registered } = layerCoverage(id, layerSummaries[id].checks);
      return { verified: acc.verified + verified, registered: acc.registered + registered };
    },
    { verified: 0, registered: 0 }
  );
  const evidence: ScanEvidenceSummary = {
    targetReachable: access.targetReachable !== false,
    checksRegistered: getAllChecks().length,
    checksEvaluated: allResults.filter((c) => c.status === 'pass' || c.status === 'warn' || c.status === 'fail').length,
    baseCoverage: coverageTotals.registered > 0 ? Math.min(1, coverageTotals.verified / coverageTotals.registered) : 0,
    lowConfidenceLayers: scoredLayers.filter((id) => layerSummaries[id].lowConfidence),
    homepageBlocked: Boolean(access.homepageBlocked),
  };

  const scorecard: Ars3Scorecard = {
    version: ARS_SCORE_VERSION,
    spec,
    score,
    grade: gradeInfo.grade,
    gradeLabel: gradeInfo.label,
    archetype,
    baseEarned,
    bonusEarned,
    totalEarned,
    baseDenominator,
    activeDenominator,
    pillars: {
      discoverability: {
        score: discScore,
        grade: discGrade,
        description:
          'Measures how easily autonomous agents find, parse, and ingest documentation, sitemaps, and machine surfaces without hallucination.',
      },
      runtimeErgonomics: {
        score: runScore,
        grade: runGrade,
        description:
          'Measures live tool reliability, in-channel error diagnostics, protocol compliance (MCP 2026-07-28), and mutating idempotency.',
      },
    },
    layers: layerSummaries,
    results: allResults,
    remediations,
    evidence,
    gates,
    uncappedScore,
  };

  return { scorecard, discovery, access, usability, payments };
}

/**
 * Backward compatibility wrapper for existing ARS 2.0 callers
 */
export async function runArs2Probes(
  url: string,
  archetypeInput?: Partial<ArchetypeInput>
): Promise<Ars2Scorecard> {
  const { scorecard, discovery, access, usability, payments } = await runArs3ProbesDetailed(url, { archetypeInput });
  // Drop the parsed OpenAPI document: it can be megabytes and callers only need found/url.
  const { spec: _spec, ...openapi } = access.openapi;

  return {
    score: scorecard.score,
    version: scorecard.version,
    grade: scorecard.grade,
    archetype: scorecard.archetype,
    earnedPoints: scorecard.totalEarned,
    activeDenominator: scorecard.activeDenominator,
    layers: {
      discovery: {
        score: scorecard.layers.discovery.totalEarned,
        maxScore: scorecard.layers.discovery.baseMax,
        details: scorecard.layers.discovery.checks.map((c: CheckResult) => c.message),
        data: {
          score: scorecard.layers.discovery.totalEarned,
          baseEarned: scorecard.layers.discovery.baseEarned,
          bonusEarned: scorecard.layers.discovery.bonusEarned,
          checks: scorecard.layers.discovery.checks,
          details: discovery.details,
          robotsPolicy: discovery.robotsPolicy,
          agentRegistries: discovery.agentRegistries,
        },
      },
      access: {
        score: scorecard.layers.access.totalEarned,
        maxScore: scorecard.layers.access.baseMax,
        details: scorecard.layers.access.checks.map((c: CheckResult) => c.message),
        data: {
          targetReachable: access.targetReachable,
          score: scorecard.layers.access.totalEarned,
          baseEarned: scorecard.layers.access.baseEarned,
          bonusEarned: scorecard.layers.access.bonusEarned,
          checks: scorecard.layers.access.checks,
          details: access.details,
          markdownNegotiation: access.markdownNegotiation,
          antiSpa404: access.antiSpa404,
          zeroJsReadability: access.zeroJsReadability,
          openapi,
        },
      },
      usability: {
        score: scorecard.layers.usability.totalEarned,
        maxScore: scorecard.layers.usability.baseMax,
        details: scorecard.layers.usability.checks.map((c: CheckResult) => c.message),
        data: {
          score: scorecard.layers.usability.totalEarned,
          baseEarned: scorecard.layers.usability.baseEarned,
          bonusEarned: scorecard.layers.usability.bonusEarned,
          checks: scorecard.layers.usability.checks,
          details: usability.details,
          mcpServer: usability.mcpServer,
          authHandbook: usability.authHandbook,
          webmcp: usability.webmcp,
        },
      },
      payments: {
        score: scorecard.layers.payments.totalEarned,
        maxScore: scorecard.layers.payments.baseMax,
        applicable: scorecard.layers.payments.applicable,
        details: scorecard.layers.payments.checks.map((c: CheckResult) => c.message),
        data: {
          score: scorecard.layers.payments.totalEarned,
          baseEarned: scorecard.layers.payments.baseEarned,
          bonusEarned: scorecard.layers.payments.bonusEarned,
          isApplicable: scorecard.layers.payments.applicable,
          checks: scorecard.layers.payments.checks,
          details: payments.details,
          x402: payments.x402,
          mpp: payments.mpp,
          ucp: payments.ucp,
          acp: payments.acp,
        },
      },
    },
    remediations: scorecard.remediations,
    results: scorecard.results,
  };
}
