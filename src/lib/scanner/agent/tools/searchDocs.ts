import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';

export function createSearchDocsTool(context: ToolContext) {
  return tool({
    description: 'Search documentation pages and knowledge graph nodes for keywords, headings, or code snippets.',
    inputSchema: z.object({
      query: z.string().describe('Search query or keyword (e.g., "auth", "API key", "curl", "webhook")'),
    }),
    execute: async ({ query }) => {
      const q = query.toLowerCase().trim();
      const matchedResults: Array<{ title: string; url: string; snippet: string; score: number }> = [];

      for (const page of context.pages) {
        let score = 0;
        const titleMatch = page.title.toLowerCase().includes(q);
        const urlMatch = page.url.toLowerCase().includes(q);
        const headingMatch = page.headings.some((h) => h.toLowerCase().includes(q));

        if (titleMatch) score += 5;
        if (urlMatch) score += 3;
        if (headingMatch) score += 4;

        if (score > 0) {
          matchedResults.push({
            title: page.title,
            url: page.url,
            snippet: page.headings.slice(0, 3).join(' > '),
            score,
          });
        }
      }

      for (const node of context.graph.nodes) {
        if (node.synthetic) continue;
        const text = `${node.label} ${node.id} ${node.type} ${node.evidence?.snippet || ''}`.toLowerCase();
        if (text.includes(q)) {
          matchedResults.push({
            title: node.label,
            url: node.url || node.evidence?.source_url || '',
            snippet: node.evidence?.snippet || node.evidence?.heading || `Node type: ${node.type}`,
            score: 2,
          });
        }
      }

      matchedResults.sort((a, b) => b.score - a.score);
      const results = matchedResults.slice(0, 5);

      return {
        found: results.length > 0,
        count: results.length,
        results,
        message: results.length > 0 ? `Found ${results.length} results` : `No documentation matches found for "${query}"`,
      };
    },
  });
}
