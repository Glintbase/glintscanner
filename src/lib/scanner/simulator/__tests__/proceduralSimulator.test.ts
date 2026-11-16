import { describe, it, expect, vi, beforeEach } from 'vitest';

// Every request goes through this fake site, so tests can check that each node maps to a real request.
type FakeResponse = { httpStatus: number; body?: string; contentType?: string; soft404?: boolean };
let site: Record<string, FakeResponse> = {};
const requested: string[] = [];

vi.mock('../../v2/fetchResource', () => ({
  currentScannerUserAgent: () => 'GlintbaseTest/1.0',
  fetchResource: vi.fn(async (url: string) => {
    requested.push(url);
    const r = site[url];
    if (!r) return { ok: false, status: 'unreachable', url };
    const ok = r.httpStatus >= 200 && r.httpStatus < 400 && !r.soft404;
    return {
      ok,
      status: r.soft404 ? 'soft_404' : ok ? 'ok' : 'unreachable',
      httpStatus: r.httpStatus,
      body: ok || r.soft404 ? r.body ?? '' : undefined,
      bytes: ok || r.soft404 ? Buffer.byteLength(r.body ?? '') : 0,
      contentType: r.contentType ?? 'text/plain',
      url,
    };
  }),
}));

// By default no planner model answers: the runner must fall back and say so.
vi.mock('../inferenceRouter', () => ({
  InferenceRouter: { chatCompletions: vi.fn() },
}));

import { E2BRunner } from '../e2bRunner';
import { InferenceRouter } from '../inferenceRouter';
import { estimateTokensFromBytes } from '../types';

const router = vi.mocked(InferenceRouter.chatCompletions);

const HOME_HTML = '<html><head><title>Acme</title></head><body><a href="/docs">Docs</a><a href="/pricing">Pricing</a><a href="https://other.test/x">Elsewhere</a></body></html>';
const DOCS_HTML =
  '<html><head><title>Acme Docs</title></head><body><h1>Authentication</h1><p>Send your key in the Authorization header as Bearer &lt;key&gt;.</p><a href="/docs/errors">Errors</a><a href="/docs/missing">Old page</a></body></html>';
const LLMS = '# Acme\n> Acme API\n- [Docs](/docs)\n';

const modelReply = (content: string, model = 'test-model') => ({
  provider: 'groq' as const,
  model,
  latencyMs: 5,
  message: { role: 'assistant' as const, content },
  usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 },
});

/** Planner opens /docs, then stops; the answer step returns `answerJson`. */
function scriptedModel(answerJson: object) {
  let plannerCalls = 0;
  router.mockImplementation(async (req: any) => {
    if (req.messages[0].role === 'system') {
      plannerCalls++;
      return plannerCalls === 1
        ? modelReply('{"action":"open","nextPath":"/docs","label":"docs","iconType":"docs","thought":"Docs link on the homepage."}')
        : modelReply('{"action":"stop","thought":"The docs page covers authentication."}');
    }
    return modelReply(JSON.stringify(answerJson));
  });
}

beforeEach(() => {
  requested.length = 0;
  delete process.env.E2B_API_KEY;
  router.mockReset();
  router.mockImplementation(async () => {
    throw new Error('no model in tests');
  });
  site = {
    'https://acme.test': { httpStatus: 200, body: HOME_HTML, contentType: 'text/html' },
    'https://acme.test/llms.txt': { httpStatus: 200, body: LLMS },
    'https://acme.test/openapi.json': { httpStatus: 404 },
    'https://acme.test/robots.txt': { httpStatus: 200, body: 'User-agent: *\nAllow: /\n' },
    // A 200 that serves an HTML page is not a real auth.md.
    'https://acme.test/auth.md': { httpStatus: 200, body: '<!doctype html><html>app shell</html>', contentType: 'text/html' },
    'https://acme.test/docs': { httpStatus: 200, body: DOCS_HTML, contentType: 'text/html' },
  };
});

describe('Simulate preview mode', () => {
  it('reports only measured requests: homepage plus the four agent files', async () => {
    const events: any[] = [];
    const result = await E2BRunner.runMission(
      { target: 'https://acme.test', harness: 'claude-code', intent: 'Find the API docs', mode: 'deterministic' },
      (e) => events.push(e)
    );

    expect(result.mode).toBe('preview');
    expect(result.status).toBe('success');
    expect(result.nodes.map((n) => n.url)).toEqual([
      'https://acme.test',
      'https://acme.test/llms.txt',
      'https://acme.test/openapi.json',
      'https://acme.test/robots.txt',
      'https://acme.test/auth.md',
    ]);
    for (const n of result.nodes) expect(requested).toContain(n.url);

    const byLabel = Object.fromEntries(result.nodes.map((n) => [n.label, n]));
    expect(byLabel['llms.txt'].status).toBe('pass');
    expect(byLabel['openapi.json'].httpStatus).toBe(404);
    expect(byLabel['auth.md'].status).toBe('fail');
    expect(byLabel['auth.md'].thought).toMatch(/HTML page/);
    expect(byLabel['llms.txt'].tokens).toBe(estimateTokensFromBytes(Buffer.byteLength(LLMS)));

    expect(result.kpis).toEqual({ pagesReachedPct: 60, deadEnds: 2, agentFilesFound: 2, agentFilesChecked: 4 });
    expect(result.answerCheck).toBeUndefined();
    expect(result.insight.summary).toMatch(/No agent ran/);
    expect(router).not.toHaveBeenCalled();
    expect(events.filter((e) => e.type === 'node_materialized')).toHaveLength(5);
  });

  it('suggests llms.txt only when it is really missing', async () => {
    site['https://acme.test/llms.txt'] = { httpStatus: 404 };
    const result = await E2BRunner.runMission({ target: 'https://acme.test', mode: 'deterministic' });
    expect(result.insight.remediations.map((r) => r.id)).toContain('rem-llms');
    expect(result.insight.remediations.every((r) => r.fixCommand === undefined)).toBe(true);
  });

  it('marks the run failed when the homepage does not answer', async () => {
    site['https://acme.test'] = { httpStatus: 503 };
    const result = await E2BRunner.runMission({ target: 'https://acme.test', mode: 'deterministic' });
    expect(result.status).toBe('failed');
    expect(result.insight.summary).toMatch(/did not answer/);
    expect(result.insight.remediations).toHaveLength(0);
  });
});

describe('Simulate navigation run without a model', () => {
  it('requests every page it shows, labels the fallback planner, and marks the answer unchecked', async () => {
    const events: any[] = [];
    const result = await E2BRunner.runMission(
      { target: 'https://acme.test', harness: 'claude-code', intent: 'Find the API docs', mode: 'e2b' },
      (e) => events.push(e)
    );

    expect(result.mode).toBe('in_process'); // no E2B key: it must say it ran on the server
    expect(result.planner).toBe('fixed path list');
    expect(result.telemetry.reasoningStepsCount).toBe(0);
    expect(result.nodes.map((n) => n.url)).toEqual([
      'https://acme.test',
      'https://acme.test/docs',
      'https://acme.test/llms.txt',
      'https://acme.test/docs/quickstart',
      'https://acme.test/docs/authentication',
      'https://acme.test/docs/api',
    ]);
    for (const n of result.nodes) expect(requested).toContain(n.url);

    const quickstart = result.nodes[3];
    expect(quickstart.httpStatus).toBe(0); // unreachable: a network error, not a made-up 404
    expect(quickstart.backtrackToId).toBeDefined();
    expect(quickstart.thought).toMatch(/guessed path/);
    expect(quickstart.remediation).toBeUndefined(); // guessed paths are not the site's fault

    expect(result.answerCheck?.verdict).toBe('not_checked');
    expect(result.insight.summary).toMatch(/not a real Claude Code run/);
    expect(events.some((e) => e.type === 'agent_backtrack')).toBe(true);
    const lastTick = events.filter((e) => e.type === 'telemetry_tick').pop();
    expect(lastTick.tokensBurned).toBe(result.telemetry.tokensBurned);
  });

  it('traces a broken link to the page that links to it', async () => {
    const result = await E2BRunner.runMission({ target: 'https://acme.test', harness: 'openclaw', mode: 'e2b' });
    // OpenClaw's fallback starts with /pricing, which the homepage links to and the site lacks.
    const pricing = result.nodes.find((n) => n.url === 'https://acme.test/pricing');
    expect(pricing?.status).toBe('fail');
    expect(pricing?.remediation?.manualInstruction).toMatch(/Your page \/ links to \/pricing/);
  });
});

describe('Simulate navigation run with a planner model', () => {
  it('follows links from the page it reads and verifies the answer quote', async () => {
    scriptedModel({
      found: true,
      answer: 'Use a Bearer token in the Authorization header.',
      quote: 'Send your key in the Authorization header as Bearer <key>.',
      sourceUrl: 'https://acme.test/docs',
    });
    const result = await E2BRunner.runMission({ target: 'https://acme.test', harness: 'claude-code', intent: 'How do I authenticate to the API?', mode: 'e2b' });

    expect(result.nodes.map((n) => n.url)).toEqual(['https://acme.test', 'https://acme.test/docs']);
    expect(result.nodes[1].decidedBy).toBe('llm');
    expect(result.nodes[1].thought).toMatch(/linked from \//);
    expect(result.planner).toBe('test-model (groq)');
    expect(result.telemetry.reasoningStepsCount).toBe(2); // one open + one stop

    expect(result.answerCheck?.verdict).toBe('found_with_evidence');
    expect(result.answerCheck?.sourceUrl).toBe('https://acme.test/docs');
    expect(result.plannerUsage).toEqual({ calls: 3, totalTokens: 300 });
    expect(result.insight.bulletPoints[0]).toMatch(/quote verified on \/docs/);
  });

  it('flags an answer whose quote is not on any fetched page', async () => {
    scriptedModel({
      found: true,
      answer: 'Use OAuth with PKCE.',
      quote: 'All requests must use the OAuth device flow with PKCE.',
      sourceUrl: 'https://acme.test/docs',
    });
    const result = await E2BRunner.runMission({ target: 'https://acme.test', intent: 'How do I authenticate?', mode: 'e2b' });
    expect(result.answerCheck?.verdict).toBe('claimed_unsupported');
    expect(result.insight.summary).toMatch(/unsupported/);
  });

  it('reports when the pages do not answer the intent', async () => {
    scriptedModel({ found: false, answer: '', quote: '', sourceUrl: '' });
    const result = await E2BRunner.runMission({ target: 'https://acme.test', intent: 'What is the refund policy?', mode: 'e2b' });
    expect(result.answerCheck?.verdict).toBe('not_found');
  });
});

describe('URL handling', () => {
  it('resolves bare names and keeps exact domains', async () => {
    expect(await E2BRunner.resolveTargetUrl('tastelabs.com')).toBe('https://tastelabs.com');
    expect(await E2BRunner.resolveTargetUrl('https://tastelabs.com')).toBe('https://tastelabs.com');
    expect(await E2BRunner.resolveTargetUrl('tastelabs')).toBe('https://tastelabs.com');
    expect(await E2BRunner.resolveTargetUrl('docs.github.com')).toBe('https://docs.github.com');
    expect(await E2BRunner.resolveTargetUrl('')).toBe('https://stripe.com');
  });

  it('keeps planner paths on the target host', () => {
    expect(E2BRunner.sanitizeNextPath('tastelabs.com/docs', 'tastelabs.com')).toBe('/docs');
    expect(E2BRunner.sanitizeNextPath('https://tastelabs.com/api/v1', 'tastelabs.com')).toBe('/api/v1');
    expect(E2BRunner.sanitizeNextPath('localhost:3000/pricing', 'tastelabs.com')).toBe('/pricing');
    expect(E2BRunner.sanitizeNextPath('/settings/', 'tastelabs.com')).toBe('/settings');
    expect(E2BRunner.sanitizeNextPath('example.com/llms.txt', 'example.com')).toBe('/llms.txt');
  });
});
