import { describe, it, expect } from 'vitest';
import { looksLikeLlmsTxt, findMarkdownAlternate, parseLinkHeader, parseApiCatalog, openApiLinksFromHtml, parseOpenApiDocument } from '../probes/access';

describe('looksLikeLlmsTxt', () => {
  it('accepts a Markdown index with a heading and links', () => {
    expect(looksLikeLlmsTxt('# Acme\n\n> Docs\n\n- [API](https://acme.com/api.md): REST API\n', 'text/plain')).toBe(true);
  });

  it('accepts links without a heading', () => {
    expect(looksLikeLlmsTxt('- [Guide](/guide.md)\n- [API](/api.md)', 'text/markdown')).toBe(true);
  });

  it('rejects an HTML soft-404 served with 200', () => {
    expect(looksLikeLlmsTxt('<!DOCTYPE html><html><body><h1>Page not found</h1></body></html>', 'text/html')).toBe(false);
  });

  it('rejects an SPA shell even when the content type says text/plain', () => {
    expect(looksLikeLlmsTxt('<html><head></head><body><div id="root"></div></body></html>', 'text/plain')).toBe(false);
  });

  it('rejects a plain-text error string', () => {
    expect(looksLikeLlmsTxt('Not Found', 'text/plain')).toBe(false);
    expect(looksLikeLlmsTxt('{"error":"not found"}', 'application/json')).toBe(false);
  });

  it('rejects an empty body', () => {
    expect(looksLikeLlmsTxt('   \n', 'text/plain')).toBe(false);
  });
});

describe('findMarkdownAlternate', () => {
  it('finds rel="alternate" type="text/markdown" in any attribute order', () => {
    expect(findMarkdownAlternate('<head><link type="text/markdown" href="/index.md" rel="alternate"></head>')).toBe('/index.md');
    expect(findMarkdownAlternate("<link rel='alternate' type='text/markdown' href='https://x.dev/page.md'/>")).toBe('https://x.dev/page.md');
  });

  it('ignores other alternates and stylesheets', () => {
    const html = '<link rel="alternate" type="application/rss+xml" href="/feed.xml"><link rel="stylesheet" href="/a.css">';
    expect(findMarkdownAlternate(html)).toBeUndefined();
  });
});

describe('OpenAPI discovery helpers', () => {
  it('parses Link headers with several relations and quoted params', () => {
    const links = parseLinkHeader('</openapi.json>; rel="service-desc describedby"; type="application/openapi+json", </docs>; rel=service-doc');
    expect(links).toEqual([
      { href: '/openapi.json', rels: ['service-desc', 'describedby'], type: 'application/openapi+json' },
      { href: '/docs', rels: ['service-doc'], type: undefined },
    ]);
    expect(parseLinkHeader(undefined)).toEqual([]);
  });

  it('reads service-desc hrefs from an RFC 9264 linkset and rejects other JSON', () => {
    const body = JSON.stringify({
      linkset: [
        { anchor: 'https://api.example.com/v1', 'service-desc': [{ href: 'https://api.example.com/v1/openapi.json', type: 'application/openapi+json' }] },
        { anchor: 'https://api.example.com/v2', 'service-doc': [{ href: 'https://example.com/docs' }] },
      ],
    });
    expect(parseApiCatalog(body)).toEqual({ serviceDescs: ['https://api.example.com/v1/openapi.json'] });
    expect(parseApiCatalog('{"apis": []}')).toBeUndefined();
    expect(parseApiCatalog('<html></html>')).toBeUndefined();
  });

  it('finds spec links and rel="service-desc" in page HTML', () => {
    const html = '<link rel="service-desc" href="/api/spec"><a href="/reference/openapi.yaml">Spec</a><a href="/blog/openapi-tips">Tips</a>';
    expect(openApiLinksFromHtml(html)).toEqual(['/api/spec', '/reference/openapi.yaml']);
  });
});

describe('parseOpenApiDocument', () => {
  it('parses JSON and YAML specs', () => {
    expect(parseOpenApiDocument('{"openapi":"3.1.0","paths":{}}')?.openapi).toBe('3.1.0');
    const yaml = 'openapi: 3.0.3\ninfo:\n  title: Acme\n  version: "1"\npaths:\n  /items:\n    get:\n      operationId: listItems\n';
    expect(parseOpenApiDocument(yaml)?.paths['/items'].get.operationId).toBe('listItems');
  });

  it('rejects documents that are not specs', () => {
    expect(parseOpenApiDocument('{"name":"x"}')).toBeUndefined();
    expect(parseOpenApiDocument('title: not a spec\n')).toBeUndefined();
    expect(parseOpenApiDocument('openapi: [unclosed')).toBeUndefined();
  });
});
