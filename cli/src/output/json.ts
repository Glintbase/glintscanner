/**
 * CLI JSON output — structured report for --json flag.
 * Suitable for piping to jq or CI parsing.
 */

import type { ScanResult } from '@scanner/core';

export interface JsonReport {
  version: string;
  url: string;
  score: number;
  score_version: string;
  band: string;
  framework: string;
  duration_ms: number;
  surfaces: {
    total: number;
    found: number;
    missing: number;
    items: { type: string; status: string; url: string | null }[];
  };
  pages: {
    total: number;
    withCode: number;
    avgWordCount: number;
  };
  graph: {
    nodes: number;
    edges: number;
    islands: number;
    deadEnds: number;
    adjacencyScore: number;
  };
  journeys: {
    total: number;
    passed: number;
    failed: number;
    completionRate: number;
    avgHopCount: number;
    traces: {
      journey: string;
      label: string;
      success: boolean;
      hopCount: number;
      hallucinationPressure: string;
      recommendedFix?: string;
    }[];
  };
  dimensions: {
    name: string;
    score: number;
    maxScore: number;
    observations: string[];
  }[];
}

function scoreBand(score: number): string {
  if (score >= 90) return 'Agent-Native';
  if (score >= 70) return 'Agent-Ready';
  if (score >= 40) return 'Agent-Aware';
  return 'Agent-Opaque';
}

export function formatJson(result: ScanResult): string {
  const foundSurfaces = result.surfaces.filter((s) => s.status === 'verified' || s.status === 'detected');
  const withCode = result.pages.filter((p) => p.codeBlocks && p.codeBlocks.length > 0).length;
  const avgWordCount = result.pages.length > 0
    ? Math.round(result.pages.reduce((sum, p) => sum + (p.wordCount || 0), 0) / result.pages.length)
    : 0;

  const passedJourneys = result.journeys.traces.filter((t) => t.success).length;

  const report: JsonReport = {
    version: '0.1.0',
    url: result.url,
    score: result.score,
    score_version: result.score_version,
    band: scoreBand(result.score),
    framework: result.framework,
    duration_ms: result.duration_ms,
    surfaces: {
      total: result.surfaces.length,
      found: foundSurfaces.length,
      missing: result.surfaces.length - foundSurfaces.length,
      items: result.surfaces.map((s) => ({
        type: s.type,
        status: s.status,
        url: s.url || null,
      })),
    },
    pages: {
      total: result.pages.length,
      withCode,
      avgWordCount,
    },
    graph: {
      nodes: result.graph.nodes.length,
      edges: result.graph.edges.length,
      islands: result.graph.metrics?.islands ?? 0,
      deadEnds: result.graph.metrics?.deadEnds ?? 0,
      adjacencyScore: result.graph.metrics?.adjacencyScore ?? 0,
    },
    journeys: {
      total: result.journeys.traces.length,
      passed: passedJourneys,
      failed: result.journeys.traces.length - passedJourneys,
      completionRate: result.journeys.overallCompletionRate,
      avgHopCount: result.journeys.avgHopCount,
      traces: result.journeys.traces.map((t) => ({
        journey: t.journey,
        label: t.label,
        success: t.success,
        hopCount: t.hopCount,
        hallucinationPressure: t.hallucinationPressure,
        recommendedFix: t.recommendedFix || undefined,
      })),
    },
    dimensions: result.dimensions.map((d) => ({
      name: d.name,
      score: d.score,
      maxScore: d.maxScore,
      observations: d.observations || [],
    })),
  };

  return JSON.stringify(report, null, 2);
}
