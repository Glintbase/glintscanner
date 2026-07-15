/**
 * Agent Readiness Score (ARS) 1.0 — pure, deterministic (SPEC-06).
 * score_version: ars-1.0.0
 */

import type {
  DiscoveredSurface,
  ExtractedPage,
  ContextGraph,
  JourneySimulation,
} from './types';

export interface ScoreDimension {
  name: string;
  score: number;
  maxScore: number;
  description: string;
  observations: string[];
}

export const ARS_VERSION = 'ars-1.0.0' as const;

/** Weights MUST sum to 1.0 */
export const ARS_WEIGHTS = {
  discoverability: 0.12,
  machine_entrypoints: 0.2,
  canonical_sources: 0.12,
  content_quality: 0.12,
  graph_connectivity: 0.14,
  journey_success: 0.2,
  freshness: 0.05,
  runtime_validity: 0.05,
} as const;

export type ArsDimensionKey = keyof typeof ARS_WEIGHTS;

export interface ArsInput {
  surfaces: DiscoveredSurface[];
  pages: Pick<ExtractedPage, 'wordCount' | 'headings' | 'codeBlocks' | 'fetchStatus'>[];
  graph?: ContextGraph | null;
  journeys?: JourneySimulation | null;
}

export interface ArsResult {
  score: number;
  score_version: typeof ARS_VERSION;
  dimensions: ScoreDimension[];
  /** Internal 0–100 dimension scores by key */
  dimensionScores: Record<ArsDimensionKey, number>;
}

function getSurface(surfaces: DiscoveredSurface[], type: string) {
  return surfaces.find((s) => s.type === type);
}

function isActive(surfaces: DiscoveredSurface[], type: string): boolean {
  const s = getSurface(surfaces, type);
  return s ? s.status !== 'skipped' : true;
}

/** Validated found only (invalid status does not count). */
function isFoundValid(surfaces: DiscoveredSurface[], type: string): boolean {
  const s = getSurface(surfaces, type);
  if (!s || !s.found) return false;
  if (s.status === 'invalid' || s.status === 'skipped') return false;
  return true;
}

/** Presence without quality (invalid HTTP hit) — used for anti-gaming caps. */
function isPresentInvalid(surfaces: DiscoveredSurface[], type: string): boolean {
  const s = getSurface(surfaces, type);
  return !!(s && s.status === 'invalid');
}

function weightedSurfaceScore(
  surfaces: DiscoveredSurface[],
  items: { type: string; weight: number }[]
): { score: number; max: number } {
  let max = 0;
  let score = 0;
  for (const item of items) {
    if (!isActive(surfaces, item.type)) continue;
    max += item.weight;
    if (isFoundValid(surfaces, item.type)) score += item.weight;
  }
  return { score, max };
}

function to100(score: number, max: number, defaultIfEmpty = 100): number {
  if (max <= 0) return defaultIfEmpty;
  return Math.round((score / max) * 100);
}

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function calculateARS(input: ArsInput): ArsResult {
  const surfaces = input.surfaces || [];
  const pages = (input.pages || []).filter((p) => p.fetchStatus !== 'failed' && p.fetchStatus !== 'timeout');
  const graph = input.graph;
  const journeys = input.journeys;

  // ── 1. Discoverability (0.12) ────────────────────────────────────────────
  const disc = weightedSurfaceScore(surfaces, [
    { type: 'sitemap', weight: 40 },
    { type: 'landing', weight: 30 },
    { type: 'docs', weight: 30 },
  ]);
  const discoverability = to100(disc.score, disc.max);
  const discObs = [
    isActive(surfaces, 'sitemap')
      ? isFoundValid(surfaces, 'sitemap')
        ? 'sitemap.xml verified.'
        : 'sitemap.xml missing.'
      : 'sitemap check skipped.',
    isActive(surfaces, 'landing')
      ? isFoundValid(surfaces, 'landing')
        ? 'Landing origin reachable.'
        : 'Landing origin missing.'
      : 'landing check skipped.',
  ];

  // ── 2. Machine entrypoints (0.20) — anti-gaming ──────────────────────────
  // Validated finds score full weight; invalid presence alone caps dimension ≤ 40
  const machineTypes = [
    { type: 'llms_txt', weight: 30 },
    { type: 'llms_full_txt', weight: 15 },
    { type: 'openapi', weight: 35 },
    { type: 'mcp', weight: 20 },
  ];
  const mach = weightedSurfaceScore(surfaces, machineTypes);
  let machineEntrypoints = to100(mach.score, mach.max, 0);

  const anyInvalidMachine = machineTypes.some((m) => isPresentInvalid(surfaces, m.type));
  const anyValidMachine = machineTypes.some((m) => isFoundValid(surfaces, m.type));
  // Presence-only (all invalid, none valid) → hard cap 40
  if (anyInvalidMachine && !anyValidMachine) {
    machineEntrypoints = Math.min(machineEntrypoints, 40);
  }
  // Mix: if quality is thin on found llms, soft-cap
  const llms = getSurface(surfaces, 'llms_txt');
  if (llms?.found && llms.quality === 'thin') {
    machineEntrypoints = Math.min(machineEntrypoints, 70);
  }

  const machineObs = [
    isActive(surfaces, 'llms_txt')
      ? isFoundValid(surfaces, 'llms_txt')
        ? `llms.txt validated (${llms?.quality || 'good'}).`
        : isPresentInvalid(surfaces, 'llms_txt')
          ? 'llms.txt present but failed content validation (anti-gaming).'
          : 'llms.txt missing.'
      : 'llms.txt skipped.',
    isActive(surfaces, 'openapi')
      ? isFoundValid(surfaces, 'openapi')
        ? 'OpenAPI spec parsed with paths.'
        : isPresentInvalid(surfaces, 'openapi')
          ? 'OpenAPI URL found but invalid document.'
          : 'OpenAPI missing.'
      : 'OpenAPI skipped.',
  ];

  // ── 3. Canonical sources (0.12) ──────────────────────────────────────────
  const canon = weightedSurfaceScore(surfaces, [
    { type: 'docs', weight: 50 },
    { type: 'github', weight: 30 },
    { type: 'sdk', weight: 20 },
  ]);
  const canonicalSources = to100(canon.score, canon.max);
  const canonObs = [
    isFoundValid(surfaces, 'docs') ? 'Docs root resolved.' : 'Docs root missing.',
    isFoundValid(surfaces, 'github')
      ? 'GitHub repository linked.'
      : isFoundValid(surfaces, 'sdk')
        ? 'SDK surface linked (no GitHub).'
        : 'No canonical code/SDK surface.',
  ];

  // ── 4. Content quality (0.12) ────────────────────────────────────────────
  const okPages = pages.filter((p) => (p.wordCount || 0) > 0);
  const avgWords =
    okPages.length > 0
      ? okPages.reduce((a, p) => a + (p.wordCount || 0), 0) / okPages.length
      : 0;
  const avgHeadings =
    okPages.length > 0
      ? okPages.reduce((a, p) => a + (p.headings?.length || 0), 0) / okPages.length
      : 0;
  const avgCode =
    okPages.length > 0
      ? okPages.reduce((a, p) => a + (p.codeBlocks?.length || 0), 0) / okPages.length
      : 0;

  let contentQuality = 0;
  if (avgWords >= 600) contentQuality += 40;
  else if (avgWords >= 300) contentQuality += 25;
  else if (avgWords >= 150) contentQuality += 15;
  if (avgHeadings >= 4) contentQuality += 30;
  else if (avgHeadings >= 2) contentQuality += 18;
  else if (avgHeadings >= 1) contentQuality += 8;
  if (avgCode >= 2) contentQuality += 30;
  else if (avgCode >= 1) contentQuality += 18;
  else if (avgCode > 0) contentQuality += 8;
  contentQuality = clamp100(contentQuality);

  const contentObs = [
    okPages.length
      ? `Avg words/page: ${Math.round(avgWords)}; headings: ${avgHeadings.toFixed(1)}; code blocks: ${avgCode.toFixed(1)}.`
      : 'No crawled page content.',
    okPages.length >= 3 ? `${okPages.length} pages in corpus.` : `Thin crawl corpus (${okPages.length} pages).`,
  ];

  // ── 5. Graph connectivity (0.14) ─────────────────────────────────────────
  const metrics = graph?.metrics;
  const nodeCount = graph?.nodes?.length || 0;
  const edgeCount = graph?.edges?.length || 0;
  const deadEnds = metrics?.deadEnds ?? 0;
  const components = metrics?.components ?? (nodeCount > 0 ? 1 : 0);
  const adjacency = metrics?.adjacencyScore ?? 0;
  const continuity = metrics?.continuityScore ?? 0;

  let graphConnectivity = 0;
  if (nodeCount === 0) {
    graphConnectivity = 0;
  } else {
    const deadRatio = deadEnds / Math.max(nodeCount, 1);
    let deadScore = 100;
    if (deadRatio > 0.4) deadScore = 30;
    else if (deadRatio > 0.2) deadScore = 55;
    else if (deadRatio > 0.1) deadScore = 75;

    const componentPenalty = components > 3 ? 40 : components > 1 ? 70 : 100;
    const densityScore = Math.min(100, adjacency);
    const contScore = Math.min(100, continuity);

    graphConnectivity = clamp100(
      deadScore * 0.3 + componentPenalty * 0.2 + densityScore * 0.25 + contScore * 0.25
    );
  }

  const graphObs = [
    nodeCount
      ? `${nodeCount} nodes, ${edgeCount} edges, ${components} component(s).`
      : 'Empty knowledge graph.',
    metrics?.pathDocsToAuth
      ? 'Path sample docs→auth: reachable.'
      : deadEnds > 0
        ? `${deadEnds} navigation sink(s) detected.`
        : 'No path sample for docs→auth.',
  ];

  // ── 6. Journey success (0.20) ────────────────────────────────────────────
  const completion = journeys?.overallCompletionRate ?? 0;
  const avgHops = journeys?.avgHopCount ?? 0;
  const highRisk = journeys?.highRiskJourneys?.length ?? 0;
  const totalJ = journeys?.traces?.length ?? 0;

  let journeySuccess = completion;
  // Penalize high hop cost even when completion is high
  if (avgHops > 6) journeySuccess = Math.max(0, journeySuccess - 15);
  else if (avgHops > 4) journeySuccess = Math.max(0, journeySuccess - 8);
  if (totalJ > 0 && highRisk / totalJ > 0.5) {
    journeySuccess = Math.max(0, journeySuccess - 20);
  } else if (totalJ > 0 && highRisk > 0) {
    journeySuccess = Math.max(0, journeySuccess - 10);
  }
  journeySuccess = clamp100(journeySuccess);

  const journeyObs = [
    totalJ
      ? `Pathfinder: ${completion}% completion across ${totalJ} journeys.`
      : 'No journeys simulated.',
    highRisk > 0
      ? `${highRisk} high-risk journey(s); avg hops ${avgHops}.`
      : `Low hallucination pressure; avg hops ${avgHops}.`,
  ];

  // ── 7. Freshness (0.05) ──────────────────────────────────────────────────
  const fresh = weightedSurfaceScore(surfaces, [
    { type: 'changelog', weight: 50 },
    { type: 'status', weight: 30 },
    { type: 'blog', weight: 20 },
  ]);
  const freshness = to100(fresh.score, fresh.max, 50);
  const freshObs = [
    isFoundValid(surfaces, 'changelog') ? 'Changelog present.' : 'No changelog.',
    isFoundValid(surfaces, 'status') ? 'Status page present.' : 'No status page.',
  ];

  // ── 8. Runtime validity (0.05) ───────────────────────────────────────────
  const active = surfaces.filter((s) => s.status !== 'skipped');
  const validCount = active.filter((s) => s.found && s.status !== 'invalid').length;
  const invalidCount = active.filter((s) => s.status === 'invalid').length;
  const runtimeValidity =
    active.length > 0
      ? clamp100((validCount / active.length) * 100 - invalidCount * 5)
      : 0;
  const runtimeObs = [
    `Verified ${validCount}/${active.length} active surfaces.`,
    invalidCount > 0 ? `${invalidCount} invalid (content-failed) surface(s).` : 'No invalid surfaces.',
  ];

  const dimensionScores: Record<ArsDimensionKey, number> = {
    discoverability,
    machine_entrypoints: machineEntrypoints,
    canonical_sources: canonicalSources,
    content_quality: contentQuality,
    graph_connectivity: graphConnectivity,
    journey_success: journeySuccess,
    freshness,
    runtime_validity: runtimeValidity,
  };

  // Composite
  let composite = 0;
  for (const key of Object.keys(ARS_WEIGHTS) as ArsDimensionKey[]) {
    composite += dimensionScores[key] * ARS_WEIGHTS[key];
  }
  const score = clamp100(composite);

  const dimensions: ScoreDimension[] = [
    {
      name: 'Discoverability',
      score: discoverability,
      maxScore: 100,
      description: 'How easily agents discover sitemaps, landing, and docs roots.',
      observations: discObs,
    },
    {
      name: 'Machine Entrypoints',
      score: machineEntrypoints,
      maxScore: 100,
      description: 'Validated llms.txt, OpenAPI, and MCP entrypoints (anti-gaming applied).',
      observations: machineObs,
    },
    {
      name: 'Canonical Sources',
      score: canonicalSources,
      maxScore: 100,
      description: 'Authoritative docs root and code/SDK surfaces.',
      observations: canonObs,
    },
    {
      name: 'Content Quality',
      score: contentQuality,
      maxScore: 100,
      description: 'Page depth: words, headings, and code samples.',
      observations: contentObs,
    },
    {
      name: 'Graph Connectivity',
      score: graphConnectivity,
      maxScore: 100,
      description: 'Knowledge graph structure: sinks, components, continuity.',
      observations: graphObs,
    },
    {
      name: 'Journey Success',
      score: journeySuccess,
      maxScore: 100,
      description: 'Deterministic pathfinder completion and risk across agent journeys.',
      observations: journeyObs,
    },
    {
      name: 'Freshness / Drift',
      score: freshness,
      maxScore: 100,
      description: 'Changelog and status signals for API drift awareness.',
      observations: freshObs,
    },
    {
      name: 'Runtime Validity',
      score: runtimeValidity,
      maxScore: 100,
      description: 'Live surface verification rate excluding content-invalid hits.',
      observations: runtimeObs,
    },
  ];

  return {
    score,
    score_version: ARS_VERSION,
    dimensions,
    dimensionScores,
  };
}

/** Weights sum check for tests */
export function arsWeightsSum(): number {
  return Object.values(ARS_WEIGHTS).reduce((a, b) => a + b, 0);
}

/**
 * Legacy adapter: keep calculateScoreDimensions API for ResultsReport.
 * Prefers ARS dimensions when possible.
 */
export function calculateScoreDimensions(
  checks: any[],
  pages: any[],
  graph: any,
  journeys: any
): ScoreDimension[] {
  return calculateARS({
    surfaces: Array.isArray(checks) ? checks : [],
    pages: pages || [],
    graph: graph || null,
    journeys: journeys || null,
  }).dimensions;
}
