/**
 * MCP Tool: score_readiness
 * Calculate the Agent Readiness Score with the same ARS 3.x probe engine used by
 * scan.glintbase.dev and the glintbase CLI, so every surface reports the same number.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanSession } from '../session.js';
import { resetSession, getSessionStatus, getNextSteps } from '../session.js';
import { runScan } from '@scanner/core/runScan';
import { scoreBandLabel } from '@scanner/shared/scoreBand';
import { cacheSession } from '../cache.js';

export function registerScoreReadiness(server: McpServer, session: ScanSession): void {
  server.tool(
    'score_readiness',
    `Calculate the Agent Readiness Score (ARS 3.x) for a URL using the same probe engine as scan.glintbase.dev and the glintbase CLI. Returns the score (0-100), grade, archetype, per-layer breakdown (discovery, access, usability, payments) and the top remediations. Provide a url, or call discover_surfaces first.`,
    {
      url: z.string().optional().describe('URL to scan (defaults to the URL from discover_surfaces)'),
    },
    async ({ url }) => {
      try {
        const targetUrl = url || session.url;
        if (!targetUrl) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: 'No URL available. Provide a url parameter or call discover_surfaces first.',
            }) }],
            isError: true,
          };
        }
        // A different URL must never reuse the previous target's results.
        if (session.url !== targetUrl) resetSession(session, targetUrl);

        const result = await runScan({ url: targetUrl });

        session.surfaces = session.surfaces ?? result.surfaces;
        session.framework = session.framework ?? result.framework;
        session.score = {
          score: result.score,
          version: result.score_version,
          dimensions: result.dimensions,
        };

        // Persist to file cache for fast re-runs
        cacheSession(session);

        const scorecard = result.scorecard;
        const payload = {
          url: result.url,
          score: result.score,
          grade: result.grade,
          gradeLabel: result.gradeLabel,
          band: scoreBandLabel(result.score),
          archetype: result.archetype?.archetype,
          scoreVersion: result.score_version,
          framework: result.framework,
          layers: result.dimensions.map((d) => ({
            name: d.name,
            score: d.score,
            maxScore: d.maxScore,
            observations: d.observations,
          })),
          pillars: scorecard?.pillars,
          topRemediations: (scorecard?.remediations || []).slice(0, 8).map((r) => ({
            id: r.id,
            severity: r.severity,
            title: r.title,
            fixCommand: r.fixCommand,
            targetFile: r.targetFile,
          })),
          durationMs: result.duration_ms,
          score_version: result.score_version,
          session_status: getSessionStatus(session),
          next_steps: getNextSteps(session),
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
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
