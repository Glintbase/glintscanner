import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fetchModule from '../fetchResource';
import { probeUsability } from '../probes/usability';
import { getChecksForLayer } from '../probes/registry';
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

describe('probeUsability', () => {
  afterEach(() => vi.restoreAllMocks());

  it('emits every registry check exactly once with registry points and bonus flags', async () => {
    mockFetch(() => undefined);
    const { checks } = await probeUsability('https://plain.example.com', { kind: 'product' });
    const defs = getChecksForLayer('usability');

    expect(checks.map((c) => c.checkId).sort()).toEqual(defs.map((d) => d.id).sort());
    for (const def of defs) {
      const c = checks.find((x) => x.checkId === def.id)!;
      expect(c.maxPoints).toBe(def.points);
      expect(c.isBonus).toBe(def.isBonus);
    }
  });

  it('awards nothing to a site with no MCP, auth or OpenAPI surface', async () => {
    mockFetch(() => undefined);
    const { checks } = await probeUsability('https://plain.example.com', { kind: 'docs' });
    const c = byId(checks);

    expect(checks.filter((x) => x.status === 'pass')).toEqual([]);
    expect(c.get('mcp-server-manifest')!.status).toBe('warn');
    expect(c.get('mcp-auth-requirement')!.status).toBe('na');
    expect(c.get('mcp-tools-schema-strict')!.status).toBe('na');
    expect(c.get('api-operation-ids')!.status).toBe('na');
  });

  it('does not treat a 401 on a non-MCP path as an MCP server', async () => {
    mockFetch((url) =>
      url === 'https://intranet.example.com'
        ? { ok: false, status: 'ok', httpStatus: 401, headers: { 'www-authenticate': 'Basic realm="x"' } }
        : undefined
    );
    const { mcpServer } = await probeUsability('https://intranet.example.com', { kind: 'product' });
    expect(mcpServer.live).toBe(false);
  });

  it('scores MCP checks from the live tools/list and initialize results', async () => {
    mockFetch((url, opts) => {
      if (url !== 'https://acme.dev/mcp') return undefined;
      if (opts.method !== 'POST') return { ok: false, httpStatus: 405, status: 'ok' };
      const body = JSON.parse(opts.body);
      const reply = (result: any) => ({ body: JSON.stringify({ jsonrpc: '2.0', id: body.id, ...result }), contentType: 'application/json' });
      if (body.method === 'initialize') {
        return reply({ result: { protocolVersion: '2025-03-26', serverInfo: { name: 'acme' }, capabilities: { tools: {}, prompts: {} } } });
      }
      if (body.method === 'tools/list') {
        return reply({ result: { tools: [
          { name: 'search_docs', inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] }, annotations: { readOnlyHint: true } },
          { name: 'get_status', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
          { name: 'create_widget', inputSchema: { type: 'object', properties: { spec: {} } } },
        ] } });
      }
      if (body.method === 'tools/call' && body.params.name === 'get_status') return reply({ result: { content: [{ type: 'text', text: 'ok' }] } });
      return reply({ error: { code: -32601, message: 'Unknown tool' } });
    });

    const { checks, mcpServer } = await probeUsability('https://acme.dev', { kind: 'product' });
    const c = byId(checks);

    expect(mcpServer.live).toBe(true);
    expect(mcpServer.toolCount).toBe(3);
    expect(c.get('mcp-tools-listing')!.status).toBe('pass');
    expect(c.get('mcp-tools-breadth')!.status).toBe('pass');
    expect(c.get('mcp-tools-schema-strict')!.status).toBe('warn'); // create_widget.spec has no type
    expect(c.get('mcp-tools-readonly-hint')!.status).toBe('pass');
    expect(c.get('mcp-tools-destructive-hint')!.status).toBe('warn');
    expect(c.get('mcp-prompts-listing')!.status).toBe('pass');
    expect(c.get('mcp-resources-listing')!.status).toBe('warn');
    expect(c.get('mcp-error-reporting')!.status).toBe('pass');
    expect(c.get('mcp-honest-schemas')!.status).toBe('pass');
    expect(c.get('mcp-ssrf-guard')!.status).toBe('skip');
  });

  it('marks auth.md stages from content, not from the file merely existing', async () => {
    mockFetch((url) => (url === 'https://acme.dev/auth.md' ? { body: '# Auth\nUse Authorization: Bearer <token>.' } : undefined));
    const { checks } = await probeUsability('https://acme.dev', { kind: 'product' });
    const c = byId(checks);

    expect(c.get('auth-md-stage-use')!.status).toBe('pass');
    expect(c.get('auth-md-stage-register')!.status).toBe('warn');
    expect(c.get('auth-md-stage-exchange')!.status).toBe('warn');
  });

  it('inspects the OpenAPI document instead of passing every api-* check', async () => {
    mockFetch(() => undefined);
    const spec = {
      openapi: '3.0.3',
      servers: [{ url: 'https://api.acme.dev/v1' }],
      paths: {
        '/widgets': {
          get: { operationId: 'listWidgets', parameters: [{ name: 'cursor', in: 'query' }], responses: { '200': {} } },
          post: { operationId: 'createWidget', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '201': {} } },
        },
      },
    };
    const { checks } = await probeUsability('https://acme.dev', { kind: 'product', localContext: { openApiSpec: spec } });
    const c = byId(checks);

    expect(c.get('api-operation-ids')!.status).toBe('pass');
    expect(c.get('api-json-schemas')!.status).toBe('pass');
    expect(c.get('api-versioning-in-uri')!.status).toBe('pass');
    expect(c.get('api-pagination-cursor')!.status).toBe('pass');
    expect(c.get('api-error-schemas')!.status).toBe('warn');
    expect(c.get('api-rate-limit-headers')!.status).toBe('warn');
    expect(c.get('api-openapi-3-1-strict')!.status).toBe('warn');
  });
});

describe('inspectOpenApi', () => {
  it('flags duplicate operationIds and resolves $ref error responses', () => {
    const a = inspectOpenApi({
      openapi: '3.1.0',
      components: { responses: { Err: { content: { 'application/problem+json': { schema: { type: 'object' } } } } } },
      paths: {
        '/a': { get: { operationId: 'dup', responses: { '400': { $ref: '#/components/responses/Err' } } } },
        '/b': { get: { operationId: 'dup', responses: { default: { $ref: '#/components/responses/Err' } } } },
      },
    });
    expect(a.operationIds.duplicates).toEqual(['dup']);
    expect(a.errorResponses.operationsWithTypedError).toBe(2);
    expect(a.problemDetails).toBe(true);
    expect(a.isOpenApi31).toBe(true);
  });
});

describe('probeUsability MCP host discovery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('finds an auth-gated MCP server served at the root of an mcp. subdomain', async () => {
    mockFetch((url) =>
      url === 'https://mcp.acme.com'
        ? { ok: false, status: 'ok', httpStatus: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://mcp.acme.com/.well-known/oauth-protected-resource"' } }
        : undefined
    );
    const { mcpServer, checks } = await probeUsability('https://docs.acme.com', { kind: 'product' });
    expect(mcpServer.live).toBe(true);
    expect(mcpServer.endpoint).toBe('https://mcp.acme.com');
    expect(byId(checks).get('mcp-tools-listing')!.status).toBe('warn'); // tools hidden behind auth
  });

  it('does not treat a generic 401 on an MCP-like path as an MCP server (GET and POST)', async () => {
    const calls: string[] = [];
    mockFetch((url, opts) => {
      calls.push(`${opts.method || 'GET'} ${url}`);
      if (url === 'https://app.example.com/api/mcp') {
        return {
          ok: false,
          status: 'ok',
          httpStatus: 401,
          headers: { 'www-authenticate': 'Bearer realm="app"' },
          body: '{"error":"unauthorized"}',
          contentType: 'application/json',
        };
      }
      return undefined;
    });
    const { mcpServer } = await probeUsability('https://app.example.com', { kind: 'product' });
    expect(mcpServer.live).toBe(false);
    expect(calls).toContain('POST https://app.example.com/api/mcp');
  });

  it('accepts a 401 on an MCP path that answers with a JSON-RPC envelope', async () => {
    mockFetch((url) =>
      url === 'https://app.example.com/mcp'
        ? {
            ok: false,
            status: 'ok',
            httpStatus: 401,
            body: '{"jsonrpc":"2.0","id":null,"error":{"code":-32001,"message":"Unauthorized"}}',
            contentType: 'application/json',
          }
        : undefined
    );
    const { mcpServer } = await probeUsability('https://app.example.com', { kind: 'product' });
    expect(mcpServer.live).toBe(true);
    expect(mcpServer.endpoint).toBe('https://app.example.com/mcp');
  });

  it('probes sibling hosts on the registrable domain for multi-label suffixes', async () => {
    const urls: string[] = [];
    mockFetch((url) => {
      urls.push(url);
      return undefined;
    });
    await probeUsability('https://www.acme.co.uk', { kind: 'product' });
    expect(urls.some((x) => x.startsWith('https://docs.acme.co.uk/'))).toBe(true);
    expect(urls.some((x) => x.startsWith('https://mcp.acme.co.uk'))).toBe(true);
    expect(urls.some((x) => x.includes('//docs.co.uk'))).toBe(false);
  });
});

describe('probeAccess with minified HTML', () => {
  afterEach(() => vi.restoreAllMocks());

  it('recognises unquoted attributes and large sitemaps', async () => {
    const { probeAccess } = await import('../probes/access');
    const html = '<!doctype html><html><head><meta name=description content="x"><link rel=canonical href=https://min.example.com/><script type=application/ld+json>{"@type":"Organization"}</script></head><body><main><h1>Hi</h1></main></body></html>';
    const bigSitemap = '<?xml version="1.0"?><urlset>' + '<url><loc>https://min.example.com/p</loc></url>'.repeat(2000) + '</urlset>';
    mockFetch((url) => {
      if (url === 'https://min.example.com' || url === 'https://min.example.com/') return { body: html, contentType: 'text/html; charset=utf-8' };
      if (url === 'https://min.example.com/sitemap.xml') return { body: bigSitemap, contentType: 'application/xml' };
      return undefined;
    });
    const { checks } = await probeAccess('https://min.example.com');
    const c = byId(checks);
    expect(c.get('meta-description-quality')!.status).toBe('pass');
    expect(c.get('canonical-url-present')!.status).toBe('pass');
    expect(c.get('json-ld-structured-data')!.status).toBe('pass');
    expect(c.get('sitemap-xml-present')!.status).toBe('pass');
  });
});
