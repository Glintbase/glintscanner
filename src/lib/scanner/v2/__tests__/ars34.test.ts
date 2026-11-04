/**
 * Fixture tests for ARS 3.4 (S1-S7). Each block names the change it covers; see
 * docs/methodology/ars-3.4.md.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fetchModule from '../fetchResource';
import { fetchResource } from '../fetchResource';
import { fetchWellKnown, matchesCatchAll, normaliseBody } from '../wellKnown';
import { findArdManifest, findArdHtmlLink, validateArdManifest } from '../ard';
import { compareSignals, parseContentSignal, parseSignalValues, robotsSignalsForAnyAgent } from '../contentSignal';
import { probeAccess, findMarkdownAlternateHeader, markdownTableReport, imageAltReport } from '../probes/access';
import { probeDiscovery } from '../probes/discovery';
import { probeUsability, webMcpScriptUrls } from '../probes/usability';
import { probePayments } from '../probes/payments';
import { probeMcpServer } from '../mcpProbe';
import { contentSignalConsistency } from '../probes/index';
import { getAllChecks, getChecksForLayer } from '../probes/registry';
import { inspectOpenApi } from '../openapiInspect';

type Handler = (url: string, opts: any) => Partial<fetchModule.FetchResourceResult> | undefined;

function mockFetch(handler: Handler) {
  return vi.spyOn(fetchModule, 'fetchResource').mockImplementation(async (url: string, opts: any = {}) => {
    const r = handler(url, opts);
    if (r) return { ok: true, status: 'ok', url, httpStatus: 200, ...r } as fetchModule.FetchResourceResult;
    return { ok: false, status: 'unreachable', url, httpStatus: 404 } as fetchModule.FetchResourceResult;
  });
}

const byId = (checks: { checkId: string }[]) => new Map(checks.map((c: any) => [c.checkId, c]));
const isControl = (url: string) => url.includes('/.well-known/glintbase-control-');
const SPA_SHELL = '<!doctype html><html><head><title>Acme</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// S7: registry after the notProbed audit
// ---------------------------------------------------------------------------
describe('S7: registry', () => {
  const REMOVED = [
    'chatgpt-app-listed', 'brand-search-accuracy', 'agentic-search-specific', 'agentic-search-usecase',
    'http2-support', 'pagination-rel-links', 'dns-caa-record', 'relative-link-resolution', 'plain-text-accessible',
    'mcp-sampling-support', 'mcp-roots-support', 'api-sdk-documentation', 'api-grpc-reflection', 'mcp-ssrf-guard',
    'api-error-actionability',
  ];
  const IMPLEMENTED = [
    'markdown-table-syntax', 'image-alt-prose', 'mcp-app-registry', 'mcp-apps-ui-quality', 'mcp-view-csp',
    'api-bulk-batch-operations', 'api-sandbox-environment', 'api-graphql-schema', 'mpp-support',
  ];

  it('holds 124 checks: 137 - 15 removed + 2 new', () => {
    const ids = getAllChecks().map((c) => c.id);
    expect(ids).toHaveLength(124);
    expect(new Set(ids).size).toBe(124);
    for (const id of REMOVED) expect(ids, id).not.toContain(id);
    for (const id of [...IMPLEMENTED, 'content-signal-consistency', 'mcp-skills-extension']) expect(ids, id).toContain(id);
  });

  it('keeps the new checks reported at 0 points', () => {
    for (const id of ['content-signal-consistency', 'mcp-skills-extension']) {
      const def = getAllChecks().find((c) => c.id === id)!;
      expect(def.points).toBe(0);
      expect(def.isBonus).toBe(true);
    }
  });

  it('discovery and access probes emit exactly the registry ids (access adds two reported checks in index.ts)', async () => {
    mockFetch(() => undefined);
    const d = await probeDiscovery('https://plain.example.com');
    expect(d.checks.map((c) => c.checkId).sort()).toEqual(getChecksForLayer('discovery').map((c) => c.id).sort());
    const a = await probeAccess('https://plain.example.com');
    const reportedInIndex = ['robots-edge-consistency', 'content-signal-consistency'];
    expect(a.checks.map((c) => c.checkId).sort()).toEqual(
      getChecksForLayer('access').map((c) => c.id).filter((id) => !reportedInIndex.includes(id)).sort()
    );
  });
});

// ---------------------------------------------------------------------------
// S5: .well-known control path
// ---------------------------------------------------------------------------
describe('S5: .well-known catch-all control', () => {
  it('rejects an HTML page when the random control path also served HTML', async () => {
    mockFetch((url) => ({ body: SPA_SHELL.replace('Acme', url), contentType: 'text/html' }));
    const res = await fetchWellKnown('https://spa.example.com/.well-known/security.txt');
    expect(res.ok).toBe(false);
    expect(res.catchAll).toBe(true);
  });

  it('rejects a JSON stub that every well-known path returns', async () => {
    mockFetch(() => ({ body: '{"ok":true,"requestId":"9f8e7d6c5b4a"}', contentType: 'application/json' }));
    const res = await fetchWellKnown('https://stub.example.com/.well-known/ucp');
    expect(res.catchAll).toBe(true);
  });

  it('accepts a real document when the control path 404s', async () => {
    mockFetch((url) => (url.endsWith('/.well-known/ucp') ? { body: '{"version":"2026-01-11","capabilities":[]}' } : undefined));
    const res = await fetchWellKnown('https://shop.example.com/.well-known/ucp');
    expect(res.ok).toBe(true);
    expect(res.catchAll).toBeUndefined();
  });

  it('accepts a real document that differs from a catch-all control', async () => {
    mockFetch((url) =>
      isControl(url) ? { body: SPA_SHELL, contentType: 'text/html' } : { body: 'Contact: mailto:security@acme.dev\nExpires: 2027-01-01T00:00:00Z\n', contentType: 'text/plain' }
    );
    const res = await fetchWellKnown('https://acme.dev/.well-known/security.txt');
    expect(res.ok).toBe(true);
  });

  it('requests the control once per origin', async () => {
    const spy = mockFetch(() => undefined);
    await fetchWellKnown('https://once.example.com/.well-known/a');
    await fetchWellKnown('https://once.example.com/.well-known/b');
    expect(spy.mock.calls.filter(([u]) => isControl(String(u)))).toHaveLength(1);
  });

  it('normalises volatile ids and the echoed path', () => {
    expect(normaliseBody('Not here: /.well-known/x id=abcdef0123456789', '/.well-known/x')).toBe(normaliseBody('Not here: /.well-known/y id=0123456789abcdef', '/.well-known/y'));
    expect(matchesCatchAll({ ok: true, body: '{}', url: 'https://a.b/.well-known/x' }, { url: '', catchAll: false, isHtml: false })).toBe(false);
  });

  it('no longer passes UCP and AP2 on a site that answers every path with JSON', async () => {
    mockFetch((url) => (url.startsWith('https://stub.shop/') ? { body: '{"status":"ok"}', contentType: 'application/json' } : undefined));
    const p = await probePayments('https://stub.shop', 'ecommerce');
    const c = byId(p.checks);
    expect(c.get('ucp-support')!.status).not.toBe('pass');
    expect(c.get('ap2-support')!.status).not.toBe('pass');
  });
});

describe('fetchResource redirect limit (used by S2)', () => {
  it('fails a response that still redirects after maxRedirects', async () => {
    const hops: string[] = [];
    globalThis.fetch = (async (u: any) => {
      hops.push(String(u));
      const n = hops.length;
      return new Response(null, { status: 302, headers: { location: `https://r.example.com/hop${n}` } });
    }) as typeof fetch;
    const res = await fetchResource('https://r.example.com/.well-known/ard.json', { maxRedirects: 1 });
    expect(res.ok).toBe(false);
    expect(res.status).toBe('failed');
    expect(hops).toHaveLength(2);
  });

  it('follows one redirect and reports it', async () => {
    globalThis.fetch = (async (u: any) =>
      String(u).endsWith('/ard.json')
        ? new Response(null, { status: 301, headers: { location: 'https://cdn.example.com/ard-manifest.json' } })
        : new Response('{"entries":[]}', { status: 200, headers: { 'content-type': 'application/ard+json' } })) as typeof fetch;
    const res = await fetchResource('https://r.example.com/.well-known/ard.json', { maxRedirects: 1 });
    expect(res.ok).toBe(true);
    expect(res.redirects).toBe(1);
    expect(res.finalUrl).toBe('https://cdn.example.com/ard-manifest.json');
  });
});

// ---------------------------------------------------------------------------
// S2: ARD draft-00
// ---------------------------------------------------------------------------
const ARD_DOC = {
  entries: [
    { identifier: 'https://acme.dev/mcp', displayName: 'Acme MCP', type: 'application/mcp-server-card+json', url: 'https://acme.dev/mcp/server-card' },
    { identifier: 'urn:acme:catalog', displayName: 'Acme catalog', type: 'application/ai-catalog+json', data: { entries: [] } },
  ],
};

describe('S2: ARD manifest (IETF drafts of 2026-10-30)', () => {
  it('validates entries: identifier, displayName, type, exactly one of url / data', () => {
    expect(validateArdManifest(ARD_DOC)).toEqual([]);
    expect(validateArdManifest({ entries: [{ identifier: 'x', displayName: 'X', type: 't', url: 'u', data: {} }] })[0]).toMatch(/exactly one/);
    expect(validateArdManifest({ entries: [{ displayName: 'X', url: 'u' }] })[0]).toMatch(/identifier, type/);
    expect(validateArdManifest({ id: 'urn:air:acme.dev:main', endpoints: { mcp: '/mcp' } })[0]).toMatch(/pre-draft/);
  });

  it('finds the manifest at /.well-known/ard.json and records its media type', async () => {
    mockFetch((url) => (url === 'https://acme.dev/.well-known/ard.json' ? { body: JSON.stringify(ARD_DOC), contentType: 'application/ard+json' } : undefined));
    const f = await findArdManifest('https://acme.dev');
    expect(f).toMatchObject({ via: 'well-known', valid: true, entryCount: 2, mediaType: 'application/ard+json' });
  });

  it('asks fetchResource for at most one redirect on the well-known URL', async () => {
    const spy = mockFetch(() => undefined);
    await findArdManifest('https://acme.dev');
    const wk = spy.mock.calls.find(([u]) => u === 'https://acme.dev/.well-known/ard.json');
    expect(wk?.[1]?.maxRedirects).toBe(1);
  });

  it('falls back to Link: rel="ard" on a HEAD of the root, whatever its status', async () => {
    mockFetch((url, opts) => {
      if (url === 'https://acme.dev/' && opts.method === 'HEAD') return { ok: false, httpStatus: 405, headers: { link: '</agents/ard.json>; rel="ard"; type="application/ard+json"' } };
      if (url === 'https://acme.dev/agents/ard.json') return { body: JSON.stringify(ARD_DOC), contentType: 'application/ard+json' };
      return undefined;
    });
    const f = await findArdManifest('https://acme.dev');
    expect(f).toMatchObject({ via: 'link-header', valid: true, url: 'https://acme.dev/agents/ard.json' });
  });

  it('reads <link rel="ard"> from the root page last', async () => {
    expect(findArdHtmlLink('<link rel="ard" type="application/ard+json" href="/ard.json">')).toBe('/ard.json');
    mockFetch((url, opts) => {
      if (url === 'https://acme.dev/' && opts.method !== 'HEAD') return { body: '<html><head><link rel="ard" href="/x/ard.json"></head></html>' };
      if (url === 'https://acme.dev/x/ard.json') return { body: JSON.stringify(ARD_DOC) };
      return undefined;
    });
    expect((await findArdManifest('https://acme.dev'))?.via).toBe('html-link');
  });

  it('ard-catalog: pass on a draft manifest, warn on a pre-draft file, pass on the AI Catalog fallback', async () => {
    mockFetch((url) => (url === 'https://new.dev/.well-known/ard.json' ? { body: JSON.stringify(ARD_DOC), contentType: 'application/json' } : undefined));
    let c = byId((await probeDiscovery('https://new.dev')).checks);
    expect(c.get('ard-catalog')!.status).toBe('pass');
    expect(c.get('ard-catalog')!.message).toMatch(/served as application\/json/);
    expect(c.get('ard-entries-valid')!.status).toBe('pass');

    vi.restoreAllMocks();
    mockFetch((url) => (url === 'https://old.dev/.well-known/ard.json' ? { body: '{"id":"urn:air:old.dev:main","endpoints":{"mcp":"/mcp"}}' } : undefined));
    c = byId((await probeDiscovery('https://old.dev')).checks);
    expect(c.get('ard-catalog')!.status).toBe('warn');
    expect(c.get('ard-entries-valid')!.status).toBe('warn');

    vi.restoreAllMocks();
    mockFetch((url) => (url === 'https://cat.dev/.well-known/ai-catalog.json' ? { body: '{"entries":[]}' } : undefined));
    c = byId((await probeDiscovery('https://cat.dev')).checks);
    expect(c.get('ard-catalog')!.status).toBe('pass');
    expect(c.get('ard-entries-valid')!.status).toBe('na');
  });

  it('ard-catalog does not pass on an SPA that serves its shell at every well-known path', async () => {
    mockFetch((url) => (url.startsWith('https://spa.dev/') ? { body: '{"app":"shell"}', contentType: 'application/json' } : undefined));
    const c = byId((await probeDiscovery('https://spa.dev')).checks);
    expect(c.get('ard-catalog')!.status).toBe('warn');
    expect(c.get('registry-branding')!.status).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// S1: Content-Signal consistency
// ---------------------------------------------------------------------------
describe('S1: Content-Signal parsing and comparison', () => {
  const ROBOTS = [
    '# As a condition of accessing this website...',
    'User-agent: *',
    'Content-Signal: search=yes, ai-train=no',
    'Allow: /',
    '',
    'User-agent: GPTBot',
    'Content-Signal: ai-input=no',
    'Disallow: /',
  ].join('\n');

  it('parses Content-Signal per user-agent group', () => {
    expect(parseContentSignal(ROBOTS)).toEqual([
      { userAgents: ['*'], values: { search: 'yes', 'ai-train': 'no' } },
      { userAgents: ['gptbot'], values: { 'ai-input': 'no' } },
    ]);
    expect(robotsSignalsForAnyAgent(parseContentSignal(ROBOTS))).toEqual({ search: 'yes', 'ai-train': 'no' });
    expect(parseSignalValues('ai-train=yes, search=yes, ai-input=yes, bogus=maybe')).toEqual({ 'ai-train': 'yes', search: 'yes', 'ai-input': 'yes' });
  });

  it('classifies agree, conflict, header-only, robots-only and none', () => {
    const robots = { search: 'yes', 'ai-train': 'no' } as const;
    expect(compareSignals([{ name: 'robots.txt', values: robots }, { name: 'HTML header', values: { 'ai-train': 'no' } }]).verdict).toBe('agree');
    const c = compareSignals([{ name: 'robots.txt', values: robots }, { name: 'Markdown header', values: { 'ai-train': 'yes', search: 'yes' } }]);
    expect(c.verdict).toBe('conflict');
    expect(c.conflicts).toEqual(['robots.txt: ai-train=no vs Markdown header: ai-train=yes']);
    expect(compareSignals([{ name: 'robots.txt' }, { name: 'HTML header', values: { search: 'yes' } }]).verdict).toBe('header-only');
    expect(compareSignals([{ name: 'robots.txt', values: robots }, { name: 'HTML header', values: {} }]).verdict).toBe('robots-only');
    expect(compareSignals([{ name: 'robots.txt' }]).verdict).toBe('none');
    // HTML and Markdown headers can disagree with each other too.
    expect(compareSignals([{ name: 'HTML header', values: { 'ai-train': 'no' } }, { name: 'Markdown header', values: { 'ai-train': 'yes' } }]).verdict).toBe('conflict');
  });

  it('end to end: robots says ai-train=no, the Markdown response header says yes (Cloudflare default)', async () => {
    mockFetch((url, opts) => {
      if (url === 'https://cf.dev/robots.txt') return { body: 'User-agent: *\nContent-Signal: search=yes, ai-train=no\nAllow: /\n', contentType: 'text/plain' };
      if (url === 'https://cf.dev' && /markdown/.test(opts.headers?.Accept || '')) {
        return { body: '# CF\n\nHello', contentType: 'text/markdown', headers: { 'content-signal': 'ai-train=yes, search=yes, ai-input=yes' } };
      }
      if (url === 'https://cf.dev') return { body: '<html><body><h1>CF</h1></body></html>', contentType: 'text/html', headers: {} as Record<string, string> };
      return undefined;
    });
    const [d, a] = await Promise.all([probeDiscovery('https://cf.dev'), probeAccess('https://cf.dev')]);
    expect(a.contentSignalHeaders).toMatchObject({ markdown: 'ai-train=yes, search=yes, ai-input=yes', markdownServed: true });
    const check = contentSignalConsistency(d, a);
    expect(check.status).toBe('warn');
    expect(check.earnedPoints).toBe(0);
    expect(check.message).toMatch(/ai-train=no vs Markdown header: ai-train=yes/);
  });

  it('is skip when the homepage was not observed', () => {
    const check = contentSignalConsistency(
      { robotsPolicy: { contentSignals: [] } } as any,
      { homepageBlocked: true, targetReachable: true, homepageStatus: 403, contentSignalHeaders: { markdownServed: false } } as any
    );
    expect(check.status).toBe('skip');
  });
});

// ---------------------------------------------------------------------------
// S4: Markdown alternate via Link header; S7 access probes
// ---------------------------------------------------------------------------
describe('S4: markdown-alternate-link via a Link header', () => {
  it('parses rel="alternate"; type="text/markdown" Link entries only', () => {
    expect(findMarkdownAlternateHeader('</index.md>; rel="alternate"; type="text/markdown", </feed>; rel="alternate"; type="application/rss+xml"')).toBe('/index.md');
    expect(findMarkdownAlternateHeader('</llms.txt>; rel="describedby"')).toBeUndefined();
  });

  it('passes when only the Link header declares the alternate and it resolves', async () => {
    mockFetch((url) => {
      if (url === 'https://md.dev') return { body: '<html><body><h1>Docs</h1></body></html>', headers: { link: '</index.md>; rel="alternate"; type="text/markdown"' } };
      if (url === 'https://md.dev/index.md') return { body: '# Docs\n', contentType: 'text/markdown' };
      return undefined;
    });
    const c = byId((await probeAccess('https://md.dev')).checks);
    expect(c.get('markdown-alternate-link')!.status).toBe('pass');
    expect(c.get('markdown-alternate-link')!.message).toMatch(/Link header/);
  });

  it('warns when the declared alternate serves HTML', async () => {
    mockFetch((url) => {
      if (url === 'https://md.dev') return { body: '<html><body></body></html>', headers: { link: '</index.md>; rel="alternate"; type="text/markdown"' } };
      if (url === 'https://md.dev/index.md') return { body: '<!doctype html><html></html>' };
      return undefined;
    });
    expect(byId((await probeAccess('https://md.dev')).checks).get('markdown-alternate-link')!.status).toBe('warn');
  });
});

describe('S7: markdown-table-syntax and image-alt-prose', () => {
  it('counts GFM tables and flags column mismatches, ignoring code fences', () => {
    const ok = '| a | b |\n|---|:-:|\n| 1 | 2 |\n\ntext';
    expect(markdownTableReport(ok)).toEqual({ count: 1, malformed: [] });
    const bad = 'a | b | c\n--- | ---\n1 | 2 | 3\n';
    expect(markdownTableReport(bad).malformed).toHaveLength(1);
    const rowBad = '| a | b |\n|---|---|\n| 1 | 2 | 3 |\n';
    expect(markdownTableReport(rowBad).malformed[0]).toMatch(/row 1 has 3 columns/);
    expect(markdownTableReport('```\n| a | b |\n|---|\n```\n').count).toBe(0);
    expect(markdownTableReport('| a \\| b | c |\n|---|---|\n| 1 | 2 |').malformed).toEqual([]);
  });

  it('measures alt coverage over non-decorative images', () => {
    const html = '<img src=a.png alt="Architecture diagram"><img src=b.png><img src=c.png alt=""><img src=d.png role="presentation"><img src=p.gif width="1" height="1">';
    expect(imageAltReport(html)).toEqual({ total: 5, informative: 2, withAlt: 1 });
  });

  it('scores both from fetched content', async () => {
    mockFetch((url, opts) => {
      if (url === 'https://t.dev' && /markdown/.test(opts.headers?.Accept || '')) return { body: '# T\n\n| a | b |\n|---|---|\n| 1 | 2 |\n', contentType: 'text/markdown' };
      if (url === 'https://t.dev') return { body: '<html><body><h1>T</h1><img src="x.png" alt="Chart of latency"><img src="y.png" alt="Logo"></body></html>' };
      return undefined;
    });
    const c = byId((await probeAccess('https://t.dev')).checks);
    expect(c.get('markdown-table-syntax')!.status).toBe('pass');
    expect(c.get('image-alt-prose')!.status).toBe('pass');
  });

  it('is na without Markdown or images', async () => {
    mockFetch((url) => (url === 'https://n.dev' ? { body: '<html><body><h1>N</h1></body></html>' } : undefined));
    const c = byId((await probeAccess('https://n.dev')).checks);
    expect(c.get('markdown-table-syntax')!.status).toBe('na');
    expect(c.get('image-alt-prose')!.status).toBe('na');
  });
});

// ---------------------------------------------------------------------------
// S3: Skills over MCP; S7 MCP Apps checks
// ---------------------------------------------------------------------------
const UI_TOOLS = [
  { name: 'show_cart', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true }, _meta: { ui: { resourceUri: 'ui://acme/cart.html' } } },
];

function mcpServer(opts: { extensions?: Record<string, any>; skills?: 'ok' | 'error'; ui?: 'profile' | 'plain' } = {}) {
  const requests: any[] = [];
  mockFetch((url, o) => {
    if (url !== 'https://acme.dev/mcp') return undefined;
    if (o.method !== 'POST') return { ok: false, httpStatus: 405 };
    const body = JSON.parse(o.body);
    requests.push(body);
    const reply = (p: any) => ({ body: JSON.stringify({ jsonrpc: '2.0', id: body.id, ...p }) });
    switch (body.method) {
      case 'initialize':
        return reply({ result: { protocolVersion: '2025-11-25', capabilities: { tools: {}, resources: {}, ...(opts.extensions ? { extensions: opts.extensions } : {}) } } });
      case 'tools/list':
        return reply({ result: { tools: opts.ui ? UI_TOOLS : [{ name: 'search', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }] } });
      case 'skills/list':
        return opts.skills === 'ok'
          ? reply({ result: { resultType: 'complete', skills: [{ uri: 'skill://refunds/SKILL.md', frontmatter: { name: 'refunds', description: 'Refunds' }, resources: [] }] } })
          : reply({ error: { code: -32601, message: 'Method not found' } });
      case 'resources/read':
        return reply({
          result: {
            contents: [{
              uri: body.params.uri,
              mimeType: opts.ui === 'profile' ? 'text/html;profile=mcp-app' : 'text/html',
              text: '<html><body>cart</body></html>',
              ...(opts.ui === 'profile' ? { _meta: { ui: { csp: { connectDomains: ['https://api.acme.dev'] } } } } : {}),
            }],
          },
        });
      case 'tools/call':
        return reply(body.params.name === 'show_cart' ? { result: { content: [{ type: 'text', text: 'ok' }] } } : { error: { code: -32602, message: 'Unknown tool' } });
      default:
        return reply({ error: { code: -32601, message: 'Method not found' } });
    }
  });
  return requests;
}

describe('S3: mcp-skills-extension', () => {
  it('passes when io.modelcontextprotocol/skills is declared and skills/list answers', async () => {
    mcpServer({ extensions: { 'io.modelcontextprotocol/skills': {}, 'io.modelcontextprotocol/ui': {} }, skills: 'ok' });
    const u = await probeUsability('https://acme.dev', { kind: 'product' });
    const check = byId(u.checks).get('mcp-skills-extension')!;
    expect(check.status).toBe('pass');
    expect(check.earnedPoints).toBe(0);
    expect(check.evidence.extensions).toEqual(['io.modelcontextprotocol/skills', 'io.modelcontextprotocol/ui']);
    expect(check.evidence.skillsList).toMatchObject({ answered: true, count: 1 });
  });

  it('warns when the extension is declared but skills/list fails', async () => {
    mcpServer({ extensions: { 'io.modelcontextprotocol/skills': {} }, skills: 'error' });
    const check = byId((await probeUsability('https://acme.dev', { kind: 'product' })).checks).get('mcp-skills-extension')!;
    expect(check.status).toBe('warn');
    expect(check.message).toMatch(/Method not found/);
  });

  it('is na and lists other extensions when skills is not declared, without calling skills/list', async () => {
    const requests = mcpServer({ extensions: { 'com.example/thing': {} } });
    const check = byId((await probeUsability('https://acme.dev', { kind: 'product' })).checks).get('mcp-skills-extension')!;
    expect(check.status).toBe('na');
    expect(check.message).toMatch(/com\.example\/thing/);
    expect(requests.some((r) => r.method === 'skills/list')).toBe(false);
  });
});

describe('S7: MCP Apps checks from tools/list and one resources/read', () => {
  it('passes registry, profile and CSP for a compliant UI resource', async () => {
    mcpServer({ ui: 'profile' });
    const c = byId((await probeUsability('https://acme.dev', { kind: 'product' })).checks);
    expect(c.get('mcp-app-registry')!.status).toBe('pass');
    expect(c.get('mcp-apps-ui-quality')!.status).toBe('pass');
    expect(c.get('mcp-view-csp')!.status).toBe('pass');
  });

  it('warns on the wrong MIME type and missing CSP', async () => {
    mcpServer({ ui: 'plain' });
    const c = byId((await probeUsability('https://acme.dev', { kind: 'product' })).checks);
    expect(c.get('mcp-app-registry')!.status).toBe('pass');
    expect(c.get('mcp-apps-ui-quality')!.status).toBe('warn');
    expect(c.get('mcp-view-csp')!.status).toBe('warn');
  });

  it('accepts the deprecated flat _meta["ui/resourceUri"] key in the prober', async () => {
    mockFetch((url, o) => {
      if (o.method !== 'POST') return undefined;
      const body = JSON.parse(o.body);
      const reply = (p: any) => ({ body: JSON.stringify({ jsonrpc: '2.0', id: body.id, ...p }) });
      if (body.method === 'initialize') return reply({ result: { protocolVersion: '2025-11-25', capabilities: {} } });
      if (body.method === 'tools/list') return reply({ result: { tools: [{ name: 't', inputSchema: { type: 'object' }, _meta: { 'ui/resourceUri': 'ui://t' } }] } });
      return reply({ error: { code: -32601, message: 'nope' } });
    });
    const live = await probeMcpServer('https://acme.dev/mcp');
    expect(live.tools[0].uiResourceUri).toBe('ui://t');
    expect(live.uiResource).toMatchObject({ uri: 'ui://t', read: false });
  });
});

// ---------------------------------------------------------------------------
// S6: edge-injected WebMCP (Cloudflare bridge on Commerce.com storefronts)
// ---------------------------------------------------------------------------
describe('S6: webmcp detects an edge-injected bridge script', () => {
  // Tag as observed on cornerstone-light-demo.mybigcommerce.com on 2026-11-04.
  const PAGE = '<html><head><script type="module" async fetchpriority="low" src="https://shop.example.com/.webmcp/bridge.js" data-packs="c2pa,mcp-server-client" data-mcp-url="/api/mcp"></script></head><body><h1>Shop</h1></body></html>';
  const BRIDGE = 'const mc = document.modelContext ?? navigator.modelContext; function registerTools(mc, ctx, reg) { for (const t of reg.tools) mc.registerTool(t); }';

  it('finds WebMCP scripts on the same site only', () => {
    expect(webMcpScriptUrls(PAGE, 'https://shop.example.com/')).toEqual(['https://shop.example.com/.webmcp/bridge.js']);
    expect(webMcpScriptUrls('<script src="https://evil.test/webmcp.js"></script>', 'https://shop.example.com/')).toEqual([]);
    expect(webMcpScriptUrls('<script src="/app.js" data-mcp-url="/mcp"></script>', 'https://shop.example.com/')).toEqual(['https://shop.example.com/app.js']);
  });

  it('passes webmcp, model-context and js-registration from the bridge (ARS 3.3 returned na)', async () => {
    mockFetch((url) => {
      if (url === 'https://shop.example.com') return { body: PAGE, contentType: 'text/html' };
      if (url === 'https://shop.example.com/.webmcp/bridge.js') return { body: BRIDGE, contentType: 'text/javascript' };
      return undefined;
    });
    const c = byId((await probeUsability('https://shop.example.com', { kind: 'product' })).checks);
    expect(c.get('webmcp')!.status).toBe('pass');
    expect(c.get('webmcp-model-context')!.status).toBe('pass');
    expect(c.get('webmcp-js-registration')!.status).toBe('pass');
    expect(c.get('webmcp')!.message).toMatch(/\.webmcp\/bridge\.js/);
  });

  it('does not pass when the bridge path serves the site shell', async () => {
    mockFetch((url) => (url === 'https://shop.example.com' ? { body: PAGE } : url.endsWith('bridge.js') ? { body: SPA_SHELL } : undefined));
    expect(byId((await probeUsability('https://shop.example.com', { kind: 'product' })).checks).get('webmcp')!.status).toBe('na');
  });
});

// ---------------------------------------------------------------------------
// S7: API checks from the OpenAPI document, GraphQL, MPP
// ---------------------------------------------------------------------------
const SPEC = {
  openapi: '3.1.0',
  servers: [{ url: 'https://api.acme.dev/v1' }, { url: 'https://sandbox.api.acme.dev/v1', description: 'Sandbox' }],
  paths: {
    '/charges/batch': { post: { operationId: 'batchCreateCharges', responses: { 200: { description: 'ok' } } } },
    '/reports': {
      get: {
        operationId: 'getReport',
        'x-payment-info': { offers: [{ intent: 'charge', method: 'tempo', amount: '100', currency: 'usd' }] },
        responses: { 200: { description: 'ok' }, 402: { description: 'Payment Required' } },
      },
    },
  },
};

describe('S7: OpenAPI-derived checks, GraphQL and MPP', () => {
  it('inspects bulk operations, sandbox servers and MPP payment operations', () => {
    const a = inspectOpenApi(SPEC);
    expect(a.bulkOperations).toBe(true);
    expect(a.sandboxServer).toBe('https://sandbox.api.acme.dev/v1');
    expect(a.paymentOperations).toBe(1);
    const plain = inspectOpenApi({ openapi: '3.0.0', servers: [{ url: 'https://api.acme.dev' }], paths: { '/latest': { get: { responses: {} } } } });
    expect(plain.bulkOperations).toBe(false);
    expect(plain.sandboxServer).toBeUndefined();
    // x-payment-info without a 402 response is not MPP discovery.
    expect(inspectOpenApi({ openapi: '3.1.0', paths: { '/a': { get: { 'x-payment-info': { intent: 'charge', method: 'tempo', amount: null }, responses: {} } } } }).paymentOperations).toBe(0);
  });

  it('scores api-bulk-batch-operations and api-sandbox-environment from the spec', async () => {
    mockFetch(() => undefined);
    const c = byId((await probeUsability('https://acme.dev', { kind: 'product', localContext: { openApiSpec: SPEC } })).checks);
    expect(c.get('api-bulk-batch-operations')!.status).toBe('pass');
    expect(c.get('api-sandbox-environment')!.status).toBe('pass');
  });

  it('api-graphql-schema: pass on introspection, warn when disabled, na on a JSON 404', async () => {
    mockFetch((url, o) => (url === 'https://gql.dev/graphql' && o.method === 'POST' ? { body: '{"data":{"__schema":{"queryType":{"name":"Query"}}}}' } : undefined));
    expect(byId((await probeUsability('https://gql.dev', { kind: 'product' })).checks).get('api-graphql-schema')!.status).toBe('pass');
    vi.restoreAllMocks();
    mockFetch((url, o) => (url === 'https://gql.dev/api/graphql' && o.method === 'POST' ? { body: '{"errors":[{"message":"GraphQL introspection is not allowed"}]}' } : undefined));
    expect(byId((await probeUsability('https://gql.dev', { kind: 'product' })).checks).get('api-graphql-schema')!.status).toBe('warn');
    vi.restoreAllMocks();
    mockFetch((url) => (url.endsWith('/graphql') ? { ok: false, httpStatus: 404, body: '{"errors":[{"message":"Not found"}]}' } : undefined));
    expect(byId((await probeUsability('https://gql.dev', { kind: 'product' })).checks).get('api-graphql-schema')!.status).toBe('na');
  });

  it('mpp-support passes from x-payment-info offers, and from a 402 Payment challenge (not counted as x402)', async () => {
    mockFetch(() => undefined);
    let c = byId((await probePayments('https://shop.dev', 'ecommerce', { openApiSpec: SPEC })).checks);
    expect(c.get('mpp-support')!.status).toBe('pass');

    vi.restoreAllMocks();
    mockFetch((url) => (url === 'https://shop.dev/api/payment' ? { ok: false, httpStatus: 402, headers: { 'www-authenticate': 'Payment id="x", realm="shop.dev", method="tempo", intent="charge"' } } : undefined));
    c = byId((await probePayments('https://shop.dev', 'ecommerce')).checks);
    expect(c.get('mpp-support')!.status).toBe('pass');
    expect(c.get('x402-support')!.status).not.toBe('pass');

    vi.restoreAllMocks();
    mockFetch(() => undefined);
    c = byId((await probePayments('https://shop.dev', 'ecommerce')).checks);
    expect(c.get('mpp-support')!.status).toBe('warn');
  });
});
