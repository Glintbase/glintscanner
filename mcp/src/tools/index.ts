/**
 * MCP tool registry — registers all 9 scanner tools on the server.
 * Each tool file exports a register function that adds its tool.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanSession } from '../session.js';
import { registerDiscoverSurfaces } from './discoverSurfaces.js';
import { registerCheckReachability } from './checkReachability.js';
import { registerParseSpec } from './parseSpec.js';
import { registerCrawlPages } from './crawlPages.js';
import { registerDeepCrawl } from './deepCrawl.js';
import { registerBuildGraph } from './buildGraph.js';
import { registerRunJourneys } from './runJourneys.js';
import { registerScoreReadiness } from './scoreReadiness.js';
import { registerGetRemediation } from './getRemediation.js';

export function registerTools(server: McpServer, session: ScanSession): void {
  registerDiscoverSurfaces(server, session);
  registerCheckReachability(server, session);
  registerParseSpec(server, session);
  registerCrawlPages(server, session);
  registerDeepCrawl(server, session);
  registerBuildGraph(server, session);
  registerRunJourneys(server, session);
  registerScoreReadiness(server, session);
  registerGetRemediation(server, session);
}
