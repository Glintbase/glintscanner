/**
 * Counterfactual Sandbox Simulation Engine for Glintbase Flight Simulator.
 * Demonstrates "What If" impact of remediations by comparing baseline trajectory
 * against an in-memory virtual sandbox mounted with generated fixes.
 */

import {
  SimulationOptions,
  SimulationTelemetry,
  CounterfactualComparison,
  TargetContext
} from './types';
import { AgentPersona } from './personas/base';
import { DeterministicEngine } from './engines/deterministicEngine';

export class CounterfactualHarness {
  /**
   * Runs baseline simulation, then mounts virtual fixes to compute counterfactual delta.
   */
  static async evaluate(
    persona: AgentPersona,
    baselineContext: TargetContext,
    options: SimulationOptions,
    baselineTelemetry: SimulationTelemetry
  ): Promise<CounterfactualComparison> {
    const fixedBottlenecks: string[] = [];

    // Synthesize remediated virtual context
    const remediatedContext: TargetContext = {
      ...baselineContext,
      mcpTools: [...(baselineContext.mcpTools || [])]
    };

    if (!remediatedContext.llmsTxt) {
      remediatedContext.llmsTxt = `# ${pathBasename(baselineContext.targetUrl)} Agent Readiness Index\n> Developer-first API & tool catalog for autonomous AI agents.\n\n- [API Reference](/openapi.json): Full OpenAPI 3.1 specification\n- [Authentication Guide](/auth.md): Bearer & API-Key handbook\n- [MCP Server](/api/mcp): Streamable HTTP Model Context Protocol endpoints\n`;
      fixedBottlenecks.push('Missing /llms.txt index');
    }

    if (!remediatedContext.authMd) {
      remediatedContext.authMd = `---\ntitle: Agent Authentication Guide\nversion: 1.0\nauth_scheme: Bearer\n---\n# Authentication\n\nAll agent requests must supply an Authorization header:\n\`Authorization: Bearer <API_KEY>\`\n`;
      fixedBottlenecks.push('Missing /auth.md specification');
    }

    if (remediatedContext.hasCanaryLeak) {
      remediatedContext.hasCanaryLeak = false;
      remediatedContext.has404Handler = true;
      fixedBottlenecks.push('Anti-SPA 404 handler');
    }

    const hasStatusTool = (remediatedContext.mcpTools || []).some(t => t.name.includes('status'));
    if (!hasStatusTool) {
      remediatedContext.mcpTools = [
        ...(remediatedContext.mcpTools || []),
        {
          name: 'get_target_status',
          description: 'Get operational status and telemetry for target',
          inputSchema: {
            type: 'object',
            properties: {
              targetId: { type: 'string', description: 'Unique target identifier' }
            },
            required: ['targetId']
          },
          readOnlyHint: true
        }
      ];
      fixedBottlenecks.push('Unexposed MCP tools manifest');
    }

    // Run deterministic simulation against remediated virtual context
    const afterTelemetry = await DeterministicEngine.run(persona, remediatedContext, {
      ...options,
      intent: options.intent ? (options.intent.includes('status') ? options.intent : 'get target status') : undefined
    });

    const tokensSavedPercent = baselineTelemetry.totalTokensBurned > 0
      ? Math.max(0, Math.round(((baselineTelemetry.totalTokensBurned - afterTelemetry.totalTokensBurned) / baselineTelemetry.totalTokensBurned) * 100))
      : 0;

    const baselineLatency = baselineTelemetry.ttftcMs || baselineTelemetry.totalDurationMs;
    const afterLatency = afterTelemetry.ttftcMs || afterTelemetry.totalDurationMs;
    const latencySavedPercent = baselineLatency > 0
      ? Math.max(0, Math.round(((baselineLatency - afterLatency) / baselineLatency) * 100))
      : 0;

    return {
      before: baselineTelemetry,
      after: afterTelemetry,
      tokensSavedPercent,
      latencySavedPercent,
      fixedBottlenecks,
      resolved: afterTelemetry.outcome === 'completed'
    };
  }
}

function pathBasename(target: string): string {
  try {
    const url = new URL(target);
    return url.hostname;
  } catch {
    return target.split(/[\\/]/).filter(Boolean).pop() || 'Target';
  }
}
