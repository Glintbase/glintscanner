/**
 * MCP Tool: deep_crawl
 * In-depth crawl that recovers content from JS-rendered documentation sites
 * (Next.js, Docusaurus, Nextra, SPA shells) using zero-dependency embedded-data
 * extraction. No API keys required. Prefer this over crawl_pages for sites whose
 * pages come back thin or where crawl_pages reports needsRender=true.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanSession } from '../session.js';
import { getSessionStatus, getNextSteps } from '../session.js';
import { discoverEcosystem } from '@scanner/v2/discovery';
import { classifySurfaces } from '@scanner/v2/classification';
import { crawlEcosystem } from '@scanner/v2/crawler';
import { ARS_VERSION } from '@scanner/v2/ars';

export function registerDeepCrawl(server: McpServer, session: ScanSession): void {
  server.tool(
    'deep_crawl',
    `In-depth crawl that recovers real page content from JS-rendered documentation sites (Next.js, Docusaurus, Nextra, SPA shells) by extracting embedded data (__NEXT_DATA__, App Router RSC flight chunks, JSON-LD, noscript, main-content containers). No API keys required. Uses the deep profile (more pages, longer budget) and retries thin pages via embedded extraction. Prefer this over crawl_pages when a site's pages come back with low word counts or needsRender=true. Returns per-page extraction method plus a recovery summary showing how many pages were rescued from thin shells.`,
    {
      url: z.string().optional().describe('URL to scan if discover_surfaces has not been called yet'),
      max_pages: z.number().optional().describe('Maximum pages to crawl (default: 50)'),
      retry_thin: z.boolean().optional().describe('Retry thin/JS-rendered pages via embedded extraction (default: true)'),
    },
    async ({ url, max_pages, retry_thin }) => {
      try {
        // Auto-run discovery if needed (same guard as crawl_pages)
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

        const classifiedSurfaces = await classifySurfaces(session.surfaces, () => {});
        session.surfaces = classifiedSurfaces;

        const deepExtraction = retry_thin !== false;
        const crawlOptions: any = {
          seedUrl: session.url!,
          profile: 'deep',
          deepExtraction,
        };
        if (max_pages) {
          crawlOptions.budget = { maxPages: max_pages };
        }

        const pages = await crawlEcosystem(classifiedSurfaces, () => {}, crawlOptions);

        // Strip HTML, store in session
        const pagesForSession = pages.map(({ html, ...rest }) => rest);
        session.pages = pagesForSession;

        // Recovery summary: counts by extraction method + pages rescued
        const byMethod: Record<string, number> = {};
        let recoveredCount = 0;
        for (const p of pagesForSession) {
          const method = p.extractionMethod || 'raw';
          byMethod[method] = (byMethod[method] || 0) + 1;
          if (method !== 'raw' && method !== 'firecrawl') recoveredCount++;
        }

        const result = {
          pageCount: pagesForSession.length,
          profile: 'deep',
          deepExtraction,
          recovery: {
            recoveredFromThinShells: recoveredCount,
            byExtractionMethod: byMethod,
            stillNeedsRender: pagesForSession.filter((p) => p.needsRender).length,
          },
          pages: pagesForSession.map((p) => ({
            url: p.url,
            title: p.title,
            wordCount: p.wordCount,
            headingCount: p.headings?.length || 0,
            codeBlockCount: p.codeBlocks?.length || 0,
            extractionMethod: p.extractionMethod || 'raw',
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
