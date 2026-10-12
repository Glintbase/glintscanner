import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as token } from '../token/route';
import { GET as authorize } from '../authorize/route';

const form = (body: Record<string, string>) =>
  new NextRequest('https://scan.glintbase.dev/api/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

describe('/api/oauth/token', () => {
  it('rejects requests without a supported grant type', async () => {
    const res = await token(form({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('unsupported_grant_type');
  });

  it('rejects authorization_code grants without an issued code', async () => {
    const res = await token(form({ grant_type: 'authorization_code', code: 'made-up' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_grant');
  });

  it('issues short-lived anonymous tokens', async () => {
    const res = await token(form({ grant_type: 'authorization_code', code: 'glintbase_auth_abc' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.access_token).toMatch(/^glintbase_anon_/);
    expect(body.expires_in).toBeLessThanOrEqual(3600);
  });
});

describe('/api/oauth/authorize', () => {
  const authorizeUrl = (params: Record<string, string>) =>
    new NextRequest(`https://scan.glintbase.dev/api/oauth/authorize?${new URLSearchParams(params)}`);

  it('redirects trusted agent origins with a code', async () => {
    const res = await authorize(authorizeUrl({ redirect_uri: 'https://claude.ai/api/mcp/auth_callback', state: 's1' }));
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location')!);
    expect(location.origin).toBe('https://claude.ai');
    expect(location.searchParams.get('code')).toMatch(/^glintbase_auth_/);
    expect(location.searchParams.get('state')).toBe('s1');
  });

  it('refuses to redirect to an attacker origin that merely matches its own client_id', async () => {
    // No client metadata document can be fetched (network blocked), so the redirect is not listed.
    const res = await authorize(authorizeUrl({ client_id: 'https://evil.example/client.json', redirect_uri: 'https://evil.example/cb' }));
    expect(res.status).toBe(400);
  });
});
