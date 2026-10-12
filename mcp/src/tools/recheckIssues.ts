/**
 * MCP Tool: recheck_issues
 * Targeted re-verification of specific check IDs (Ora-parity fast feedback loop).
 * Coding agents call this tool immediately after editing code to verify fixes.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanSession } from '../session.js';
import { runArs3Probes } from '@scanner/v2/probes/index';
import { parseCheckIds, partitionCheckIds, recheckFromResults, unknownCheckResult } from '@scanner/v2/probes/recheck';

export function registerRecheckIssues(server: McpServer, session: ScanSession): void {
  server.tool(
    'recheck_issues',
    'Targeted re-verification of specific ARS registry check IDs (e.g. auth-md-structure, robots-ai-policy-quality, anti-spa-404, markdown-negotiation, mcp-server-manifest). Each id is looked up exactly; unknown ids are reported as unknown. Call this tool after applying code fixes to verify whether the issue is resolved.',
    {
      url: z.string().optional().describe('Target URL to check (defaults to session URL if previously scanned)'),
      check_ids: z.array(z.string()).describe('Registry check IDs to re-verify (e.g. ["auth-md-structure", "anti-spa-404"])'),
    },
    async ({ url, check_ids }) => {
      const targetUrl = url || session.url;
      if (!targetUrl) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'No target URL provided and no active scan session. Provide a `url` parameter.',
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        const ids = parseCheckIds(check_ids);
        const { known } = partitionCheckIds(ids);
        // Only unknown ids: answer without probing the site.
        if (known.length === 0) {
          const results = Object.fromEntries(ids.map((id) => [id, unknownCheckResult(id)]));
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ target_url: targetUrl, results }, null, 2) }],
            isError: true,
          };
        }

        // Run the ARS probes and read each requested check by exact registry id.
        const scorecard = await runArs3Probes(targetUrl);
        const results = Object.fromEntries(recheckFromResults(scorecard.results, ids).map((r) => [r.checkId, r]));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  target_url: targetUrl,
                  results,
                  current_ars_score: scorecard.score,
                  archetype: scorecard.archetype.archetype,
                  score_version: scorecard.version,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: err.message }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
