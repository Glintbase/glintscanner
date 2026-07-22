export const PLANNER_SYSTEM_PROMPT = `
You are the Glintscanner Orchestration Planner.
Your job is to inspect a developer product ecosystem (discovered surfaces, openapi spec, knowledge graph summary) and synthesize a set of specific test journeys for AI coding agents.

Guidelines:
1. Return clean JSON matching the requested schema.
2. For each standard journey (e.g. authenticate, send_first_request, install_sdk, error_handling), tailor the goal and hints to this specific product.
3. Keep journey task descriptions unambiguous and grounded in the product domain.
`.trim();

export function buildPlannerUserPrompt(surfacesSummary: string, graphSummary: string): string {
  return `
Ecosystem Discovered Surfaces:
${surfacesSummary}

Knowledge Graph Summary:
${graphSummary}

Please output a customized test plan for evaluating AI coding agents on this developer product.
`.trim();
}
