import { describe, it, expect } from 'vitest';
import { formatScanMarkdown } from '../reportMarkdown';
import type { ScanResult } from '../runScan';
import { ARS_VERSION } from '../../v2/ars';

const sample: ScanResult = {
  url: 'https://docs.example.com/',
  score: 74,
  score_version: ARS_VERSION,
  surfaces: [
    {
      type: 'docs',
      url: 'https://docs.example.com/docs',
      found: true,
      status: 'verified',
      confidence: 'high',
      description: 'ok',
      fix: null,
    },
  ],
  pages: [],
  framework: 'Custom Docs',
  graph: {
    nodes: [],
    edges: [],
    metrics: {
      islands: 0,
      deadEnds: 0,
      missingBridges: 0,
      adjacencyScore: 0,
      continuityScore: 0,
    },
  },
  journeys: {
    traces: [
      {
        journey: 'find_docs_overview',
        label: 'Find Docs Overview',
        goal: 'docs',
        mode: 'canonical',
        status: 'passed',
        success: true,
        confidence: 'high',
        startSurface: 'Docs',
        steps: [],
        breakpoint: null,
        cost: {
          pagesVisited: 1,
          inferencePoints: 0,
          tokenWasteEstimate: 'low',
          hops: 1,
          retrievalBreadth: 1,
        },
        recommendedFix: null,
        hallucinationPressure: 'low',
        hopCount: 1,
        retrievalBreadth: 1,
        fragmentationScore: 0,
      },
    ],
    overallCompletionRate: 100,
    avgHopCount: 1,
    avgFragmentationScore: 0,
    highRiskJourneys: [],
  },
  dimensions: [
    {
      name: 'Discoverability',
      score: 80,
      maxScore: 100,
      description: 'test',
      observations: ['ok'],
    },
  ],
  duration_ms: 1234,
  discovery_score: 50,
};

describe('formatScanMarkdown', () => {
  it('includes score, version, surfaces, journeys', () => {
    const md = formatScanMarkdown(sample);
    expect(md).toContain('74/100');
    expect(md).toContain(ARS_VERSION);
    expect(md).toContain('docs');
    expect(md).toContain('Find Docs Overview');
    expect(md).toContain('pathfinder');
  });
});
