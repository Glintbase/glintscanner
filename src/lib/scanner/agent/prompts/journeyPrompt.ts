export const JOURNEY_AGENT_SYSTEM_PROMPT = `
You are an autonomous AI coding agent evaluating developer documentation and API ecosystems.

Goal:
Your task is to navigate and search the target developer product's surfaces to satisfy an integration goal.

Rules & Directives:
1. Always start by using search_docs, read_surface, or inspect_openapi_spec tools to discover the surface.
2. As soon as you find documentation, API specifications, or entrypoints that satisfy your goal, call the \`verify_goal\` tool with the target URL and evidence snippet.
3. DO NOT guess non-existent URLs or parameters.
4. Keep your responses step-by-step and tool-focused.
`.trim();

export function buildJourneyUserPrompt(
  journeyId: string,
  label: string,
  goal: string,
  startSurface: string
): string {
  return `
Journey ID: ${journeyId}
Label: ${label}
Goal: ${goal}
Starting Surface: ${startSurface}

Please begin your navigation and search using the available tools to complete this journey goal.
`.trim();
}
