import { describe, it, expect } from 'vitest';
import { calculateARS, ARS_VERSION, ARS_WEIGHTS, arsWeightsSum } from '../ars';
import type { DiscoveredSurface, ContextGraph, JourneySimulation } from '../types';

function surface(
  type: DiscoveredSurface['type'],
  found: boolean,
  status: DiscoveredSurface['status'] = found ? 'verified' : 'missing',
  extra: Partial<DiscoveredSurface> = {}
): DiscoveredSurface {
  return {
    type,
    url: `https://docs.example.com/${type}`,
    found,
    status,
    confidence: 'high',
    description: type,
    fix: null,
    ...extra,
  };
}

const richPages = [
  {
    wordCount: 800,
    headings: ['A', 'B', 'C', 'D', 'E'],
    codeBlocks: [{ lang: 'js', code: 'x' }, { lang: 'bash', code: 'y' }],
    fetchStatus: 'ok' as const,
  },
  {
    wordCount: 500,
    headings: ['A', 'B', 'C'],
    codeBlocks: [{ lang: 'js', code: 'z' }],
    fetchStatus: 'ok' as const,
  },
];

const goodGraph: ContextGraph = {
  nodes: [
    { id: 'root:domain', label: 'example.com', type: 'canonical_link', weight: 2 },
    { id: 'surface:docs', label: 'Docs', type: 'canonical_link', weight: 4, synthetic: false },
    {
      id: 'concept:authentication',
      label: 'Auth',
      type: 'concept',
      synthetic: false,
      confidence: 0.9,
      evidence: { snippet: 'API keys' },
    },
    { id: 'page:1', label: 'Page', type: 'page', weight: 2 },
    { id: 'op:1', label: 'GET /x', type: 'operation', weight: 1 },
  ],
  edges: [
    { source: 'root:domain', target: 'surface:docs', type: 'docs_entrypoint_connects_to_onboarding' },
    { source: 'surface:docs', target: 'page:1', type: 'page_links_to_page' },
    { source: 'page:1', target: 'concept:authentication', type: 'documents' },
  ],
  metrics: {
    islands: 0,
    deadEnds: 1,
    missingBridges: 0,
    adjacencyScore: 70,
    continuityScore: 80,
    components: 1,
    pathDocsToAuth: true,
  },
};

const goodJourneys: JourneySimulation = {
  traces: [
    {
      journey: 'find_docs_overview',
      label: 'Find Docs',
      goal: 'docs',
      mode: 'canonical',
      status: 'passed',
      success: true,
      confidence: 'high',
      startSurface: 'Docs',
      steps: [],
      breakpoint: null,
      cost: {
        pagesVisited: 2,
        inferencePoints: 0,
        tokenWasteEstimate: 'low',
        hops: 2,
        retrievalBreadth: 2,
      },
      recommendedFix: null,
      hallucinationPressure: 'low',
      hopCount: 2,
      retrievalBreadth: 2,
      fragmentationScore: 0,
    },
    {
      journey: 'authenticate',
      label: 'Auth',
      goal: 'auth',
      mode: 'canonical',
      status: 'passed',
      success: true,
      confidence: 'high',
      startSurface: 'Docs',
      steps: [],
      breakpoint: null,
      cost: {
        pagesVisited: 3,
        inferencePoints: 0,
        tokenWasteEstimate: 'low',
        hops: 3,
        retrievalBreadth: 3,
      },
      recommendedFix: null,
      hallucinationPressure: 'low',
      hopCount: 3,
      retrievalBreadth: 3,
      fragmentationScore: 0,
    },
  ],
  overallCompletionRate: 100,
  avgHopCount: 2.5,
  avgFragmentationScore: 0,
  highRiskJourneys: [],
};

describe('ARS 1.0', () => {
  it('weights sum to 1.0', () => {
    expect(arsWeightsSum()).toBeCloseTo(1.0, 10);
    expect(Object.keys(ARS_WEIGHTS)).toHaveLength(8);
  });

  it('scores a strong ecosystem in elite/friendly range', () => {
    const surfaces: DiscoveredSurface[] = [
      surface('landing', true),
      surface('docs', true),
      surface('sitemap', true),
      surface('llms_txt', true, 'verified', { quality: 'good' }),
      surface('llms_full_txt', true),
      surface('openapi', true),
      surface('mcp', true),
      surface('github', true),
      surface('sdk', true),
      surface('changelog', true),
      surface('status', true),
    ];

    const result = calculateARS({
      surfaces,
      pages: richPages,
      graph: goodGraph,
      journeys: goodJourneys,
    });

    expect(result.score_version).toBe(ARS_VERSION);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.dimensions.length).toBe(8);
    expect(result.dimensionScores.machine_entrypoints).toBeGreaterThanOrEqual(80);
    expect(result.dimensionScores.journey_success).toBeGreaterThanOrEqual(80);
  });

  it('anti-gaming: invalid machine entrypoints cap dimension', () => {
    const surfaces: DiscoveredSurface[] = [
      surface('landing', true),
      surface('docs', true),
      surface('llms_txt', false, 'invalid', { quality: 'invalid' }),
      surface('openapi', false, 'invalid'),
      surface('mcp', false, 'missing'),
    ];

    const result = calculateARS({
      surfaces,
      pages: [],
      graph: null,
      journeys: { traces: [], overallCompletionRate: 0, avgHopCount: 0, avgFragmentationScore: 0, highRiskJourneys: [] },
    });

    // No valid machine finds — invalid-only presence caps at 40
    expect(result.dimensionScores.machine_entrypoints).toBeLessThanOrEqual(40);
  });

  it('legacy ecosystem scores low without surfaces', () => {
    const surfaces: DiscoveredSurface[] = [
      surface('landing', true),
      surface('docs', false),
      surface('sitemap', false),
      surface('llms_txt', false),
      surface('openapi', false),
      surface('github', false),
    ];

    const result = calculateARS({
      surfaces,
      pages: [{ wordCount: 20, headings: [], codeBlocks: [], fetchStatus: 'ok' }],
      graph: {
        nodes: [{ id: 'root:domain', label: 'x', type: 'canonical_link' }],
        edges: [],
        metrics: {
          islands: 1,
          deadEnds: 1,
          missingBridges: 0,
          adjacencyScore: 0,
          continuityScore: 0,
          components: 1,
        },
      },
      journeys: {
        traces: [],
        overallCompletionRate: 0,
        avgHopCount: 0,
        avgFragmentationScore: 0,
        highRiskJourneys: [],
      },
    });

    expect(result.score).toBeLessThan(50);
  });

  it('is deterministic for same inputs', () => {
    const input = {
      surfaces: [surface('docs', true), surface('llms_txt', true, 'verified', { quality: 'good' })],
      pages: richPages,
      graph: goodGraph,
      journeys: goodJourneys,
    };
    expect(calculateARS(input).score).toBe(calculateARS(input).score);
  });
});
