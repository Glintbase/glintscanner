/**
 * Unified spec parser (Phase 0 — MCP + CLI shared utility).
 * Fetches and parses OpenAPI, llms.txt, llms-full.txt, or MCP config
 * from a URL. Returns structured analysis without running a full scan.
 */

import { fetchResource } from '../v2/fetchResource';
import { parseOpenAPI } from '../v2/parseOpenAPI';
import { parseLlmsTxt } from '../v2/parseLlmsTxt';

export type SpecType = 'openapi' | 'llms_txt' | 'llms_full_txt' | 'mcp';

export interface SpecParseResult {
  type: SpecType;
  url: string;
  valid: boolean;
  error?: string;
  // OpenAPI specific
  operations?: { method: string; path: string; summary?: string; hasAuth: boolean }[];
  schemaCount?: number;
  openapiVersion?: string;
  title?: string;
  // llms.txt specific
  sections?: { heading: string; links: number }[];
  totalLinks?: number;
  wordCount?: number;
  quality?: 'empty' | 'thin' | 'good';
  // MCP specific
  tools?: { name: string; description?: string }[];
}

function parseMcpConfig(body: string): { valid: boolean; tools?: { name: string; description?: string }[]; error?: string } {
  try {
    const doc = JSON.parse(body);
    if (!doc || typeof doc !== 'object') {
      return { valid: false, error: 'MCP config is not a valid JSON object' };
    }

    // MCP configs can have tools in various shapes
    const tools: { name: string; description?: string }[] = [];

    // Shape 1: { tools: [...] }
    if (Array.isArray(doc.tools)) {
      for (const t of doc.tools) {
        if (t && typeof t === 'object' && t.name) {
          tools.push({ name: t.name, description: t.description });
        }
      }
    }

    // Shape 2: { mcpServers: { name: { ... } } } — server registry format
    if (doc.mcpServers && typeof doc.mcpServers === 'object') {
      for (const [name, config] of Object.entries(doc.mcpServers)) {
        const desc = (config as any)?.description || (config as any)?.command;
        tools.push({ name, description: typeof desc === 'string' ? desc : undefined });
      }
    }

    if (tools.length === 0) {
      return { valid: false, error: 'No tools or servers found in MCP config' };
    }

    return { valid: true, tools };
  } catch {
    return { valid: false, error: 'Could not parse MCP config as JSON' };
  }
}

/**
 * Fetch and parse a machine-readable spec from a URL.
 * Supports OpenAPI (JSON/YAML), llms.txt, llms-full.txt, and MCP configs.
 */
export async function parseSpec(url: string, type: SpecType): Promise<SpecParseResult> {
  const base: SpecParseResult = { type, url, valid: false };

  const result = await fetchResource(url, { timeoutMs: 10000, maxBytes: 2_000_000 });

  if (!result.ok || !result.body) {
    return {
      ...base,
      error: result.status === 'blocked'
        ? 'URL blocked by security policy (SSRF guard)'
        : result.status === 'timeout'
          ? 'Request timed out (10s)'
          : result.status === 'soft_404'
            ? 'URL returned a soft 404 (page not found content)'
            : `Fetch failed: ${result.status}`,
    };
  }

  const body = result.body;

  switch (type) {
    case 'openapi': {
      const parsed = parseOpenAPI(body);
      if (!parsed.valid) {
        return { ...base, error: parsed.reason || 'Invalid OpenAPI spec' };
      }

      // Detect auth coverage
      const operations = parsed.operations.map((op) => {
        // Check if the operation path or spec has security definitions
        const hasAuth = Boolean(
          body.includes('"security"') ||
          body.includes('security:') ||
          body.includes('"authorizationUrl"') ||
          body.includes('bearerAuth') ||
          body.includes('apiKey')
        );
        return {
          method: op.method,
          path: op.path,
          summary: op.summary,
          hasAuth,
        };
      });

      // Count schemas
      let schemaCount = 0;
      try {
        const doc = JSON.parse(body);
        schemaCount = Object.keys(doc?.components?.schemas || doc?.definitions || {}).length;
      } catch {
        // YAML — estimate from body
        const schemaMatches = body.match(/^\s{4}\w+/gm);
        schemaCount = schemaMatches ? Math.min(schemaMatches.length, 500) : 0;
      }

      return {
        ...base,
        valid: true,
        operations: operations.slice(0, 200),
        schemaCount,
        openapiVersion: parsed.version,
        title: parsed.title,
      };
    }

    case 'llms_txt':
    case 'llms_full_txt': {
      const parsed = parseLlmsTxt(body, url);
      if (!parsed.valid) {
        return { ...base, error: parsed.reason || 'Invalid llms.txt' };
      }

      // Build sections with link counts
      const sectionData: { heading: string; links: number }[] = [];
      const lines = body.split('\n');
      let currentSection = 'Introduction';
      let currentLinks = 0;

      for (const line of lines) {
        const headingMatch = line.match(/^#+\s+(.+)$/);
        if (headingMatch) {
          if (currentLinks > 0 || sectionData.length === 0) {
            sectionData.push({ heading: currentSection, links: currentLinks });
          }
          currentSection = headingMatch[1].trim();
          currentLinks = 0;
        }
        if (/\[([^\]]*)\]\((https?:\/\/|\/)/.test(line) || /https?:\/\//.test(line)) {
          currentLinks++;
        }
      }
      sectionData.push({ heading: currentSection, links: currentLinks });

      const wordCount = body.split(/\s+/).filter(Boolean).length;

      return {
        ...base,
        valid: true,
        sections: sectionData.filter((s) => s.heading),
        totalLinks: parsed.links.length,
        wordCount,
        quality: parsed.quality,
      };
    }

    case 'mcp': {
      const parsed = parseMcpConfig(body);
      if (!parsed.valid) {
        return { ...base, error: parsed.error || 'Invalid MCP config' };
      }
      return {
        ...base,
        valid: true,
        tools: parsed.tools,
      };
    }

    default:
      return { ...base, error: `Unknown spec type: ${type}` };
  }
}
