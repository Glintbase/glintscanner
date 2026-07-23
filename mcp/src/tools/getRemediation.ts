/**
 * MCP Tool: get_remediation
 * Get prioritized, actionable remediation advice for improving agent readiness.
 * This is the action-loop enabler — the agent reads fixes, implements them, re-scans.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScanSession } from '../session.js';
import { getSessionStatus, getNextSteps } from '../session.js';
import { ARS_VERSION } from '@scanner/v2/ars';

interface RemediationFix {
  priority: number;
  title: string;
  description: string;
  file?: string;
  template?: string;
  effort: 'low' | 'medium' | 'high';
  expectedImpact: number;
  category: 'discovery' | 'content' | 'api' | 'journeys';
}

export function registerGetRemediation(server: McpServer, session: ScanSession): void {
  server.tool(
    'get_remediation',
    `Get prioritized, actionable remediation advice for improving agent readiness. Analyzes failed journeys, missing surfaces, and graph gaps to produce specific fixes the developer can implement. Each fix includes what to create/change, where, estimated effort, and expected score impact. Use after score_readiness or run_journeys to know what to fix. Optionally filter by focus area.`,
    {
      focus: z.enum(['discovery', 'content', 'api', 'journeys', 'all']).optional().describe('Filter fixes by category (default: all)'),
    },
    async ({ focus }) => {
      try {
        if (!session.surfaces && !session.journeys) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: 'Requires at least discover_surfaces or score_readiness to have been called first.',
              session_status: getSessionStatus(session),
            }) }],
            isError: true,
          };
        }

        const fixes: RemediationFix[] = [];
        const filterCategory = focus || 'all';

        // Analyze missing surfaces
        if (session.surfaces) {
          const missing = session.surfaces.filter((s) => !s.found && s.status !== 'skipped');
          const invalid = session.surfaces.filter((s) => s.status === 'invalid');

          for (const s of missing) {
            const fix = getSurfaceFix(s.type, s.url);
            if (fix && (filterCategory === 'all' || fix.category === filterCategory)) {
              fixes.push(fix);
            }
          }

          for (const s of invalid) {
            if (filterCategory !== 'all' && filterCategory !== 'content') continue;
            fixes.push({
              priority: 2,
              title: `Fix invalid ${s.type} content`,
              description: `The ${s.type} at ${s.url} exists but failed content validation. ${s.fix || 'Ensure it contains valid, parseable content.'}`,
              file: getFilePath(s.type),
              effort: 'low',
              expectedImpact: 4,
              category: 'content',
            });
          }
        }

        // Analyze failed journeys
        if (session.journeys) {
          const failed = session.journeys.traces.filter((t) => !t.success);
          for (const t of failed) {
            if (filterCategory !== 'all' && filterCategory !== 'journeys') continue;
            fixes.push({
              priority: 1,
              title: `Fix journey: ${t.label}`,
              description: t.recommendedFix || `Journey "${t.label}" failed at ${t.breakpoint?.surface || 'unknown point'}. ${t.breakpoint?.reason || 'Agent could not complete the task.'}`,
              effort: t.breakpoint?.type === 'missing_prerequisite' ? 'medium' : 'low',
              expectedImpact: Math.round(20 / Math.max(failed.length, 1)),
              category: 'journeys',
            });
          }

          // High hallucination pressure journeys
          const highPressure = session.journeys.traces.filter((t) => t.hallucinationPressure === 'high' && t.success);
          for (const t of highPressure) {
            if (filterCategory !== 'all' && filterCategory !== 'content') continue;
            fixes.push({
              priority: 3,
              title: `Reduce hallucination risk: ${t.label}`,
              description: `Journey "${t.label}" passed but with high hallucination pressure — agents may fabricate information. Add explicit documentation for: ${t.goal}`,
              effort: 'medium',
              expectedImpact: 3,
              category: 'content',
            });
          }
        }

        // Analyze graph gaps
        if (session.graph) {
          const { metrics } = session.graph;
          if (metrics.islands > 0 && (filterCategory === 'all' || filterCategory === 'content')) {
            fixes.push({
              priority: 3,
              title: `Connect ${metrics.islands} isolated content clusters`,
              description: 'Documentation pages exist but are not linked from the main navigation or any discoverable path. Add cross-links or navigation entries.',
              effort: 'medium',
              expectedImpact: 5,
              category: 'content',
            });
          }
          if (metrics.pathDocsToAuth === false && (filterCategory === 'all' || filterCategory === 'journeys')) {
            fixes.push({
              priority: 1,
              title: 'Add path from docs to authentication',
              description: 'No navigable path exists from the documentation root to authentication/setup docs. Agents cannot find how to authenticate. Add a "Getting Started > Authentication" link.',
              file: 'docs/getting-started/authentication.md',
              effort: 'low',
              expectedImpact: 8,
              category: 'journeys',
            });
          }
        }

        // Sort by priority then impact
        fixes.sort((a, b) => a.priority - b.priority || b.expectedImpact - a.expectedImpact);

        const totalImpact = fixes.reduce((sum, f) => sum + f.expectedImpact, 0);

        const result = {
          fixCount: fixes.length,
          totalExpectedImpact: `+${Math.min(totalImpact, 40)} points (estimated)`,
          fixes: fixes.slice(0, 15),
          summary: fixes.length === 0
            ? 'No remediation needed — ecosystem is well-optimized for agent access.'
            : `${fixes.length} fixes identified. Top priority: ${fixes[0]?.title}. Estimated total impact: +${Math.min(totalImpact, 40)} ARS points.`,
          score_version: ARS_VERSION,
          session_status: getSessionStatus(session),
          next_steps: ['Implement fixes above, then call score_readiness again to measure improvement'],
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );
}

function getSurfaceFix(type: string, url: string): RemediationFix | null {
  const templates: Record<string, { title: string; description: string; file: string; template?: string; impact: number }> = {
    llms_txt: {
      title: 'Create llms.txt',
      description: 'Add a /llms.txt file summarizing your product for LLM crawlers. This is the #1 signal agents use to understand your product quickly.',
      file: 'public/llms.txt',
      template: '# YourProduct\n\n> One-line description of your product.\n\n## Docs\n- [Getting Started](https://docs.example.com/start)\n- [API Reference](https://docs.example.com/api)\n\n## API\n- [OpenAPI Spec](https://docs.example.com/openapi.json)\n\n## SDKs\n- [npm package](https://npmjs.com/package/your-sdk)',
      impact: 12,
    },
    llms_full_txt: {
      title: 'Create llms-full.txt',
      description: 'Add a /llms-full.txt with complete documentation text for single-shot retrieval by agents with large context windows.',
      file: 'public/llms-full.txt',
      impact: 6,
    },
    openapi: {
      title: 'Publish OpenAPI specification',
      description: 'Add an OpenAPI/Swagger spec at /openapi.json. Agents use this to understand your API structure, generate code, and validate requests.',
      file: 'public/openapi.json',
      impact: 10,
    },
    mcp: {
      title: 'Add MCP configuration',
      description: 'Publish a Model Context Protocol config so agents can discover and use your tools directly.',
      file: 'public/mcp.json',
      impact: 8,
    },
    sitemap: {
      title: 'Add sitemap.xml',
      description: 'Publish a sitemap.xml so agents can discover all documentation pages efficiently.',
      file: 'public/sitemap.xml',
      impact: 5,
    },
    docs: {
      title: 'Improve documentation presence',
      description: 'Ensure documentation is discoverable at a standard path (/docs, /documentation) with clear navigation.',
      file: 'docs/index.md',
      impact: 8,
    },
    github: {
      title: 'Link public GitHub repository',
      description: 'Link your public source repository from your docs. Agents look for code examples and SDK source.',
      file: 'README.md',
      impact: 4,
    },
    changelog: {
      title: 'Add public changelog',
      description: 'Publish a changelog so agents can detect API drift and breaking changes.',
      file: 'CHANGELOG.md',
      impact: 3,
    },
  };

  const template = templates[type];
  if (!template) {
    return {
      priority: 4,
      title: `Add ${type} surface`,
      description: `The ${type} surface was not found at ${url}.`,
      effort: 'medium',
      expectedImpact: 3,
      category: 'discovery',
    };
  }

  return {
    priority: template.impact >= 10 ? 1 : template.impact >= 6 ? 2 : 3,
    title: template.title,
    description: template.description,
    file: template.file,
    template: template.template,
    effort: template.impact >= 10 ? 'medium' : 'low',
    expectedImpact: template.impact,
    category: type === 'openapi' || type === 'mcp' ? 'api' : 'discovery',
  };
}

function getFilePath(type: string): string | undefined {
  const paths: Record<string, string> = {
    llms_txt: 'public/llms.txt',
    llms_full_txt: 'public/llms-full.txt',
    openapi: 'public/openapi.json',
    mcp: 'public/mcp.json',
    sitemap: 'public/sitemap.xml',
  };
  return paths[type];
}
