import { validateScanUrl } from '@/lib/scanner/v2/urlPolicy';
import { E2BRunner } from '@/lib/scanner/simulator/e2bRunner';
import type { SimulationOptions, HarnessType } from '@/lib/scanner/simulator/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const {
    target,
    harness = 'claude-code',
    agent = 'claude-code',
    intent,
    mode = 'e2b',
    allowMutations = false,
  } = body || {};

  if (!target || typeof target !== 'string') {
    return new Response(JSON.stringify({ error: 'Target URL is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Resolve and normalize target URL (e.g. bare "stripe" -> "https://stripe.com", strip localhost)
  const resolvedTarget = await E2BRunner.resolveTargetUrl(target);

  const policy = validateScanUrl(resolvedTarget, { allowHttp: true });
  if (!policy.ok || !policy.url) {
    return new Response(
      JSON.stringify({
        error: policy.message || 'Invalid or restricted URL',
        code: policy.code,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const finalTarget = policy.url;
  const resolvedHarness = (harness || agent || 'claude-code') as HarnessType;
  const simOptions: SimulationOptions = {
    target: finalTarget,
    harness: resolvedHarness,
    agent: resolvedHarness,
    intent: intent
      ? String(intent).slice(0, 500)
      : `I'm a developer. Find the API docs and how to authenticate for ${finalTarget.replace(/^https?:\/\//i, '').replace(/\/$/, '')}.`,
    mode: mode === 'deterministic' ? 'deterministic' : 'e2b',
    allowMutations: Boolean(allowMutations),
  };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(data) + '\n'));
      };

      try {
        send({
          type: 'init',
          harness: simOptions.harness,
          target: simOptions.target,
          intent: simOptions.intent,
          timestamp: Date.now(),
        });

        // Run mission via E2BRunner (with live microVM or deterministic fallback)
        const result = await E2BRunner.runMission(simOptions, (event) => {
          send(event);
        });

        // Emit final complete payload with Journey Tree, KPIs, and Insight
        send({
          type: 'complete',
          result,
        });
      } catch (err: any) {
        console.error('Simulation execution error:', err);
        send({
          type: 'error',
          message: err?.message || 'Simulation execution failed',
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
    },
  });
}
