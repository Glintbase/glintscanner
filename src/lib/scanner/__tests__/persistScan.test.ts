import { describe, it, expect } from 'vitest';
import { persistScan } from '../persistScan';

function fakeSupabase() {
  const calls: { op: string; payload?: any; filters: Array<[string, unknown]> }[] = [];
  const client: any = {
    from() {
      return {
        update(payload: any) {
          const call = { op: 'update', payload, filters: [] as Array<[string, unknown]> };
          calls.push(call);
          const chain: any = {
            eq(col: string, val: unknown) {
              call.filters.push([col, val]);
              return chain;
            },
            then(resolve: any) {
              resolve({ error: null });
            },
          };
          return chain;
        },
        insert(rows: any[]) {
          calls.push({ op: 'insert', payload: rows[0], filters: [] });
          return { select: () => ({ single: async () => ({ data: { id: rows[0].id }, error: null }) }) };
        },
      };
    },
  };
  return { client, calls };
}

const result: any = {
  url: 'https://stripe.com',
  score: 50,
  score_version: '3.2',
  dimensions: [],
  duration_ms: 1,
  surfaces: [],
  pages: [],
  graph: { nodes: [], edges: [] },
};

describe('persistScan', () => {
  it('supersedes older scans and stores the new one as latest by default', async () => {
    const { client, calls } = fakeSupabase();
    await persistScan(client, { result, url: 'https://stripe.com', scanId: 'a', companySlug: 'stripe' });
    expect(calls.filter((c) => c.op === 'update').length).toBeGreaterThan(0);
    expect(calls.find((c) => c.op === 'insert')!.payload.is_latest).toBe(true);
  });

  it('with markLatest false leaves existing rows alone and stores history only', async () => {
    const { client, calls } = fakeSupabase();
    const saved = await persistScan(client, { result, url: 'https://stripe.com', scanId: 'b', companySlug: 'stripe', markLatest: false });
    expect(saved).toBe(true);
    expect(calls.filter((c) => c.op === 'update')).toEqual([]);
    expect(calls.find((c) => c.op === 'insert')!.payload.is_latest).toBe(false);
  });
});
