import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseLlmsTxt } from '../parseLlmsTxt';
import { parseOpenAPI } from '../parseOpenAPI';
import { urlPriorityScore, sortUrlsByPriority } from '../priority';
import { extractLocs, isSitemapIndex } from '../sitemap';
import { isContentSuspicious } from '../strategies/interface';

const fixtures = join(process.cwd(), 'fixtures', 'sites');

describe('parseLlmsTxt', () => {
  it('validates good fixture llms.txt', () => {
    const body = readFileSync(join(fixtures, 'good-docs', 'llms.txt'), 'utf8');
    const result = parseLlmsTxt(body, 'https://docs.example.com/llms.txt');
    expect(result.valid).toBe(true);
    expect(result.quality).toBe('good');
    expect(result.links.length).toBeGreaterThan(0);
    expect(result.sections.length).toBeGreaterThan(0);
  });

  it('rejects empty and HTML error pages', () => {
    expect(parseLlmsTxt('short').valid).toBe(false);
    expect(
      parseLlmsTxt('<!DOCTYPE html><html><head></head><body>Not found</body></html>').valid
    ).toBe(false);
  });
});

describe('parseOpenAPI', () => {
  it('parses fixture openapi.json', () => {
    const body = readFileSync(join(fixtures, 'good-docs', 'openapi.json'), 'utf8');
    const result = parseOpenAPI(body);
    expect(result.valid).toBe(true);
    expect(result.pathCount).toBe(2);
    expect(result.operations.length).toBeGreaterThanOrEqual(2);
    expect(result.version).toMatch(/3/);
  });

  it('rejects HTML and empty paths', () => {
    expect(parseOpenAPI('<html></html>').valid).toBe(false);
    expect(parseOpenAPI(JSON.stringify({ openapi: '3.0.0', paths: {} })).valid).toBe(false);
  });
});

describe('urlPriorityScore', () => {
  it('ranks auth/quickstart above blog', () => {
    expect(urlPriorityScore('https://x.com/docs/quickstart')).toBeGreaterThan(
      urlPriorityScore('https://x.com/blog/hello')
    );
    expect(urlPriorityScore('https://x.com/docs/auth')).toBeGreaterThan(
      urlPriorityScore('https://x.com/changelog')
    );
  });

  it('sorts deterministically', () => {
    const sorted = sortUrlsByPriority([
      'https://a.com/blog',
      'https://a.com/docs/quickstart',
      'https://a.com/docs/auth',
    ]);
    expect(sorted[0]).toContain('quickstart');
  });
});

describe('sitemap helpers', () => {
  it('detects index and extracts locs', () => {
    const index = `<?xml version="1.0"?>
      <sitemapindex>
        <sitemap><loc>https://example.com/sitemap-docs.xml</loc></sitemap>
      </sitemapindex>`;
    expect(isSitemapIndex(index)).toBe(true);
    expect(extractLocs(index)).toEqual(['https://example.com/sitemap-docs.xml']);
  });
});

describe('isContentSuspicious', () => {
  it('flags thin SPA shell', () => {
    const html = readFileSync(join(fixtures, 'thin-spa', 'index.html'), 'utf8');
    expect(isContentSuspicious(html, 10, 'docs')).toBe(true);
  });

  it('accepts rich docs html with enough body text', () => {
    // isContentSuspicious flags wordCount < 150 — supply a dense page
    const paragraphs = Array.from({ length: 40 }, (_, i) =>
      `<p>Documentation paragraph ${i} covering authentication tokens webhooks and API setup details for agents.</p>`
    ).join('\n');
    const html = `<!DOCTYPE html><html><body><h1>Authentication Guide</h1>${paragraphs}</body></html>`;
    const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(150);
    expect(isContentSuspicious(html, words, 'docs')).toBe(false);
  });
});
