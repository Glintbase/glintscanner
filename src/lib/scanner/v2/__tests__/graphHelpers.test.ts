import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  extractSameSiteLinks,
  contentHash,
  countWeaklyConnectedComponents,
  computeGraphMetrics,
  hasDirectedPath,
  operationNodeId,
} from '../graphHelpers';
import type { GraphNode, GraphEdge } from '../types';
import { DocsStrategy } from '../strategies/docs';
import { parseOpenAPI } from '../parseOpenAPI';

const fixtures = join(process.cwd(), 'fixtures', 'sites');

describe('extractSameSiteLinks', () => {
  it('extracts same-host links from HTML fixture', () => {
    const html = readFileSync(join(fixtures, 'good-docs', 'docs', 'auth.html'), 'utf8');
    const links = extractSameSiteLinks(html, 'https://docs.example.com/docs/auth');
    expect(links.some((l) => l.includes('quickstart'))).toBe(true);
    expect(links.some((l) => l.includes('webhooks'))).toBe(true);
  });
});

describe('contentHash', () => {
  it('is stable and length-limited hex', () => {
    expect(contentHash('hello')).toBe(contentHash('hello'));
    expect(contentHash('hello')).not.toBe(contentHash('world'));
    expect(contentHash('x')).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe('graph metrics', () => {
  const nodes: GraphNode[] = [
    { id: 'a', label: 'A', type: 'page' },
    { id: 'b', label: 'B', type: 'page' },
    { id: 'c', label: 'C', type: 'page' },
    { id: 'd', label: 'D', type: 'concept', synthetic: false },
  ];
  const edges: GraphEdge[] = [
    { source: 'a', target: 'b', type: 'page_links_to_page' },
    { source: 'b', target: 'c', type: 'page_links_to_page' },
  ];

  it('counts WCC including isolates', () => {
    // a-b-c connected, d isolated → 2 components
    expect(countWeaklyConnectedComponents(nodes, edges)).toBe(2);
  });

  it('marks page sinks as deadEnds', () => {
    const metrics = computeGraphMetrics(nodes, edges);
    // c has out-degree 0, d has out-degree 0 but is concept — deadEnds count pages/canonical
    expect(metrics.deadEnds).toBeGreaterThanOrEqual(1);
    expect(metrics.components).toBe(2);
  });

  it('detects directed path', () => {
    expect(hasDirectedPath(edges, 'a', (id) => id === 'c')).toBe(true);
    expect(hasDirectedPath(edges, 'c', (id) => id === 'a')).toBe(false);
  });
});

describe('operation + docs extract integration', () => {
  it('openapi fixture yields operations', () => {
    const body = readFileSync(join(fixtures, 'good-docs', 'openapi.json'), 'utf8');
    const parsed = parseOpenAPI(body);
    expect(parsed.valid).toBe(true);
    const id = operationNodeId(parsed.operations[0].method, parsed.operations[0].path);
    expect(id.startsWith('operation:')).toBe(true);
  });

  it('docs strategy attaches evidence on concepts', async () => {
    const html = readFileSync(join(fixtures, 'good-docs', 'docs', 'auth.html'), 'utf8');
    const strategy = new DocsStrategy();
    const result = await strategy.extract('https://docs.example.com/docs/auth', html, []);
    const auth = result.entities.find((e) => e.id === 'concept:authentication');
    expect(auth).toBeTruthy();
    expect(auth?.properties?.evidence || auth?.properties?.detectedFrom).toBeTruthy();
  });
});
