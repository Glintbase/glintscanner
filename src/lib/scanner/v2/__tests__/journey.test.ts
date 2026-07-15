import { describe, it, expect } from 'vitest';
import { simulateAgentJourneys, __test__ } from '../journey';
import type { ContextGraph, GraphNode, GraphEdge } from '../types';

const { findStartNode, isTarget, hasEvidence, JOURNEY_DEPENDENCIES, JOURNEYS, runJourney } = __test__;

function graph(nodes: GraphNode[], edges: GraphEdge[] = []): ContextGraph {
  return {
    nodes,
    edges,
    metrics: {
      islands: 0,
      deadEnds: 0,
      missingBridges: 0,
      adjacencyScore: 50,
      continuityScore: 50,
    },
  };
}

describe('pathfinder integrity (SPEC-05)', () => {
  it('journey pack v1.1 includes llms + openapi journeys', () => {
    const ids = JOURNEYS.map((j) => j.id);
    expect(ids).toContain('find_llms_entrypoint');
    expect(ids).toContain('resolve_openapi_operation');
    expect(ids.length).toBeGreaterThanOrEqual(10);
  });

  it('journey dependency key matches recover_setup_issue id', () => {
    expect(JOURNEY_DEPENDENCIES['recover_setup_issue']).toEqual(['support', 'docs']);
    expect(JOURNEY_DEPENDENCIES['recover_from_setup_issue']).toBeUndefined();
    expect(JOURNEY_DEPENDENCIES['find_llms_entrypoint']).toBeTruthy();
  });

  it('findStartNode prefers startTypes over root', () => {
    const nodes: GraphNode[] = [
      { id: 'root:domain', label: 'Root', type: 'canonical_link' },
      { id: 'surface:docs', label: 'Docs Root', type: 'canonical_link', weight: 2 },
      { id: 'surface:support', label: 'Support', type: 'support_path', weight: 1 },
    ];
    const start = findStartNode(
      {
        id: 'locate_error_handling',
        label: 'Locate Error Handling',
        goal: 'x',
        mode: 'recovery',
        startTypes: ['support_path', 'canonical_link', 'page'],
        intentKeywords: ['error'],
        maxHops: 8,
      },
      nodes
    );
    expect(start?.type).toBe('support_path');
    expect(start?.id).toBe('surface:support');
  });

  it('preferMachineStart picks machine_entrypoint', () => {
    const nodes: GraphNode[] = [
      { id: 'root:domain', label: 'Root', type: 'canonical_link' },
      { id: 'surface:llms', label: 'llms.txt', type: 'machine_entrypoint', weight: 3 },
      { id: 'surface:docs', label: 'Docs', type: 'canonical_link', weight: 5 },
    ];
    const start = findStartNode(
      {
        id: 'find_llms_entrypoint',
        label: 'Find llms',
        goal: 'x',
        mode: 'canonical',
        startTypes: ['machine_entrypoint', 'canonical_link'],
        preferMachineStart: true,
        intentKeywords: ['llms'],
        maxHops: 6,
      },
      nodes
    );
    expect(start?.id).toBe('surface:llms');
  });

  it('isTarget rejects synthetic and low-evidence concepts', () => {
    const synthetic: GraphNode = {
      id: 'concept:authentication',
      label: 'Authentication',
      type: 'concept',
      synthetic: true,
      confidence: 0.5,
    };
    const noEvidence: GraphNode = {
      id: 'concept:authentication',
      label: 'Authentication',
      type: 'concept',
      synthetic: false,
      confidence: 0.9,
    };
    const real: GraphNode = {
      id: 'concept:authentication',
      label: 'Authentication',
      type: 'concept',
      synthetic: false,
      confidence: 0.9,
      evidence: { source_url: 'https://docs.x.com/auth', snippet: 'API keys' },
    };
    const def = {
      id: 'authenticate',
      label: 'Authenticate',
      goal: 'auth',
      mode: 'canonical' as const,
      startTypes: ['page' as const],
      targetNodeId: 'concept:authentication',
      intentKeywords: ['auth'],
      maxHops: 8,
      requireEvidence: true,
    };
    expect(isTarget(synthetic, def)).toBe(false);
    expect(isTarget(noEvidence, def)).toBe(false);
    expect(isTarget(real, def)).toBe(true);
    expect(hasEvidence(real)).toBe(true);
    expect(hasEvidence(synthetic)).toBe(false);
  });

  it('empty active journeys yield 0% completion rate', async () => {
    const g = graph([{ id: 'root:domain', label: 'x', type: 'canonical_link' }]);
    const result = await simulateAgentJourneys(g, undefined, ['status']);
    expect(result.traces.length).toBe(0);
    expect(result.overallCompletionRate).toBe(0);
  });

  it('reaches authentication concept with evidence via pathfinder', () => {
    const nodes: GraphNode[] = [
      { id: 'root:domain', label: 'Root', type: 'canonical_link', weight: 1 },
      {
        id: 'surface:docs',
        label: 'Docs Root',
        type: 'canonical_link',
        weight: 3,
        url: 'https://docs.x.com',
      },
      {
        id: 'page:auth',
        label: 'Auth Guide',
        type: 'page',
        weight: 2,
        url: 'https://docs.x.com/auth',
        evidence: { snippet: 'API keys' },
      },
      {
        id: 'concept:authentication',
        label: 'Authentication',
        type: 'concept',
        confidence: 0.95,
        synthetic: false,
        evidence: { source_url: 'https://docs.x.com/auth', heading: 'Authentication', snippet: 'API keys' },
      },
    ];
    const edges: GraphEdge[] = [
      { source: 'root:domain', target: 'surface:docs', type: 'docs_entrypoint_connects_to_onboarding' },
      { source: 'surface:docs', target: 'page:auth', type: 'page_links_to_page' },
      { source: 'page:auth', target: 'concept:authentication', type: 'documents' },
    ];
    const def = JOURNEYS.find((j) => j.id === 'authenticate')!;
    const trace = runJourney(def, graph(nodes, edges));
    expect(trace.success).toBe(true);
    expect(trace.steps.some((s) => s.nodeId === 'concept:authentication')).toBe(true);
  });

  it('resolves openapi operation journey', () => {
    const nodes: GraphNode[] = [
      { id: 'surface:openapi', label: 'OpenAPI Spec', type: 'api', weight: 4 },
      {
        id: 'operation:POST_v1_tokens',
        label: 'POST /v1/tokens',
        type: 'operation',
        weight: 2,
        evidence: { snippet: 'Create token' },
      },
    ];
    const edges: GraphEdge[] = [
      { source: 'surface:openapi', target: 'operation:POST_v1_tokens', type: 'exposes_operation' },
    ];
    const def = JOURNEYS.find((j) => j.id === 'resolve_openapi_operation')!;
    const trace = runJourney(def, graph(nodes, edges));
    expect(trace.success).toBe(true);
  });
});
