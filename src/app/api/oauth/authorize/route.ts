import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const redirectUri = url.searchParams.get('redirect_uri') || 'https://claude.ai/api/mcp/auth_callback';
  const state = url.searchParams.get('state') || '';
  const code = `glintbase_auth_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  try {
    const target = new URL(redirectUri);
    target.searchParams.set('code', code);
    if (state) {
      target.searchParams.set('state', state);
    }
    return Response.redirect(target.toString(), 302);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid redirect_uri' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
