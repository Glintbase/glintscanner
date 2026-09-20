import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const clientName = body.client_name || 'Claude';
  const redirectUris = Array.isArray(body.redirect_uris) && body.redirect_uris.length > 0
    ? body.redirect_uris
    : ['https://claude.ai/api/mcp/auth_callback'];

  const clientId = `glintbase_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const responseData = {
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    client_id_issued_at: Math.floor(Date.now() / 1000),
    scope: 'mcp:tools',
  };

  return new Response(JSON.stringify(responseData, null, 2), {
    status: 201,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
