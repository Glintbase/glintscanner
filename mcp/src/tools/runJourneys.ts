/**
 * MCP Tool: run_journeys
 * Run deterministic agent journey simulations against the knowledge graph.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanSession } from '../session.js';
import { getSessionStatus, getNextSteps } from '../session.js';
import { simulateAgentJourneys } from '@scanner/v2/journey';
import { ARS_VERSION } from '@scanner/v2/ars';

export function registerRunJourneys(server: McpServer, session: ScanSession): void {
  server.tool(
    'run_journeys',
    `Run deterministic agent journey simulations against the knowledge graph. Tests whether an AI agent can complete real integration tasks (find auth docs, locate API endpoints, discover SDK install steps) using only the available documentation. Returns per-journey traces with hop counts, hallucination pressure, and specific failure points. No LLM required — uses graph traversal. Requires build_knowledge_graph first.`,
    {
      journeys: z.array(z.string()).optional().describe('Optional filter: only run these journey names'),
    },
    async ({ journeys }) => {
      try {
        if (!session.graph) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: 'Requires build_knowledge_graph first. Call build_knowledge_graph or score_readiness (auto-runs all stages).',
              session_status: getSessionStatus(session),
            }) }],
            isError: true,
          };
        }

        // Note: enabledSurfaces filters by surface dependency type (api, docs, etc.),
        // not journey names. We run all journeys then filter traces by name if requested.
        const simulation = await simulateAgentJourneys(session.graph, () => {});

        // Filter traces by journey name if the caller specified a subset
        if (journeys && journeys.length > 0) {
          simulation.traces = simulation.traces.filter((t) =>
            journeys.some((j) => t.journey === j || t.label === j)
          );
        }

        session.journeys = simulation;

        const result = {
          completionRate: simulation.overallCompletionRate,
          avgHopCount: simulation.avgHopCount,
          totalJourneys: simulation.traces.length,
          passedJourneys: simulation.traces.filter((t) => t.success).length,
          traces: simulation.traces.map((t) => ({
            journey: t.journey,
            label: t.label,
            goal: t.goal,
            success: t.success,
            status: t.status,
            hopCount: t.hopCount,
            hallucinationPressure: t.hallucinationPressure,
            confidence: t.confidence,
            breakpoint: t.breakpoint ? {
              type: t.breakpoint.type,
              surface: t.breakpoint.surface,
              reason: t.breakpoint.reason,
            } : null,
            recommendedFix: t.recommendedFix,
          })),
          highRiskJourneys: simulation.highRiskJourneys,
          score_version: ARS_VERSION,
          session_status: getSessionStatus(session),
          next_steps: getNextSteps(session),
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );
}
