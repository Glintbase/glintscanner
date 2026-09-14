/**
 * MCP Tool: discover_products
 * Natural language intent discovery of agent-ready products and APIs.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanSession } from '../session.js';

interface IndexedProduct {
  domain: string;
  name: string;
  category: string;
  arsScore: number;
  hasMcp: boolean;
  hasLlmsTxt: boolean;
  hasOpenApi: boolean;
  description: string;
}

const INDEXED_CATALOG: IndexedProduct[] = [
  {
    domain: 'stripe.com',
    name: 'Stripe',
    category: 'Payments / FinTech',
    arsScore: 92,
    hasMcp: true,
    hasLlmsTxt: true,
    hasOpenApi: true,
    description: 'Financial infrastructure platform for machine and human commerce.',
  },
  {
    domain: 'supabase.com',
    name: 'Supabase',
    category: 'Database / Backend',
    arsScore: 95,
    hasMcp: true,
    hasLlmsTxt: true,
    hasOpenApi: true,
    description: 'Open source Firebase alternative with Postgres and vector embeddings.',
  },
  {
    domain: 'resend.com',
    name: 'Resend',
    category: 'Email / Messaging',
    arsScore: 90,
    hasMcp: true,
    hasLlmsTxt: true,
    hasOpenApi: true,
    description: 'Developer-first email platform for transactional and marketing delivery.',
  },
  {
    domain: 'pinecone.io',
    name: 'Pinecone',
    category: 'Vector Database / AI Infrastructure',
    arsScore: 88,
    hasMcp: true,
    hasLlmsTxt: true,
    hasOpenApi: true,
    description: 'Managed vector database designed for AI application memory and search.',
  },
  {
    domain: 'qdrant.tech',
    name: 'Qdrant',
    category: 'Vector Database / Search Engine',
    arsScore: 89,
    hasMcp: true,
    hasLlmsTxt: true,
    hasOpenApi: true,
    description: 'High-performance open-source vector search engine with extended filtering.',
  },
];

export function registerDiscoverProducts(server: McpServer, _session: ScanSession): void {
  server.tool(
    'discover_products',
    'Search the Glintbase indexed ecosystem of agent-ready developer tools, APIs, and products by natural language query (e.g. "vector databases with MCP support", "email APIs"). Returns matching products with their ARS scores and machine interfaces.',
    {
      query: z.string().describe('Search term or query intent'),
      category: z.string().optional().describe('Optional category filter (e.g. "Payments", "Database", "AI Infrastructure")'),
      minScore: z.number().optional().describe('Minimum ARS 2.0 readiness score (0-100)'),
    },
    async ({ query, category, minScore }) => {
      const q = query.toLowerCase();
      let results = INDEXED_CATALOG.filter((p) => {
        const matchesQuery =
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q);
        const matchesCat = category ? p.category.toLowerCase().includes(category.toLowerCase()) : true;
        const matchesScore = minScore ? p.arsScore >= minScore : true;
        return matchesQuery && matchesCat && matchesScore;
      });

      if (results.length === 0) {
        // Fallback: return top rated items
        results = INDEXED_CATALOG.slice(0, 3);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                query,
                match_count: results.length,
                products: results,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
