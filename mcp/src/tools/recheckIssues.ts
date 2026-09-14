/**
 * MCP Tool: recheck_issues
 * Targeted re-verification of specific check IDs (Ora-parity fast feedback loop).
 * Coding agents call this tool immediately after editing code to verify fixes.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanSession } from '../session.js';
import { runArs2Probes } from '@scanner/v2/probes/index';

export function registerRecheckIssues(server: McpServer, session: ScanSession): void {
  server.tool(
    'recheck_issues',
    'Targeted re-verification of specific check IDs (e.g. auth.md, robots.txt, anti_spa_404, markdown_negotiation, mcp_server). Call this tool after applying code fixes to verify whether the issue is resolved without re-running a full scan.',
    {
      url: z.string().optional().describe('Target URL to check (defaults to session URL if previously scanned)'),
      check_ids: z.array(z.string()).describe('List of check IDs to re-verify (e.g. ["auth.md", "robots.txt"])'),
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
        const scorecard = await runArs2Probes(targetUrl);
        const results: Record<string, { passed: boolean; details: string }> = {};

        for (const cid of check_ids) {
          const lower = cid.toLowerCase();
          if (lower.includes('robot')) {
            const passed = scorecard.layers.discovery.data.robotsPolicy.aiFriendly;
            results[cid] = {
              passed,
              details: passed ? 'ClaudeBot & GPTBot permitted in robots.txt' : 'AI crawlers restricted or blocked',
            };
          } else if (lower.includes('auth')) {
            const passed = scorecard.layers.usability.data.authHandbook.found;
            results[cid] = {
              passed,
              details: passed
                ? `Verified at ${scorecard.layers.usability.data.authHandbook.url}`
                : 'auth.md or RFC 9728 specification missing',
            };
          } else if (lower.includes('404') || lower.includes('spa')) {
            const passed = scorecard.layers.access.data.antiSpa404.passed;
            results[cid] = {
              passed,
              details: passed ? 'Authentic HTTP 404 returned' : 'Returns soft 200 OK (agents may hallucinate)',
            };
          } else if (lower.includes('markdown') || lower.includes('llms')) {
            const passed = scorecard.layers.access.data.markdownNegotiation.supported;
            results[cid] = {
              passed,
              details: passed ? 'Accept: text/markdown or .md twin supported' : 'No markdown content negotiation',
            };
          } else if (lower.includes('mcp')) {
            const passed = scorecard.layers.usability.data.mcpServer.live;
            results[cid] = {
              passed,
              details: passed
                ? `Live MCP endpoint at ${scorecard.layers.usability.data.mcpServer.endpoint}`
                : 'No live streamable MCP endpoint detected',
            };
          } else {
            results[cid] = {
              passed: false,
              details: `Unknown check ID '${cid}'`,
            };
          }
        }

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
