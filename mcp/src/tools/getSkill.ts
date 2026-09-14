/**
 * MCP Tool: get_skill
 * Returns step-by-step markdown instructions for AI coding agents.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanSession } from '../session.js';
import { BUNDLED_SKILLS } from '../skills.js';

export function registerGetSkill(server: McpServer, _session: ScanSession): void {
  const availableSkillNames = Object.keys(BUNDLED_SKILLS).join(', ');

  server.tool(
    'get_skill',
    `Fetch step-by-step instruction guides and skills for optimizing websites and APIs for agent readiness. Available skills: ${availableSkillNames}`,
    {
      skill_name: z
        .string()
        .default('glintbase-agent-readiness')
        .describe(`Name of the skill to fetch (${availableSkillNames})`),
    },
    async ({ skill_name }) => {
      const skill = BUNDLED_SKILLS[skill_name];
      if (skill) {
        return {
          content: [
            {
              type: 'text' as const,
              text: skill.content,
            },
          ],
        };
      }

      // Fallback: check case-insensitive or partial match
      const matchedKey = Object.keys(BUNDLED_SKILLS).find(
        (k) => k.toLowerCase() === skill_name.toLowerCase() || k.includes(skill_name.toLowerCase())
      );

      if (matchedKey) {
        return {
          content: [
            {
              type: 'text' as const,
              text: BUNDLED_SKILLS[matchedKey].content,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Skill "${skill_name}" not found.\n\nAvailable skills:\n${Object.keys(BUNDLED_SKILLS)
              .map((k) => `- ${k}: ${BUNDLED_SKILLS[k].title}`)
              .join('\n')}`,
          },
        ],
        isError: true,
      };
    }
  );
}
