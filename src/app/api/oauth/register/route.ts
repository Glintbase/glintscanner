import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Dynamic Client Registration is deprecated per MCP 2026-07-28 and OAuth security BCP.
  // Clients identify themselves via Client ID Metadata Documents (CIMD).
  const errorPayload = {
    error: 'registration_not_supported',
    error_description:
      'Unauthenticated Dynamic Client Registration (DCR) is deprecated. MCP clients must identify via Client ID Metadata Documents (CIMD), passing an HTTPS client_id URL to /api/oauth/authorize.',
  };

  return new Response(JSON.stringify(errorPayload, null, 2), {
    status: 400,
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
