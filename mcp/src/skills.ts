/**
 * Glintbase bundled MCP skills for @glintbase/mcp.
 * The skill content lives in the scanner engine (src/lib/scanner/mcp/skills.ts), the single
 * copy shared with scan.glintbase.dev, @glintbase/scanner-core and @glintbase/cli.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BUNDLED_SKILLS, type BundledSkill } from '@scanner/mcp/skills';

export { BUNDLED_SKILLS };
export type { BundledSkill };

/**
 * Registers all 8 bundled skills on an MCP Server as:
 * 1. MCP Resources (skill://glintbase/<name>)
 * 2. MCP Prompts (optimize_<name>)
 */
export function registerSkillPromptsAndResources(server: McpServer): void {
  for (const skill of Object.values(BUNDLED_SKILLS)) {
    // 1. Register Resource
    server.resource(
      `skill-${skill.name}`,
      skill.uri,
      async () => ({
        contents: [
          {
            uri: skill.uri,
            mimeType: 'text/markdown',
            text: skill.content,
          },
        ],
      })
    );

    // 2. Register Prompt
    server.prompt(
      `optimize-${skill.name}`,
      skill.description,
      {
        target: z.string().optional().describe('Target codebase directory or URL to optimize'),
      },
      async ({ target }) => ({
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Please use the "${skill.title}" skill guidelines below to optimize ${target || 'this project'}:\n\n${skill.content}`,
            },
          },
        ],
      })
    );
  }
}
