import { describe, it, expect } from 'vitest';
import { looksLikeLlmsTxt, findMarkdownAlternate } from '../probes/access';

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
