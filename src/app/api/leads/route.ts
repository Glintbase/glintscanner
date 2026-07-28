import { createAdminSupabaseClient } from '@/lib/supabase/service';
import { scanLog } from '@/lib/scanner/v2/scanLogger';
import { validateLeadEmail } from '@/lib/leads';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lead capture endpoint for the post-scan email gate.
 * Persistence failures never block the user — the gate must not trap anyone
 * because Supabase is unconfigured or momentarily down.
 */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validated = validateLeadEmail(body?.email);
  if (!validated.ok || !validated.email) {
    return Response.json({ error: validated.error }, { status: 400 });
  }
  const email = validated.email;

  // Client-side log keys are random short strings — only accept real DB UUIDs
  const scanId =
    typeof body?.scanId === 'string' && UUID_RE.test(body.scanId) ? body.scanId : null;
  const companySlug = typeof body?.companySlug === 'string' ? body.companySlug.slice(0, 120) : null;
  const scannedUrl = typeof body?.url === 'string' ? body.url.slice(0, 2048) : null;
  const score = Number.isFinite(body?.score) ? Math.round(body.score) : null;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    scanLog('warn', 'lead_capture_skipped', { reason: 'missing_service_role_key' });
    return Response.json({ ok: true });
  }

  try {
    const supabaseAdmin = createAdminSupabaseClient();
    const { error } = await supabaseAdmin.from('scan_leads').insert([
      {
        email,
        scan_id: scanId,
        company_slug: companySlug,
        scanned_url: scannedUrl,
        score,
        source: 'scan_gate',
      },
    ]);

    if (error) {
      // Unique violation (same email + scan) is an idempotent success
      if (error.code === '23505' || /duplicate key/i.test(error.message)) {
        return Response.json({ ok: true });
      }
      // Older DBs without the scan_leads table — log, never block the gate
      scanLog('error', 'lead_insert_failed', { error: error.message, companySlug });
      return Response.json({ ok: true });
    }

    scanLog('info', 'lead_captured', { companySlug, scanId, hasScore: score !== null });
  } catch (err: any) {
    scanLog('error', 'lead_capture_failed', { error: err.message });
  }

  return Response.json({ ok: true });
}
