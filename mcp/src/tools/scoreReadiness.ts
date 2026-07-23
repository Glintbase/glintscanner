/**
 * MCP Tool: score_readiness
 * Calculate the composite Agent Readiness Score (ARS 1.0).
 * Auto-runs any missing pipeline stages.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanSession } from '../session.js';
import { resetSession, getSessionStatus, getNextSteps } from '../session.js';
import { discoverEcosystem } from '@scanner/v2/discovery';
import { classifySurfaces } from '@scanner/v2/classification';
import { crawlEcosystem } from '@scanner/v2/crawler';
import { detectEcosystemFramework } from '@scanner/v2/framework';
import { buildContextGraph } from '@scanner/v2/graph';
import { simulateAgentJourneys } from '@scanner/v2/journey';
import { calculateARS, ARS_VERSION } from '@scanner/v2/ars';
import { scoreBandLabel } from '@scanner/shared/scoreBand';
import { cacheSession } from '../cache.js';

export function registerScoreReadiness(server: McpServer, session: ScanSession): void {
  server.tool(
    'score_readiness',
    `Calculate the composite Agent Readiness Score (ARS 1.0). Auto-runs any missing pipeline stages (discovery, crawl, graph, journeys) if not already completed. Returns the weighted score (0-100), band classification, per-dimension breakdown with observations, and score_version. This is the definitive readiness metric. Provide a url if starting fresh.`,
    {
      url: z.string().optional().describe('URL to scan (required if discover_surfaces has not been called)'),
      profile: z.enum(['quick', 'deep']).optional().describe('Scan profile (default: quick)'),
    },
    async ({ url, profile }) => {
      try {
        const started = Date.now();
        const stagesRun: string[] = [];
        const scanProfile = profile || 'quick';

        // Stage 1: Discovery
        if (!session.surfaces) {
          const targetUrl = url || session.url;
          if (!targetUrl) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: 'No URL available. Provide a url parameter or call discover_surfaces first.',
              }) }],
              isError: true,
            };
          }
          if (session.url !== targetUrl) resetSession(session, targetUrl);
          const report = await discoverEcosystem(targetUrl, () => {});
          session.surfaces = report.surfaces;
          stagesRun.push('discovery');
        }

        // Stage 2: Classification
        if (stagesRun.includes('discovery')) {
          session.surfaces = await classifySurfaces(session.surfaces!, () => {});
          stagesRun.push('classification');
        }

        // Stage 3: Framework detection
        if (!session.framework && session.surfaces) {
          session.framework = await detectEcosystemFramework(session.surfaces, () => {});
          stagesRun.push('framework');
        }

        // Stage 4: Crawl
        if (!session.pages) {
          const pages = await crawlEcosystem(session.surfaces!, () => {}, { seedUrl: session.url!, profile: scanProfile });
          session.pages = pages.map(({ html, ...rest }) => rest);
          stagesRun.push('crawl');
        }

        // Stage 5: Graph
        if (!session.graph) {
          session.graph = await buildContextGraph(session.surfaces!, session.pages!, () => {});
          stagesRun.push('graph');
        }

        // Stage 6: Journeys
        if (!session.journeys) {
          session.journeys = await simulateAgentJourneys(session.graph!, () => {});
          stagesRun.push('journeys');
        }

        // Stage 7: Score
        const ars = calculateARS({
          surfaces: session.surfaces!,
          pages: session.pages!,
          graph: session.graph!,
          journeys: session.journeys!,
        });

        session.score = {
          score: ars.score,
          version: ars.score_version,
          dimensions: ars.dimensions,
        };
        stagesRun.push('scoring');

        // Persist to file cache for fast re-runs
        cacheSession(session);

        const result = {
          url: session.url,
          score: ars.score,
          band: scoreBandLabel(ars.score),
          scoreVersion: ars.score_version,
          framework: session.framework,
          dimensions: ars.dimensions.map((d) => ({
            name: d.name,
            score: d.score,
            maxScore: d.maxScore,
            description: d.description,
            observations: d.observations,
          })),
          journeySummary: {
            completionRate: session.journeys!.overallCompletionRate,
            avgHopCount: session.journeys!.avgHopCount,
            highRiskJourneys: session.journeys!.highRiskJourneys,
          },
          durationMs: Date.now() - started,
          pipelineStagesRun: stagesRun,
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
