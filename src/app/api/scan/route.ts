import { runScan } from '@/lib/scanner/core';
import { validateScanRequest } from '@/lib/scanner/v2/scanRequest';
import { scanLog } from '@/lib/scanner/v2/scanLogger';
import { deriveCompanySlug } from '@/lib/scanner/shared';
import { createAdminSupabaseClient } from '@/lib/supabase/service';
import { buildChecksPayload, persistScan } from '@/lib/scanner/persistScan';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';
/** Vercel / platform timeout budget (seconds) */
export const maxDuration = 300;

const MAX_CONCURRENT_SCANS = Number(process.env.MAX_CONCURRENT_SCANS) || 3;
let activeScansCount = 0;

export async function POST(req: Request) {
  if (activeScansCount >= MAX_CONCURRENT_SCANS) {
    return new Response(
      JSON.stringify({
        error: 'Server is currently at capacity processing active scans. Please try again shortly.',
        code: 'SERVER_BUSY',
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '30',
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body', code: 'INVALID_URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const validated = validateScanRequest(body);
  if (!validated.ok || !validated.data) {
    return new Response(
      JSON.stringify({ error: validated.error, code: validated.code || 'INVALID_URL' }),
      { status: validated.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { url, enabledSurfaces, profile, useAgentHarness, provider, archetypeOverride } = validated.data;
  const scanId = randomUUID();
  const companySlug = deriveCompanySlug(url);

  scanLog('info', 'scan_started', { scanId, url, profile, companySlug });

  activeScansCount++;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(data) + '\n'));
      };

      try {
        const result = await runScan(
          {
            url,
            options: {
              enabledSurfaces,
              profile,
              useAgentHarness: useAgentHarness || profile === 'deep',
              provider: provider || 'google',
              archetypeOverride,
            },
          },
          {
            onProgress: (log) => {
              send(log);
            },
          }
        );

        const checksPayload = buildChecksPayload(result, scanId, companySlug);

        // 1. Persist to Supabase and revalidate with strict 3.5s timeout BEFORE emitting complete
        if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
          const persistPromise = (async () => {
            try {
              const saved = await persistScan(createAdminSupabaseClient(), { result, url, scanId, companySlug });
              if (saved) {
                try {
                  revalidatePath('/leaderboard');
                  if (companySlug) {
                    revalidatePath(`/scan/${companySlug}`);
                    revalidatePath(`/${companySlug}`);
                  }
                  revalidatePath('/');
                } catch {
                  // Non-fatal if called in an environment without active request context
                }
              }
            } catch (dbErr: any) {
              scanLog('error', 'db_connection_failed', { scanId, error: dbErr.message });
            }
          })();

          // Cap database persist duration to 3500ms max so stream closes promptly
          await Promise.race([
            persistPromise,
            new Promise((resolve) => setTimeout(resolve, 3500)),
          ]);
        }

        // 2. Emit completion to the client AFTER Supabase persistence completes
        send({
          type: 'complete',
          score: result.score,
          score_version: result.score_version,
          grade: result.grade,
          gradeLabel: result.gradeLabel,
          archetype: result.archetype,
          scorecard: result.scorecard,
          scanId,
          checks: checksPayload,
          id: scanId,
        });

        scanLog('info', 'scan_complete', {
          scanId,
          score: result.score,
          score_version: result.score_version,
          duration_ms: result.duration_ms,
          companySlug,
        });
      } catch (error: any) {
        scanLog('error', 'scan_failed', { scanId, error: error.message, url });
        send({
          type: 'error',
          message: error.message,
          code: error.code || 'INTERNAL',
          scanId,
        });
      } finally {
        activeScansCount = Math.max(0, activeScansCount - 1);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain',
      'Transfer-Encoding': 'chunked',
      'X-Scan-Id': scanId,
    },
  });
}
