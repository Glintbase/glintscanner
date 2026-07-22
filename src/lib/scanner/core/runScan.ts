/**
 * Pure scan pipeline entrypoint (SPEC-09).
 * No Next.js / Supabase imports — safe for CLI and future packages/scanner-core.
 */

import { discoverEcosystem } from '../v2/discovery';
import { classifySurfaces } from '../v2/classification';
import { crawlEcosystem } from '../v2/crawler';
import { detectEcosystemFramework } from '../v2/framework';
import { buildContextGraph } from '../v2/graph';
import { simulateAgentJourneys } from '../v2/journey';
import { calculateARS, ARS_VERSION } from '../v2/ars';
import { validateScanUrl } from '../v2/urlPolicy';
import type { DiscoveredSurface, ExtractedPage, ContextGraph, JourneySimulation } from '../v2/types';
import type { ScoreDimension } from '../v2/ars';

export interface ScanOptions {
  enabledSurfaces?: string[];
  profile?: 'quick' | 'deep';
  useAgentHarness?: boolean;
  provider?: string;
}

export interface ScanProgressEvent {
  type: 'progress';
  check: string;
  status: string;
  message?: string;
}

export interface ScanResult {
  url: string;
  score: number;
  score_version: string;
  surfaces: DiscoveredSurface[];
  pages: Omit<ExtractedPage, 'html'>[];
  framework: string;
  graph: ContextGraph;
  journeys: JourneySimulation;
  dimensions: ScoreDimension[];
  duration_ms: number;
  /** Discovery-only surface score kept for debugging */
  discovery_score: number;
}

export interface RunScanHooks {
  onProgress?: (event: ScanProgressEvent | { type: string; [k: string]: unknown }) => void;
}

/**
 * Run a full agent-readiness scan against a public URL.
 * Throws on invalid URL / SSRF / unreachable targets.
 */
export async function runScan(
  input: { url: string; options?: ScanOptions },
  hooks: RunScanHooks = {}
): Promise<ScanResult> {
  const started = Date.now();
  const emit = (event: ScanProgressEvent | { type: string; [k: string]: unknown }) => {
    hooks.onProgress?.(event);
  };

  const policy = validateScanUrl(input.url);
  if (!policy.ok || !policy.url) {
    const err = new Error(policy.message || 'Invalid URL');
    (err as any).code = policy.code === 'SSRF_BLOCKED' ? 'SSRF_BLOCKED' : 'INVALID_URL';
    throw err;
  }

  const url = policy.url;
  const enabledSurfaces = input.options?.enabledSurfaces;
  const profile = input.options?.profile ?? 'quick';

  emit({
    type: 'progress',
    check: 'validation',
    status: 'done',
    message: `URL policy passed: ${url}`,
  });

  const report = await discoverEcosystem(
    url,
    (log) => emit(log),
    enabledSurfaces
  );

  const classifiedSurfaces = await classifySurfaces(report.surfaces, (log) => emit(log));

  const framework = await detectEcosystemFramework(classifiedSurfaces, (log) => emit(log));

  const extractedPages = await crawlEcosystem(
    classifiedSurfaces,
    (log) => emit(log),
    { seedUrl: url, profile }
  );

  const graph = await buildContextGraph(classifiedSurfaces, extractedPages, (log) => emit(log));

  const pagesForScore = extractedPages.map(({ html, ...rest }) => rest);

  let journeys;
  if (input.options?.useAgentHarness) {
    const { runAgentSimulationHarness } = await import('../agent/dispatcher');
    journeys = await runAgentSimulationHarness(graph, classifiedSurfaces, pagesForScore, {
      providerConfig: { provider: input.options?.provider as any },
      onProgress: (log) => emit(log),
    });
  } else {
    journeys = await simulateAgentJourneys(graph, (log) => emit(log), enabledSurfaces);
  }

  emit({
    type: 'progress',
    check: 'scoring',
    status: 'running',
    message: `Computing ARS (${ARS_VERSION})...`,
  });

  const ars = calculateARS({
    surfaces: classifiedSurfaces,
    pages: pagesForScore,
    graph,
    journeys,
  });

  emit({
    type: 'progress',
    check: 'scoring',
    status: 'done',
    message: `ARS ${ars.score}/100 (${ars.score_version})`,
  });

  return {
    url,
    score: ars.score,
    score_version: ars.score_version,
    surfaces: classifiedSurfaces,
    pages: pagesForScore,
    framework,
    graph,
    journeys,
    dimensions: ars.dimensions,
    duration_ms: Date.now() - started,
    discovery_score: report.score,
  };
}
