import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  url.pathname = '/api/mcp';
  return NextResponse.redirect(url, { status: 308 });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  url.pathname = '/api/mcp';
  return NextResponse.redirect(url, { status: 308 });
}
