/**
 * MCP Tool: crawl_pages
 * Crawl the product's documentation ecosystem with a priority-queue budget.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanSession } from '../session.js';
import { getSessionStatus, getNextSteps } from '../session.js';
import { discoverEcosystem } from '@scanner/v2/discovery';
import { classifySurfaces } from '@scanner/v2/classification';
import { crawlEcosystem } from '@scanner/v2/crawler';
import { ARS_VERSION } from '@scanner/v2/ars';

export function registerCrawlPages(server: McpServer, session: ScanSession): void {
  server.tool(
    'crawl_pages',
    `Crawl the product's documentation ecosystem with a priority-queue budget. Extracts page titles, content quality metrics, internal links, and machine-readability scores. Requires discover_surfaces to have been called first (or provide a url to auto-discover). Returns structured page data for graph building. Set max_pages to control crawl budget (default 30 for quick, 80 for deep). No API keys required.`,
    {
      max_pages: z.number().optional().describe('Maximum pages to crawl (default: 30 quick, 80 deep)'),
      profile: z.enum(['quick', 'deep']).optional().describe('Scan profile: quick (30 pages) or deep (80 pages)'),
      url: z.string().optional().describe('URL to scan if discover_surfaces has not been called yet'),
    },
    async ({ max_pages, profile, url }) => {
      try {
        // Auto-run discovery if needed
        if (!session.surfaces) {
          const targetUrl = url || session.url;
          if (!targetUrl) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'No URL available. Call discover_surfaces first or provide a url parameter.' }) }],
              isError: true,
            };
          }
          session.url = targetUrl;
          const report = await discoverEcosystem(targetUrl, () => {});
          session.surfaces = report.surfaces;
        }

        const scanProfile = profile || 'quick';
        const classifiedSurfaces = await classifySurfaces(session.surfaces, () => {});
        session.surfaces = classifiedSurfaces;

        const crawlOptions: any = { seedUrl: session.url!, profile: scanProfile };
        if (max_pages) {
          crawlOptions.budget = { maxPages: max_pages };
        }

        const pages = await crawlEcosystem(
          classifiedSurfaces,
          () => {},
          crawlOptions
        );

        // Strip HTML, store in session
        const pagesForSession = pages.map(({ html, ...rest }) => rest);
        session.pages = pagesForSession;

        const result = {
          pageCount: pagesForSession.length,
          profile: scanProfile,
          pages: pagesForSession.map((p) => ({
            url: p.url,
            title: p.title,
            wordCount: p.wordCount,
            headingCount: p.headings?.length || 0,
            codeBlockCount: p.codeBlocks?.length || 0,
            hasCodeBlocks: (p.codeBlocks?.length || 0) > 0,
            fetchStatus: p.fetchStatus || 'ok',
            needsRender: p.needsRender || false,
          })),
          crawlDurationMs: Date.now() - (session.startedAt || Date.now()),
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
