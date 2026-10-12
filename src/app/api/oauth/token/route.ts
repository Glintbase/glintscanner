import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The hosted MCP endpoint is public: /api/mcp never checks bearer tokens and tokens
// do not lift rate limits. This endpoint exists only so OAuth-first MCP clients can
// complete their handshake. Tokens are anonymous, short-lived and grant nothing.
// Replace with a real authorization server (stored codes, PKCE, client validation)
// before any tool is gated on authentication.
const TOKEN_TTL_SECONDS = 60 * 60;
const SUPPORTED_GRANT_TYPES = new Set(['authorization_code', 'refresh_token', 'client_credentials']);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function readParams(req: NextRequest): Promise<URLSearchParams> {
  const contentType = req.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const body = await req.json();
      return new URLSearchParams(
        Object.entries(body || {}).map(([k, v]) => [k, String(v)] as [string, string])
      );
    }
    return new URLSearchParams(await req.text());
  } catch {
    return new URLSearchParams();
  }
}

function oauthError(error: string, description: string) {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status: 400,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS },
  });
}

export async function POST(req: NextRequest) {
  const params = await readParams(req);
  const grantType = params.get('grant_type');

  if (!grantType || !SUPPORTED_GRANT_TYPES.has(grantType)) {
    return oauthError('unsupported_grant_type', 'Supported grant types: authorization_code, refresh_token, client_credentials.');
  }
  if (grantType === 'authorization_code' && !params.get('code')?.startsWith('glintbase_auth_')) {
    return oauthError('invalid_grant', 'Missing or unrecognised authorization code.');
  }

  const tokenResponse = {
    access_token: `glintbase_anon_${randomBytes(24).toString('base64url')}`,
    token_type: 'Bearer',
    expires_in: TOKEN_TTL_SECONDS,
    scope: 'mcp:read',
  };

  return new Response(JSON.stringify(tokenResponse), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      ...CORS_HEADERS,
    },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
