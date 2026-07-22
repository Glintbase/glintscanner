import { createScanPlan } from './planner';
import { runAgentJourney } from './runner';
import { evaluateAgentTrace } from './evaluator';
import type { ContextGraph, DiscoveredSurface, ExtractedPage, JourneySimulation, JourneyTrace } from '../v2/types';
import type { LLMProviderConfig } from './providers';

export interface DispatcherOptions {
  concurrency?: number;
  providerConfig?: LLMProviderConfig;
  onProgress?: (log: any) => void;
}

export async function runAgentSimulationHarness(
  graph: ContextGraph,
  surfaces: DiscoveredSurface[],
  pages: Omit<ExtractedPage, 'html'>[],
  options: DispatcherOptions = {}
): Promise<JourneySimulation> {
  const emit = (status: string, message?: string) => {
    options.onProgress?.({ type: 'progress', check: 'agent_harness', status, message });
  };

  emit('running', 'Initializing LLM Multi-Agent Journey Harness...');

  // Phase 1: Create Plan
  const plan = await createScanPlan(surfaces, graph, { provider: options.providerConfig?.provider });
  emit('running', `Plan generated for ${plan.productName} (${plan.journeys.length} journeys, dynamic=${plan.isDynamic})`);

  const toolContext = { graph, surfaces, pages };
  const providerName = options.providerConfig?.provider;
  const isGoogle = providerName === 'google' || Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY);
  
  // Rate limit governor: Google Gemma has 30 RPM limit -> concurrency 1 or 2 with 2100ms throttle
  const concurrency = options.concurrency || (isGoogle ? 1 : 3);
  const traces: JourneyTrace[] = [];

  // Phase 4: Run Journeys in Chunks / Concurrency Pool
  for (let i = 0; i < plan.journeys.length; i += concurrency) {
    if (i > 0 && isGoogle) {
      // Throttle delay to respect 30 RPM limit
      await new Promise((resolve) => setTimeout(resolve, 2100));
    }

    const batch = plan.journeys.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((task) => runAgentJourney(task, toolContext, { providerConfig: options.providerConfig, onProgress: options.onProgress }))
    );

    for (const trace of results) {
      const evaluation = evaluateAgentTrace(trace, toolContext);
      traces.push(evaluation.trace);
    }
  }

  const successCount = traces.filter((t) => t.success).length;
  const overallCompletionRate = traces.length > 0 ? Math.round((successCount / traces.length) * 100) : 0;
  const avgHopCount = traces.length > 0 ? Math.round(traces.reduce((s, t) => s + t.hopCount, 0) / traces.length) : 0;
  const avgFragmentationScore = 0;
  const highRiskJourneys = traces.filter((t) => t.hallucinationPressure === 'high').map((t) => t.label);

  emit('done', `Agent harness complete: ${successCount}/${traces.length} journeys passed (${overallCompletionRate}%)`);

  return {
    traces,
    overallCompletionRate,
    avgHopCount,
    avgFragmentationScore,
    highRiskJourneys,
  };
}
