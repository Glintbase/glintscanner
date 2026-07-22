import { generateText } from 'ai';
import { getAgentModel, TokenBudgetManager, LLMProviderConfig } from './providers';
import { getAgentTools, ToolContext } from './tools';
import { JOURNEY_AGENT_SYSTEM_PROMPT, buildJourneyUserPrompt } from './prompts/journeyPrompt';
import type { PlannedJourneyTask } from './planner';
import type { JourneyTrace, JourneyStep, JourneyCost } from '../v2/types';

export interface AgentRunnerOptions {
  providerConfig?: LLMProviderConfig;
  onProgress?: (log: any) => void;
}

export async function runAgentJourney(
  task: PlannedJourneyTask,
  context: ToolContext,
  options: AgentRunnerOptions = {}
): Promise<JourneyTrace> {
  const governor = new TokenBudgetManager();
  const tools = getAgentTools(context);
  const steps: JourneyStep[] = [];

  let isSuccess = false;
  let verifiedEvidenceSnippet: string | undefined;
  let verifiedTargetUrl: string | undefined;
  let lastReason: string = 'Agent started journey';

  try {
    const model = await getAgentModel(options.providerConfig);
    const userPrompt = buildJourneyUserPrompt(task.id, task.label, task.goal, task.startSurface);

    options.onProgress?.({
      type: 'progress',
      check: 'agent_journey',
      status: 'running',
      message: `[Agent] Starting LLM journey: ${task.label}...`,
    });

    const response = await generateText({
      model,
      system: JOURNEY_AGENT_SYSTEM_PROMPT,
      prompt: userPrompt,
      tools: tools as any,
      maxSteps: task.maxHops || 8,
    } as any);

    // Process steps and tool calls
    if (response.steps) {
      let stepNumber = 1;
      for (const s of response.steps) {
        if (governor.isExceeded().exceeded) break;

        // Record token usage if available
        if (s.usage) {
          const prompt = (s.usage as any).promptTokens ?? (s.usage as any).inputTokens ?? 0;
          const completion = (s.usage as any).completionTokens ?? (s.usage as any).outputTokens ?? 0;
          governor.recordUsage(prompt, completion);
        }

        const toolCalls = (s as any).toolCalls || [];
        const toolResults = (s as any).toolResults || [];

        for (let idx = 0; idx < toolCalls.length; idx++) {
          const tc = toolCalls[idx];
          const tr = toolResults[idx]?.result || {};
          const toolName = tc.toolName || tc.name;
          const args = tc.args || tc.input || {};
          const isVerify = toolName === 'verify_goal';
          const outcome: JourneyStep['outcome'] = isVerify ? 'success' : 'progress';

          let nodeLabel = toolName;
          let action = `Executed tool ${toolName}`;
          let found = 'Tool Execution';
          let nodeType = 'machine_entrypoint';
          let stepUrl: string | undefined = tr.url || undefined;

          if (toolName === 'search_docs') {
            const q = args.query || args.q || task.goal;
            nodeLabel = `Search Corpus: "${q}"`;
            action = `Searched documentation and knowledge graph for "${q}"`;
            found = tr.message || `Queried scraped surface nodes for matching terms`;
            if (tr.results && tr.results.length > 0) {
              const top = tr.results[0];
              if (top.url && top.url.startsWith('http')) {
                stepUrl = top.url;
              }
              found = `Found ${tr.results.length} pages: ${tr.results.map((r: any) => r.title || r.url).slice(0, 2).join(', ')}`;
            }
            nodeType = 'concept';
          } else if (toolName === 'read_surface') {
            const target = tr.url || args.url || 'surface';
            if (target.startsWith('http')) stepUrl = target;
            const title = tr.title || target;
            nodeLabel = stepUrl || (title !== 'surface' ? title : `Read Surface: ${args.url}`);
            action = `Navigated to and read surface: ${title}`;
            found = tr.description || tr.message || `Parsed surface body, headings, and code samples`;
            nodeType = 'page';
          } else if (toolName === 'inspect_openapi_spec') {
            const p = args.pathOrOperation || 'spec';
            nodeLabel = `OpenAPI Spec: ${p}`;
            action = `Inspected OpenAPI endpoint path and schema definitions`;
            found = tr.message || `Discovered matching OpenAPI HTTP operation schemas`;
            nodeType = 'api';
          } else if (toolName === 'verify_goal') {
            const targetUrl = args.targetUrl || tr.url || '';
            if (targetUrl.startsWith('http')) stepUrl = targetUrl;
            nodeLabel = stepUrl || `Goal Verified: ${task.label}`;
            action = `Asserted journey completion with empirical evidence`;
            found = args.evidenceSnippet ? `Evidence: "${args.evidenceSnippet.slice(0, 100)}"` : 'Verified target surface';
            nodeType = 'canonical_link';
          }

          options.onProgress?.({
            type: 'progress',
            check: 'agent_journey',
            status: 'running',
            message: `[Agent] ${task.label}: Step ${stepNumber} -> ${nodeLabel}`,
          });

          if (isVerify) {
            isSuccess = true;
            verifiedEvidenceSnippet = args.evidenceSnippet;
            verifiedTargetUrl = args.targetUrl;
            lastReason = args.explanation || 'Verified goal completion';
          }

          steps.push({
            step: stepNumber++,
            nodeId: `tool:${toolName}:${stepNumber}`,
            nodeLabel,
            nodeType: nodeType as any,
            url: stepUrl,
            action,
            found,
            outcome,
            inferenceRequired: false,
            stepConfidence: 'high',
            canonical: true,
          });
        }
      }
    }
  } catch (err: any) {
    console.error(`[Agent Runner Execution Error] Task: ${task.id}:`, err);
    lastReason = `LLM execution error: ${err.message}`;
  }

  const usage = governor.getUsage();
  const hopCount = steps.length;

  const cost: JourneyCost = {
    pagesVisited: steps.length,
    inferencePoints: 0,
    tokenWasteEstimate: usage.totalTokens > 10000 ? 'high' : usage.totalTokens > 3000 ? 'medium' : 'low',
    hops: hopCount,
    retrievalBreadth: steps.length,
  };

  const status = isSuccess ? 'passed' : 'failed';
  const confidence = isSuccess ? 'high' : 'low';
  const hallucinationPressure = isSuccess ? 'low' : 'high';

  return {
    journey: task.id,
    label: task.label,
    goal: task.goal,
    mode: task.mode,
    status,
    success: isSuccess,
    confidence,
    startSurface: task.startSurface,
    steps,
    breakpoint: isSuccess
      ? null
      : {
          type: 'max_hops_exceeded',
          surface: task.startSurface,
          reason: lastReason,
        },
    cost,
    recommendedFix: isSuccess
      ? null
      : `Add a canonical quickstart path or llms.txt entrypoint for "${task.goal}" to assist LLM agents.`,
    hallucinationPressure,
    hopCount,
    retrievalBreadth: cost.retrievalBreadth,
    fragmentationScore: 0,
  };
}
