/**
 * MCP Tool: discover_surfaces
 * Discovers all machine-readable entrypoints for a product's developer ecosystem.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanSession } from '../session.js';
import { resetSession, getSessionStatus, getNextSteps } from '../session.js';
import { discoverEcosystem } from '@scanner/v2/discovery';
import { ARS_VERSION } from '@scanner/v2/ars';
import { checkCacheFreshness } from '../cache.js';

export function registerDiscoverSurfaces(server: McpServer, session: ScanSession): void {
  server.tool(
    'discover_surfaces',
    `Discover all machine-readable entrypoints for a product's developer ecosystem. Probes for llms.txt, llms-full.txt, OpenAPI specs, MCP configs, sitemaps, documentation roots, GitHub repos, SDK packages, auth flows, changelogs, and more. Call this FIRST to understand what surfaces exist before crawling or scoring. Returns structured array of surfaces with discovery status, reachability, and URLs. No API keys required.`,
    {
      url: z.string().describe('The product URL to scan (landing page, docs root, or API base)'),
      surfaces: z.array(z.string()).optional().describe('Optional filter: only check these surface types (e.g. ["llms_txt", "openapi", "docs"])'),
      force: z.boolean().optional().describe('Bypass cache and force a fresh scan'),
    },
    async ({ url, surfaces, force }) => {
      try {
        // Check cache freshness (unless force=true)
        const cacheInfo = checkCacheFreshness(url);
        const fromCache = !force && cacheInfo.cached;

        // Reset session if URL changed
        if (session.url !== url) {
          resetSession(session, url);
        }

        const progressLogs: string[] = [];
        const report = await discoverEcosystem(
          url,
          (log: any) => {
            if (log?.message) progressLogs.push(log.message);
          },
          surfaces
        );

        // Store in session
        session.surfaces = report.surfaces;

        const found = report.surfaces.filter((s) => s.found && s.status !== 'skipped');
        const missing = report.surfaces.filter((s) => !s.found && s.status !== 'skipped');

        const result = {
          url,
          surfaceCount: found.length,
          surfaces: report.surfaces
            .filter((s) => s.status !== 'skipped')
            .map((s) => ({
              type: s.type,
              status: s.status,
              found: s.found,
              url: s.url,
              confidence: s.confidence,
              quality: s.quality || null,
              description: s.description,
            })),
          missingSurfaces: missing.map((s) => s.type),
          cached: fromCache,
          ...(fromCache && cacheInfo.score !== undefined ? { cachedScore: cacheInfo.score } : {}),
          score_version: ARS_VERSION,
          session_status: getSessionStatus(session),
          next_steps: getNextSteps(session),
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message, url }) }],
          isError: true,
        };
      }
    }
  );
}
