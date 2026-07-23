/**
 * MCP Tool: build_knowledge_graph
 * Build a semantic knowledge graph from crawled pages.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanSession } from '../session.js';
import { getSessionStatus, getNextSteps } from '../session.js';
import { buildContextGraph } from '@scanner/v2/graph';
import { ARS_VERSION } from '@scanner/v2/ars';

export function registerBuildGraph(server: McpServer, session: ScanSession): void {
  server.tool(
    'build_knowledge_graph',
    `Build a semantic knowledge graph from crawled pages. Maps concepts, API operations, documentation topics, and their relationships. Identifies isolated clusters (content agents cannot reach), broken pathways, and coverage gaps. Requires crawl_pages to have been called first. Returns graph metrics and a summary of the topology. No API keys required.`,
    {},
    async () => {
      try {
        if (!session.pages || !session.surfaces) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: 'Requires crawl_pages first. Call crawl_pages or score_readiness (auto-runs all stages).',
              session_status: getSessionStatus(session),
            }) }],
            isError: true,
          };
        }

        const graph = await buildContextGraph(session.surfaces, session.pages, () => {});
        session.graph = graph;

        // Extract top concepts by node type
        const conceptNodes = graph.nodes.filter((n) => n.type === 'concept');
        const apiNodes = graph.nodes.filter((n) => n.type === 'operation' || n.type === 'api');
        const isolatedNodes = graph.nodes.filter((n) => {
          const hasEdge = graph.edges.some((e) => e.source === n.id || e.target === n.id);
          return !hasEdge;
        });

        const result = {
          nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length,
          nodeTypes: Object.entries(
            graph.nodes.reduce((acc, n) => {
              acc[n.type] = (acc[n.type] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          ),
          metrics: {
            islands: graph.metrics.islands,
            deadEnds: graph.metrics.deadEnds,
            missingBridges: graph.metrics.missingBridges,
            adjacencyScore: graph.metrics.adjacencyScore,
            continuityScore: graph.metrics.continuityScore,
            components: graph.metrics.components,
            pathDocsToAuth: graph.metrics.pathDocsToAuth,
          },
          topConcepts: conceptNodes.slice(0, 10).map((n) => n.label),
          apiOperations: apiNodes.slice(0, 15).map((n) => n.label),
          isolatedClusters: isolatedNodes.slice(0, 10).map((n) => ({ id: n.id, label: n.label, type: n.type })),
          gaps: [
            ...(graph.metrics.islands > 0 ? [`${graph.metrics.islands} isolated content clusters unreachable from main graph`] : []),
            ...(graph.metrics.deadEnds > 0 ? [`${graph.metrics.deadEnds} dead-end pages with no outgoing links`] : []),
            ...(graph.metrics.missingBridges > 0 ? [`${graph.metrics.missingBridges} missing bridge connections between topics`] : []),
            ...(graph.metrics.pathDocsToAuth === false ? ['No path from docs root to authentication concept'] : []),
          ],
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
