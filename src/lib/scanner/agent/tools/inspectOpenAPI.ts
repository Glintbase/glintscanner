import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';

export function createInspectOpenAPITool(context: ToolContext) {
  return tool({
    description: 'Inspect OpenAPI operation nodes, HTTP endpoints, or API schemas discovered in the target.',
    inputSchema: z.object({
      pathOrOperation: z
        .string()
        .optional()
        .describe('Specific endpoint path or keyword to filter (e.g. "/v1/tokens", "auth", "POST")'),
    }),
    execute: async ({ pathOrOperation }) => {
      const openapiSurface = context.surfaces.find((s) => s.type === 'openapi');
      if (!openapiSurface || !openapiSurface.found) {
        return {
          found: false,
          specUrl: '',
          totalOperationsCount: 0,
          matchedOperations: [],
          message: 'No valid OpenAPI specification surface was discovered for this product target.',
        };
      }

      const operationNodes = context.graph.nodes.filter((n) => n.type === 'operation');

      let filtered = operationNodes;
      if (pathOrOperation) {
        const query = pathOrOperation.toLowerCase();
        filtered = operationNodes.filter(
          (n) => n.label.toLowerCase().includes(query) || n.id.toLowerCase().includes(query)
        );
      }

      const matchedOperations = filtered.slice(0, 5).map((n) => ({
        id: n.id,
        label: n.label,
        snippet: n.evidence?.snippet || '',
      }));

      return {
        found: true,
        specUrl: openapiSurface.url,
        totalOperationsCount: operationNodes.length,
        matchedOperations,
        message: `Discovered ${matchedOperations.length} OpenAPI operations`,
      };
    },
  });
}
