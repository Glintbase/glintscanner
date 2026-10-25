import { runScan } from '@/lib/scanner/core';
import { validateScanRequest } from '@/lib/scanner/v2/scanRequest';
import { runWithScannerIdentity, SCANNER_USER_AGENTS, type ScannerIdentity } from '@/lib/scanner/v2/fetchResource';
import { verifyInternalRequest } from '@/lib/scanner/internalAuth';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Operator-only: scans one URL from this deployment as each scanner identity, back to back,
 * and returns the results side by side. Nothing is saved. Requests must be signed
 * (x-glintbase-timestamp, x-glintbase-signature) with the service role key.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const ok = verifyInternalRequest(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    req.headers.get('x-glintbase-timestamp'),
    req.headers.get('x-glintbase-signature'),
    body
  );
  if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });

  let parsed: { url?: string; order?: ScannerIdentity[] };
  try {
    parsed = JSON.parse(body);
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const request = validateScanRequest({ url: parsed.url });
  if (!request.ok || !request.data) return Response.json({ error: request.error }, { status: 400 });
  const url = request.data.url;

  const identities = (parsed.order?.length ? parsed.order : ['browser', 'agent']).filter(
    (id): id is ScannerIdentity => id in SCANNER_USER_AGENTS
  );
  const results: Record<string, unknown> = {};
  for (const identity of identities) {
    try {
      const result = await runWithScannerIdentity(identity, () => runScan({ url }));
      const sc = result.scorecard;
      results[identity] = {
        score: result.score,
        grade: result.grade,
        uncappedScore: sc?.uncappedScore,
        gates: (sc?.gates || []).map((g) => g.checkId),
        homepageBlocked: sc?.evidence?.homepageBlocked,
        checksEvaluated: sc?.evidence?.checksEvaluated,
        checks: Object.fromEntries((sc?.results || []).map((c) => [c.checkId, c.status])),
      };
    } catch (e: any) {
      results[identity] = { error: e?.message || String(e) };
    }
  }
  return Response.json({ url, results });
}
