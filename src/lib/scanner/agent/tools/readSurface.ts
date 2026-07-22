import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';

export function createReadSurfaceTool(context: ToolContext) {
  return tool({
    description: 'Read the full page content or machine text of a specific URL or surface.',
    inputSchema: z.object({
      url: z.string().describe('The URL or path to read'),
    }),
    execute: async ({ url }) => {
      const u = url.toLowerCase().trim();

      const surface = context.surfaces.find((s) => s.url.toLowerCase() === u || s.type.toLowerCase() === u);
      if (surface) {
        return {
          found: true,
          type: surface.type,
          url: surface.url,
          title: surface.type,
          wordCount: 0,
          description: surface.description,
          message: `Surface ${surface.type} found`,
        };
      }

      const page = context.pages.find((p) => p.url.toLowerCase() === u || p.url.toLowerCase().includes(u));
      if (page) {
        return {
          found: true,
          type: 'page',
          url: page.url,
          title: page.title,
          wordCount: page.wordCount,
          description: page.headings.slice(0, 2).join('; '),
          message: `Page ${page.title} found`,
        };
      }

      return {
        found: false,
        type: 'unknown',
        url,
        title: '',
        wordCount: 0,
        description: '',
        message: `Surface or URL "${url}" not found in ecosystem corpus.`,
      };
    },
  });
}
