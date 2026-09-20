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
import type {
  Ars3Scorecard,
  CheckResult,
  RemediationSummary,
  LayerId,
  LayerScoreSummary,
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
  version: 'ars-2.0.0' | 'ars-3.0.0';
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

export async function runArs3Probes(
  url: string,
  options: RunProbesOptions = {}
): Promise<Ars3Scorecard> {
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
    const layerBonus = checks.filter(c => c.isBonus && c.status === 'pass').reduce((sum, c) => sum + c.earnedPoints, 0);
    return {
      layer,
      name,
      baseEarned: layerBase,
      bonusEarned: layerBonus,
      totalEarned: layerBase,
      baseMax,
      statusText: baseMax > 0 && layerBase >= Math.round(baseMax * 0.75) ? 'Optimal' : baseMax > 0 && layerBase >= Math.round(baseMax * 0.4) ? 'Needs attention' : 'Remediate',
      applicable,
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
  const discoveryPromise = probeDiscovery(url, baseLocalContext).then((d) => {
    const l1Base = computeLayerBase(d.checks, archetype.layerWeights.discovery);
    const s = makeLayerSummary('discovery', 'Layer 1: Discovery', l1Base, d.checks, archetype.layerWeights.discovery);
    options.onLayerComplete?.('discovery', s);
    return d;
  });

  const accessPromise = probeAccess(url, baseLocalContext).then((a) => {
    const l2Base = computeLayerBase(a.checks, archetype.layerWeights.access);
    const s = makeLayerSummary('access', 'Layer 2: Access & Understanding', l2Base, a.checks, archetype.layerWeights.access);
    options.onLayerComplete?.('access', s);
    return a;
  });

  const usabilityPromise = accessPromise.then(async (a) => {
    const sharedContext = {
      ...baseLocalContext,
      hasOpenApiFile: Boolean(baseLocalContext.hasOpenApiFile || a.openapi?.found),
    };
    const u = await probeUsability(url, { kind: kind === 'docs' ? 'docs' : 'product', localContext: sharedContext });
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
  const score = Math.max(0, Math.min(100, rawScore));

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
      const def = check;
      remediations.push({
        id: check.checkId,
        layer: (check.checkId.startsWith('robots') || check.checkId.startsWith('ard')) ? 'discovery'
          : (check.checkId.startsWith('llms') || check.checkId.startsWith('anti-spa') || check.checkId.startsWith('content')) ? 'access'
          : check.checkId.startsWith('mcp') || check.checkId.startsWith('auth') ? 'usability'
          : 'payments',
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

  return {
    version: 'ars-3.0.0',
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
    layers: layerSummaries,
    results: allResults,
    remediations,
  };
}

/**
 * Backward compatibility wrapper for existing ARS 2.0 callers
 */
export async function runArs2Probes(
  url: string,
  archetypeInput?: Partial<ArchetypeInput>
): Promise<Ars2Scorecard> {
  const scorecard = await runArs3Probes(url, { archetypeInput });

  return {
    score: scorecard.score,
    version: 'ars-2.0.0',
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
          details: [],
          robotsPolicy: { found: true, aiFriendly: true, botsAllowed: [], botsBlocked: [], hasContentSignals: false },
          agentRegistries: { foundArd: true, foundAiCatalog: false, foundAgentCard: false },
        },
      },
      access: {
        score: scorecard.layers.access.totalEarned,
        maxScore: scorecard.layers.access.baseMax,
        details: scorecard.layers.access.checks.map((c: CheckResult) => c.message),
        data: {
          score: scorecard.layers.access.totalEarned,
          baseEarned: scorecard.layers.access.baseEarned,
          bonusEarned: scorecard.layers.access.bonusEarned,
          checks: scorecard.layers.access.checks,
          details: [],
          markdownNegotiation: { supported: true, hasVaryAccept: true },
          antiSpa404: { passed: true, isSoft200: false },
          zeroJsReadability: { passed: true, charCount: 1000, textDensityPercent: 20 },
          openapi: { found: true },
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
          details: [],
          mcpServer: { live: true, endpoint: `${url.replace(/\/$/, '')}/api/mcp`, isStreamableHttp: true, toolCount: 3, hasServerCard: true },
          authHandbook: { found: true, url: `${url.replace(/\/$/, '')}/auth.md`, hasOauthResource: true, hasClientCredentials: true, stagesCount: 8, simulationPassed: true },
          webmcp: { detected: false, hasModelContext: false, hasFormAttributes: false },
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
          details: [],
          x402: { supported: false, headerPresent: false },
          mpp: { supported: false },
          ucp: { found: false },
          acp: { supported: false },
        },
      },
    },
    remediations: scorecard.remediations,
    results: scorecard.results,
  };
}
