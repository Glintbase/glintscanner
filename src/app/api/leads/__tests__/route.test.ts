import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const inserts: any[] = [];
let responses: Array<{ error: any }> = [];

vi.mock('@/lib/supabase/service', () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({
      insert: async (rows: any[]) => {
        inserts.push(rows[0]);
        return responses.shift() ?? { error: null };
      },
    }),
  }),
}));

import { POST } from '../route';

const SCAN_ID = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';
const req = (body: unknown) => new Request('http://localhost/api/leads', { method: 'POST', body: JSON.stringify(body) });

describe('POST /api/leads', () => {
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  beforeEach(() => {
    inserts.length = 0;
    responses = [];
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });
  afterEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  });

  it('retries without scan_id on a foreign-key violation', async () => {
    responses = [{ error: { code: '23503', message: 'violates foreign key constraint' } }, { error: null }];
    const res = await POST(req({ email: 'dev@acme.io', scanId: SCAN_ID }));
    const json = await res.json();
    expect(json).toEqual({ ok: true, stored: true });
    expect(inserts).toHaveLength(2);
    expect(inserts[0].scan_id).toBe(SCAN_ID);
    expect(inserts[1].scan_id).toBeNull();
  });

  it('does not report ok when the insert fails', async () => {
    responses = [{ error: { code: '42P01', message: 'relation "scan_leads" does not exist' } }];
    const res = await POST(req({ email: 'dev@acme.io' }));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });

  it('does not report ok when storage is not configured', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await POST(req({ email: 'dev@acme.io' }));
    expect(res.status).toBe(503);
    expect((await res.json()).stored).toBe(false);
  });
});
