import { describe, it, expect } from 'vitest';
import { createScanPlan } from '../planner';
import { TokenBudgetManager } from '../providers/governor';
import { evaluateAgentTrace } from '../evaluator';
import type { ContextGraph, DiscoveredSurface, JourneyTrace } from '../../v2/types';

describe('LLM Multi-Agent Simulation Harness Architecture', () => {
  it('planner produces fallback plan when no API keys are present', async () => {
    const surfaces: DiscoveredSurface[] = [
      { type: 'landing', url: 'https://example.com', found: true, status: 'verified', confidence: 'high', description: 'Landing page', fix: null },
      { type: 'docs', url: 'https://example.com/docs', found: true, status: 'detected', confidence: 'high', description: 'Docs page', fix: null },
    ];
    const graph: ContextGraph = {
      nodes: [{ id: 'root:domain', label: 'Root', type: 'canonical_link' }],
      edges: [],
      metrics: { islands: 0, deadEnds: 0, missingBridges: 0, adjacencyScore: 10, continuityScore: 10 },
    };

    const plan = await createScanPlan(surfaces, graph);
    expect(plan.journeys.length).toBeGreaterThanOrEqual(8);
    expect(plan.isDynamic).toBe(false);
  });

  it('token budget manager correctly tracks usage and enforces budget limits', () => {
    const manager = new TokenBudgetManager({ maxTotalTokensPerJourney: 1000, maxStepsPerJourney: 3 });

    expect(manager.isExceeded().exceeded).toBe(false);

    manager.recordUsage(400, 200);
    expect(manager.getUsage().totalTokens).toBe(600);
    expect(manager.isExceeded().exceeded).toBe(false);

    manager.recordUsage(300, 200);
    expect(manager.getUsage().totalTokens).toBe(1100);
    expect(manager.isExceeded().exceeded).toBe(true);
    expect(manager.isExceeded().reason).toContain('Token budget limit');
  });

  it('evaluator verifies empirical ground truth traces', () => {
    const trace: JourneyTrace = {
      journey: 'authenticate',
      label: 'Authenticate',
      goal: 'auth',
      mode: 'canonical',
      status: 'passed',
      success: true,
      confidence: 'high',
      startSurface: 'Docs Root',
      steps: [
        {
          step: 1,
          nodeId: 'tool:verify_goal',
          nodeLabel: 'verify_goal',
          nodeType: 'machine_entrypoint',
          action: 'Called tool verify_goal',
          found: 'Verified Goal',
          outcome: 'success',
          inferenceRequired: false,
          stepConfidence: 'high',
          canonical: true,
        },
      ],
      breakpoint: null,
      cost: { pagesVisited: 1, inferencePoints: 0, tokenWasteEstimate: 'low', hops: 1, retrievalBreadth: 1 },
      recommendedFix: null,
      hallucinationPressure: 'low',
      hopCount: 1,
      retrievalBreadth: 1,
      fragmentationScore: 0,
    };

    const context = {
      graph: { nodes: [], edges: [], metrics: { islands: 0, deadEnds: 0, missingBridges: 0, adjacencyScore: 0, continuityScore: 0 } },
      surfaces: [],
      pages: [],
    };

    const evaluation = evaluateAgentTrace(trace, context);
    expect(evaluation.empiricallyVerified).toBe(true);
  });
});
