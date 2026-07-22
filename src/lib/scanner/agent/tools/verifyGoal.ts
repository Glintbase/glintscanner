import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';

export function createVerifyGoalTool(context: ToolContext) {
  return tool({
    description:
      'Call this tool when you believe you have successfully completed the journey task and identified the target surface/content.',
    inputSchema: z.object({
      targetUrl: z.string().describe('The URL of the target document or endpoint page'),
      evidenceSnippet: z
        .string()
        .describe('Specific evidence quote, heading, or code snippet found on the surface'),
      explanation: z.string().describe('Brief explanation of how this satisfies the journey goal'),
    }),
    execute: async ({ targetUrl, evidenceSnippet, explanation }) => {
      const u = targetUrl.toLowerCase().trim();

      const pageMatch = context.pages.find((p) => p.url.toLowerCase().includes(u));
      const surfaceMatch = context.surfaces.find((s) => s.url.toLowerCase().includes(u) && s.found);
      const nodeMatch = context.graph.nodes.find(
        (n) => !n.synthetic && (n.url?.toLowerCase().includes(u) || n.id.toLowerCase().includes(u))
      );

      const isValidGroundTruth = !!(pageMatch || surfaceMatch || nodeMatch);

      return {
        completed: true,
        verifiedByEvaluator: isValidGroundTruth,
        targetUrl,
        evidenceSnippet,
        explanation,
        verificationReason: isValidGroundTruth
          ? 'Goal completion verified against scraped page corpus & graph nodes.'
          : 'Warning: Claimed URL does not match any verified scraped surface (possible hallucination).',
      };
    },
  });
}
