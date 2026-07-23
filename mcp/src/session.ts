/**
 * MCP scan session — holds intermediate pipeline state so tools build on each other.
 * Tools populate the session progressively; the agent can call them in any order.
 */

import type { DiscoveredSurface, ExtractedPage, ContextGraph, JourneySimulation } from '@scanner/v2/types';
import type { ScoreDimension } from '@scanner/v2/ars';

export interface ScanSession {
  url: string | null;
  surfaces: DiscoveredSurface[] | null;
  pages: Omit<ExtractedPage, 'html'>[] | null;
  graph: ContextGraph | null;
  journeys: JourneySimulation | null;
  score: { score: number; version: string; dimensions: ScoreDimension[] } | null;
  framework: string | null;
  startedAt: number | null;
}

export function createSession(): ScanSession {
  return {
    url: null,
    surfaces: null,
    pages: null,
    graph: null,
    journeys: null,
    score: null,
    framework: null,
    startedAt: null,
  };
}

export function resetSession(session: ScanSession, url: string): void {
  session.url = url;
  session.surfaces = null;
  session.pages = null;
  session.graph = null;
  session.journeys = null;
  session.score = null;
  session.framework = null;
  session.startedAt = Date.now();
}

export interface SessionStatus {
  discovery: boolean;
  crawl: boolean;
  graph: boolean;
  journeys: boolean;
  score: boolean;
}

export function getSessionStatus(session: ScanSession): SessionStatus {
  return {
    discovery: session.surfaces !== null,
    crawl: session.pages !== null,
    graph: session.graph !== null,
    journeys: session.journeys !== null,
    score: session.score !== null,
  };
}

/**
 * Suggest next tool calls based on current session state.
 */
export function getNextSteps(session: ScanSession): string[] {
  const steps: string[] = [];
  if (!session.surfaces) {
    steps.push('discover_surfaces — find machine-readable entrypoints');
    return steps;
  }
  if (!session.pages) {
    steps.push('crawl_pages — extract documentation content');
    steps.push('parse_spec — analyze a specific spec file (OpenAPI, llms.txt)');
  }
  if (session.pages && !session.graph) {
    steps.push('build_knowledge_graph — map concepts and relationships');
  }
  if (session.graph && !session.journeys) {
    steps.push('run_journeys — simulate agent integration tasks');
  }
  if (!session.score) {
    steps.push('score_readiness — calculate composite ARS score');
  }
  if (session.journeys || session.score) {
    steps.push('get_remediation — get prioritized fixes');
  }
  if (steps.length === 0) {
    steps.push('get_remediation — get actionable improvement advice');
    steps.push('discover_surfaces with a new URL — scan another product');
  }
  return steps;
}
