/**
 * MCP Tool: check_reachability
 * Quick single-URL reachability check for AI agents.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanSession } from '../session.js';
import { getSessionStatus, getNextSteps } from '../session.js';
import { checkReachability } from '@scanner/core/reachability';
import { ARS_VERSION } from '@scanner/v2/ars';

export function registerCheckReachability(server: McpServer, session: ScanSession): void {
  server.tool(
    'check_reachability',
    `Quick single-URL reachability check for AI agents. Tests if a specific URL is accessible, measures latency, detects soft-404s, and classifies content type. Use this to verify a specific endpoint, docs page, or spec file is actually reachable and machine-readable before investing in a full crawl. No API keys required.`,
    {
      url: z.string().describe('The URL to check reachability for'),
    },
    async ({ url }) => {
      try {
        const result = await checkReachability(url);

        const response = {
          ...result,
          score_version: ARS_VERSION,
          session_status: getSessionStatus(session),
          next_steps: getNextSteps(session),
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
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
