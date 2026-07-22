import { generateText } from 'ai';
import { getAgentModel } from './providers';
import { PLANNER_SYSTEM_PROMPT, buildPlannerUserPrompt } from './prompts/plannerPrompt';
import type { DiscoveredSurface, ContextGraph } from '../v2/types';
import { JOURNEYS } from '../v2/journey';

export interface PlannedJourneyTask {
  id: string;
  label: string;
  goal: string;
  mode: 'canonical' | 'recovery' | 'ambiguous';
  startSurface: string;
  maxHops: number;
}

export interface ScanPlan {
  productName: string;
  journeys: PlannedJourneyTask[];
  isDynamic: boolean;
}

export async function createScanPlan(
  surfaces: DiscoveredSurface[],
  graph: ContextGraph,
  options?: { enabledSurfaces?: string[]; provider?: string; skipLLM?: boolean }
): Promise<ScanPlan> {
  const isTestEnv = process.env.NODE_ENV === 'test' || options?.skipLLM || options?.provider === 'none';

  if (!isTestEnv) {
    try {
      const surfaceSummary = surfaces
        .filter((s) => s.found)
        .map((s) => `- ${s.type}: ${s.url} (${s.description})`)
        .join('\n');

      const graphSummary = `${graph.nodes.length} nodes, ${graph.edges.length} edges across ${graph.metrics.components || 1} component(s).`;

      const model = await getAgentModel({ provider: (options?.provider as any) || 'auto' });
      const userPrompt = buildPlannerUserPrompt(surfaceSummary, graphSummary);

      const { text } = await generateText({
        model,
        system: PLANNER_SYSTEM_PROMPT,
        prompt: userPrompt,
      });

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.journeys) && parsed.journeys.length > 0) {
          return {
            productName: parsed.productName || 'Target Ecosystem',
            journeys: parsed.journeys,
            isDynamic: true,
          };
        }
      }
    } catch {
      // Fallback
    }
  }

  // Static Fallback Plan
  const journeys: PlannedJourneyTask[] = JOURNEYS.map((j) => ({
    id: j.id,
    label: j.label,
    goal: j.goal,
    mode: j.mode,
    startSurface: j.startTypes[0] || 'canonical_link',
    maxHops: j.maxHops,
  }));

  return {
    productName: 'Developer Product',
    journeys,
    isDynamic: false,
  };
}
