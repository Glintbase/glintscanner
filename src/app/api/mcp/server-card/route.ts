import { GLINTBASE_VERSION } from '@/lib/scanner/version';

/**
 * MCP Server Card (SEP-2127, io.modelcontextprotocol/server-card) at the default hosted
 * location, <streamable-http-url>/server-card. Also listed in /.well-known/ai-catalog.json.
 */
export function GET() {
  const card = {
    $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
    name: 'io.github.Glintbase/glintbase-mcp',
    title: 'Glintbase Agent Readiness',
    version: GLINTBASE_VERSION,
    description:
      'Hosted, zero-auth MCP server for Glintbase: Agent Readiness Score (ARS 3.3) audits, compact scores, surface discovery, agent journey simulations and skill playbooks.',
    websiteUrl: 'https://scan.glintbase.dev',
    repository: { url: 'https://github.com/Glintbase/glintscanner', source: 'github' },
    icons: [{ src: 'https://glintbase.dev/icon-512.png', mimeType: 'image/png', sizes: ['512x512'] }],
    remotes: [
      {
        type: 'streamable-http',
        url: 'https://scan.glintbase.dev/api/mcp',
        supportedProtocolVersions: ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'],
      },
    ],
  };
  return new Response(JSON.stringify(card, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/mcp-server-card+json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
