#!/usr/bin/env node
/**
 * Glintbase MCP Server — zero-config agent readiness tools for AI coding agents.
 *
 * Usage (in Claude Code / Cursor / Windsurf MCP config):
 * {
 *   "mcpServers": {
 *     "glintbase": {
 *       "command": "npx",
 *       "args": ["-y", "@glintbase/mcp"]
 *     }
 *   }
 * }
 *
 * No API keys. No .env. No config. Just tools.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createSession } from './session.js';
import { registerTools } from './tools/index.js';
import { registerSkillPromptsAndResources } from './skills.js';

const server = new McpServer({
  name: 'glintbase',
  version: '3.0.0',
});

// 1. Register 8 Bundled Skills (Prompts & Resources)
registerSkillPromptsAndResources(server);

// 2. Register Tools
const session = createSession();
registerTools(server, session);

const transport = new StdioServerTransport();
await server.connect(transport);
