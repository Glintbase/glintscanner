/**
 * MCP Tool: parse_spec
 * Parse and analyze a machine-readable specification file.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanSession } from '../session.js';
import { getSessionStatus, getNextSteps } from '../session.js';
import { parseSpec } from '@scanner/core/parseSpec';
import { ARS_VERSION } from '@scanner/v2/ars';

export function registerParseSpec(server: McpServer, session: ScanSession): void {
  server.tool(
    'parse_spec',
    `Parse and analyze a machine-readable specification file. Supports OpenAPI (operations, schemas, auth coverage), llms.txt (sections, links, completeness), and MCP configs (tools, descriptions). Use after discover_surfaces finds a spec to understand its contents and quality without crawling the entire site. No API keys required.`,
    {
      url: z.string().describe('URL of the spec file to parse'),
      type: z.enum(['openapi', 'llms_txt', 'llms_full_txt', 'mcp']).describe('Type of specification to parse'),
    },
    async ({ url, type }) => {
      try {
        const result = await parseSpec(url, type);

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
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message, url, type }) }],
          isError: true,
        };
      }
    }
  );
}
