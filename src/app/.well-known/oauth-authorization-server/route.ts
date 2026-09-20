export const dynamic = 'force-static';

export async function GET() {
  const metadata = {
    issuer: 'https://scan.glintbase.dev',
    authorization_endpoint: 'https://scan.glintbase.dev/api/oauth/authorize',
    token_endpoint: 'https://scan.glintbase.dev/api/oauth/token',
    registration_endpoint: 'https://scan.glintbase.dev/api/oauth/register',
    jwks_uri: 'https://scan.glintbase.dev/api/oauth/jwks',
    scopes_supported: ['mcp:tools', 'mcp:read', 'openid', 'profile'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256', 'plain'],
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
