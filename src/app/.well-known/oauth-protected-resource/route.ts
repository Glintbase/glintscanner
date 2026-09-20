export const dynamic = 'force-static';

export async function GET() {
  const metadata = {
    resource: 'https://scan.glintbase.dev',
    authorization_servers: ['https://scan.glintbase.dev'],
    scopes_supported: ['mcp:tools', 'mcp:read'],
    bearer_methods_supported: ['header'],
  };

  return new Response(JSON.stringify(metadata, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
