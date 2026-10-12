import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { fetchResource } from '@/lib/scanner/v2/fetchResource';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_DEFAULT_ORIGINS = new Set([
  'https://claude.ai',
  'https://cursor.com',
  'https://windsurf.ai',
  'https://chatgpt.com',
  'https://scan.glintbase.dev',
  'https://glintbase.dev',
]);

async function cimdAllowsRedirect(clientId: string, redirectUri: string): Promise<boolean> {
  const res = await fetchResource(clientId, { timeoutMs: 3000, maxBytes: 64 * 1024 }).catch(() => null);
  if (!res?.ok || !res.body) return false;
  try {
    const doc = JSON.parse(res.body);
    return (
      doc?.client_id === clientId &&
      Array.isArray(doc.redirect_uris) &&
      doc.redirect_uris.includes(redirectUri)
    );
  } catch {
    return false;
  }
}

async function isAllowedRedirect(redirectUri: string, clientId?: string | null): Promise<boolean> {
  try {
    const target = new URL(redirectUri);
    // Disallow dangerous schemes
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return false;

    // Disallow loopback / link-local / cloud metadata
    const host = target.hostname.toLowerCase();
    if (
      host === '169.254.169.254' ||
      host === 'metadata.google.internal' ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) {
      return false;
    }

    // Localhost only permitted in development
    if (host === 'localhost' || host === '127.0.0.1') {
      return process.env.NODE_ENV !== 'production';
    }

    // Check trusted agent origins
    if (ALLOWED_DEFAULT_ORIGINS.has(target.origin)) {
      return true;
    }

    // If client_id is an HTTPS CIMD document URL, the redirect must be listed in that document.
    // Matching on origin alone made this an open redirect for any attacker-owned domain.
    if (clientId && clientId.startsWith('https://')) {
      return await cimdAllowsRedirect(clientId, redirectUri);
    }

    return false;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const redirectUri = url.searchParams.get('redirect_uri') || 'https://claude.ai/api/mcp/auth_callback';
  const clientId = url.searchParams.get('client_id');
  const state = url.searchParams.get('state') || '';

  if (!(await isAllowedRedirect(redirectUri, clientId))) {
    return new Response(
      JSON.stringify({
        error: 'invalid_request',
        error_description:
          'Invalid or unauthorized redirect_uri. For custom MCP clients, provide an HTTPS CIMD client_id URL matching your redirect origin.',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      }
    );
  }

  const code = `glintbase_auth_${randomBytes(18).toString('base64url')}`;

  try {
    const target = new URL(redirectUri);
    target.searchParams.set('code', code);
    if (state) {
      target.searchParams.set('state', state);
    }
    return Response.redirect(target.toString(), 302);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_request', error_description: 'Failed to construct redirect' }), {
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
