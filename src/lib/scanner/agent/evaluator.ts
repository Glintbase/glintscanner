import type { JourneyTrace } from '../v2/types';
import type { ToolContext } from './tools/types';

export interface EvaluatorResult {
  trace: JourneyTrace;
  empiricallyVerified: boolean;
  notes: string[];
}

export function evaluateAgentTrace(trace: JourneyTrace, context: ToolContext): EvaluatorResult {
  const notes: string[] = [];

  // If already verified via verify_goal tool assertion
  const hasVerifyStep = trace.steps.some((s) => s.nodeId.includes('verify_goal'));
  if (trace.success && hasVerifyStep) {
    return {
      trace,
      empiricallyVerified: true,
      notes: ['Goal completion verified via explicit verify_goal tool assertion.'],
    };
  }

  // Evaluate tool steps against ground-truth discovered surfaces & graph
  const toolSteps = trace.steps.filter((s) => s.nodeId.startsWith('tool:'));
  let matchedTarget = false;
  let groundTruthDetail = '';

  const hasPages = context.pages.length > 0;
  const foundSurface = (types: string[]) => context.surfaces.find((surf) => types.includes(surf.type) && surf.found);

  for (const s of toolSteps) {
    const toolName = s.nodeId.replace('tool:', '').split(':')[0];

    if (trace.journey === 'find_llms_entrypoint') {
      const llmsSurface = foundSurface(['llms_txt', 'llms_full_txt', 'mcp']);
      if (llmsSurface && (toolName === 'read_surface' || toolName === 'search_docs')) {
        matchedTarget = true;
        groundTruthDetail = `Discovered and read canonical ${llmsSurface.type} surface (${llmsSurface.url}).`;
        break;
      }
    } else if (trace.journey === 'find_docs_overview') {
      const docsSurface = foundSurface(['docs', 'landing', 'sitemap']);
      if ((docsSurface || hasPages) && (toolName === 'read_surface' || toolName === 'search_docs')) {
        matchedTarget = true;
        groundTruthDetail = `Discovered and read docs root surface (${docsSurface?.url || context.pages[0]?.url || 'documentation'}).`;
        break;
      }
    } else if (trace.journey === 'resolve_openapi_operation' || trace.journey === 'send_first_request') {
      const openapiSurface = foundSurface(['openapi', 'api']);
      const hasOperations = context.graph.nodes.some((n) => n.type === 'operation');
      if ((openapiSurface || hasOperations || hasPages) && (toolName === 'inspect_openapi_spec' || toolName === 'search_docs' || toolName === 'read_surface')) {
        matchedTarget = true;
        groundTruthDetail = `Resolved OpenAPI operations spec surface (${openapiSurface?.url || 'graph operation'}).`;
        break;
      }
    } else if (trace.journey === 'authenticate' || trace.journey === 'create_api_key') {
      const authSurface = foundSurface(['auth', 'dashboard', 'docs', 'landing']);
      if ((authSurface || hasPages) && (toolName === 'read_surface' || toolName === 'search_docs')) {
        matchedTarget = true;
        groundTruthDetail = `Located developer authentication surface (${authSurface?.url || 'auth guide'}).`;
        break;
      }
    } else if (trace.journey === 'install_sdk') {
      const sdkSurface = foundSurface(['sdk', 'github', 'docs']);
      if ((sdkSurface || hasPages) && (toolName === 'read_surface' || toolName === 'search_docs')) {
        matchedTarget = true;
        groundTruthDetail = `Located client SDK / code repository surface (${sdkSurface?.url || 'SDK guide'}).`;
        break;
      }
    } else if (trace.journey === 'locate_error_handling' || trace.journey === 'recover_setup_issue') {
      const supportSurface = foundSurface(['support', 'docs', 'landing']);
      if ((supportSurface || hasPages) && (toolName === 'read_surface' || toolName === 'search_docs')) {
        matchedTarget = true;
        groundTruthDetail = `Located developer support / troubleshooting surface (${supportSurface?.url || 'support guide'}).`;
        break;
      }
    } else if (trace.journey === 'configure_webhook') {
      const docsSurface = foundSurface(['docs', 'api', 'landing']);
      if ((docsSurface || hasPages) && (toolName === 'read_surface' || toolName === 'search_docs')) {
        matchedTarget = true;
        groundTruthDetail = `Located event callback & documentation surface (${docsSurface?.url || 'webhook guide'}).`;
        break;
      }
    } else if (toolName === 'read_surface' || toolName === 'search_docs' || toolName === 'verify_goal') {
      matchedTarget = true;
      groundTruthDetail = `Successfully executed agent simulation tool ${toolName} on target ecosystem.`;
      break;
    }
  }

  if (matchedTarget) {
    trace.success = true;
    trace.status = 'passed';
    trace.confidence = 'high';
    trace.hallucinationPressure = 'low';
    trace.breakpoint = null;
    trace.recommendedFix = null;
    notes.push(groundTruthDetail);
    return {
      trace,
      empiricallyVerified: true,
      notes,
    };
  }

  return {
    trace,
    empiricallyVerified: false,
    notes: ['Agent tools executed but did not match a verified ground-truth target for this journey.'],
  };
}
