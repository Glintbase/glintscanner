import { runScan } from '@/lib/scanner/core';
import { validateScanRequest } from '@/lib/scanner/v2/scanRequest';
import { scanLog } from '@/lib/scanner/v2/scanLogger';
import { deriveCompanySlug } from '@/lib/scanner/shared';
import { createAdminSupabaseClient } from '@/lib/supabase/service';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
/** Vercel / platform timeout budget (seconds) */
export const maxDuration = 300;

export async function POST(req: Request) {
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

  const { url, enabledSurfaces, profile, useAgentHarness, provider } = validated.data;
  const scanId = randomUUID();
  const companySlug = deriveCompanySlug(url);

  scanLog('info', 'scan_started', { scanId, url, profile, companySlug });

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
            },
          },
          {
            onProgress: (log) => {
              send(log);
            },
          }
        );

        let savedId: string | null = null;

        if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
          try {
            const supabaseAdmin = createAdminSupabaseClient();

            const { error: softErr } = await supabaseAdmin
              .from('public_scans')
              .update({ is_latest: false })
              .eq('company_slug', companySlug)
              .eq('is_latest', true);

            if (softErr && !/is_latest|company_slug|column/i.test(softErr.message)) {
              scanLog('warn', 'soft_history_update_failed', { scanId, error: softErr.message });
            }
            if (softErr && /column/i.test(softErr.message || '')) {
              await supabaseAdmin.from('public_scans').update({ is_latest: false }).eq('url', url);
            }

            const checksPayload = {
              surfaces: result.surfaces,
              pages: result.pages,
              framework: result.framework,
              graph: null,
              journeys: result.journeys,
              dimensions: result.dimensions,
              score_version: result.score_version,
              meta: {
                duration_ms: result.duration_ms,
                score_version: result.score_version,
                discovery_score: result.discovery_score,
                scan_id: scanId,
                status: 'complete',
                company_slug: companySlug,
              },
            };

            const insertRow: Record<string, unknown> = {
              url: result.url,
              score: result.score,
              checks: checksPayload,
              score_version: result.score_version,
              dimension_scores: Object.fromEntries(
                result.dimensions.map((d) => [d.name, d.score])
              ),
              duration_ms: result.duration_ms,
              company_slug: companySlug,
              is_latest: true,
              status: 'complete',
            };

            let { data, error: dbError } = await supabaseAdmin
              .from('public_scans')
              .insert([insertRow])
              .select('id')
              .single();

            if (
              dbError &&
              /column|score_version|company_slug|is_latest|status|dimension/i.test(dbError.message)
            ) {
              const attempts = [
                {
                  url: result.url,
                  score: result.score,
                  checks: checksPayload,
                  score_version: result.score_version,
                  company_slug: companySlug,
                  is_latest: true,
                },
                {
                  url: result.url,
                  score: result.score,
                  checks: checksPayload,
                  company_slug: companySlug,
                },
                { url: result.url, score: result.score, checks: checksPayload },
              ];
              for (const row of attempts) {
                const res = await supabaseAdmin.from('public_scans').insert([row]).select('id').single();
                if (!res.error && res.data) {
                  data = res.data;
                  dbError = null;
                  break;
                }
                dbError = res.error;
              }

              if (dbError) {
                await supabaseAdmin.from('public_scans').delete().eq('url', url);
                const res = await supabaseAdmin
                  .from('public_scans')
                  .insert([{ url: result.url, score: result.score, checks: checksPayload }])
                  .select('id')
                  .single();
                data = res.data;
                dbError = res.error;
              }
            }

            if (dbError) {
              scanLog('error', 'db_insert_failed', { scanId, error: dbError.message });
            } else if (data) {
              savedId = data.id;
              const g = result.graph;

              if (g.relationalNodes && g.relationalNodes.length > 0) {
                const nodeRows = g.relationalNodes.map((n: any) => ({
                  scan_id: savedId,
                  node_id: n.id,
                  type: n.type || 'page',
                  source_url: n.source_url || result.url,
                  source_strategy: n.source_strategy || 'generic',
                  title: n.title || '',
                  properties: n.properties || {},
                  content_hash: n.content_hash || null,
                  confidence: n.confidence ?? 1.0,
                  extracted_at: n.extracted_at || new Date().toISOString(),
                  synthetic:
                    n.properties?.synthetic === true || n.properties?.autoGenerated === true || false,
                  evidence: n.properties?.evidence || null,
                }));
                let { error: nodeErr } = await supabaseAdmin.from('scan_nodes').insert(nodeRows);
                if (nodeErr && /synthetic|evidence|column/i.test(nodeErr.message)) {
                  const slim = nodeRows.map(({ synthetic, evidence, ...rest }: any) => rest);
                  const retry = await supabaseAdmin.from('scan_nodes').insert(slim);
                  nodeErr = retry.error;
                }
                if (nodeErr) scanLog('error', 'nodes_insert_failed', { scanId, error: nodeErr.message });
              }

              if (g.relationalEdges && g.relationalEdges.length > 0) {
                const edgeRows = g.relationalEdges.map((e: any) => ({
                  scan_id: savedId,
                  from_id: e.from_id,
                  to_id: e.to_id,
                  relation: e.relation || 'page_references_page',
                  source_url: e.source_url || result.url,
                  properties: e.properties || {},
                }));
                const { error: edgeErr } = await supabaseAdmin.from('scan_edges').insert(edgeRows);
                if (edgeErr) scanLog('error', 'edges_insert_failed', { scanId, error: edgeErr.message });
              }
            }
          } catch (dbErr: any) {
            scanLog('error', 'db_connection_failed', { scanId, error: dbErr.message });
          }
        }

        scanLog('info', 'scan_complete', {
          scanId,
          savedId,
          score: result.score,
          score_version: result.score_version,
          duration_ms: result.duration_ms,
          companySlug,
        });

        send({
          type: 'complete',
          score: result.score,
          score_version: result.score_version,
          scanId,
          checks: {
            surfaces: result.surfaces,
            pages: result.pages,
            framework: result.framework,
            graph: result.graph,
            journeys: result.journeys,
            dimensions: result.dimensions,
            score_version: result.score_version,
            meta: {
              duration_ms: result.duration_ms,
              score_version: result.score_version,
              discovery_score: result.discovery_score,
              scan_id: scanId,
              status: 'complete',
              company_slug: companySlug,
            },
          },
          id: savedId,
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
