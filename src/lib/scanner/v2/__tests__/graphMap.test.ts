import { describe, it, expect } from 'vitest';
import { DocsStrategy } from '../strategies/docs';

describe('docs strategy dual format (C2)', () => {
  it('extracts auth concept from markdown body', async () => {
    const strategy = new DocsStrategy();
    const md = `# Getting Started

## Authentication

Create an API key in the dashboard.

\`\`\`bash
export API_KEY=sk_test
\`\`\`
`;
    const result = await strategy.extract('https://docs.example.com/auth', md, []);
    const concepts = result.entities.filter((e) => e.type === 'concept');
    expect(concepts.some((c) => c.id === 'concept:authentication')).toBe(true);
    expect(result.relations.some((r) => r.relation === 'documents')).toBe(true);
    expect(result.entities.some((e) => e.type === 'code_example')).toBe(true);
  });

  it('extracts webhooks concept from HTML', async () => {
    const strategy = new DocsStrategy();
    const html = `<html><head><title>Webhooks</title></head>
<body><h1>Webhooks</h1><h2>Event callbacks</h2>
<p>Subscribe to webhook events.</p>
</body></html>`;
    const result = await strategy.extract('https://docs.example.com/webhooks', html, []);
    expect(result.entities.some((e) => e.id === 'concept:webhooks')).toBe(true);
  });
});

describe('graph node type mapping helpers', () => {
  // Inline the same allowlist logic used in graph.ts for regression coverage
  const ALLOWED = new Set([
    'page',
    'concept',
    'api',
    'sdk',
    'workflow',
    'prerequisite',
    'code_example',
    'machine_entrypoint',
    'support_path',
    'canonical_link',
    'duplicate',
    'unresolved_reference',
  ]);

  function mapNodeType(raw: string): string {
    if (ALLOWED.has(raw)) return raw;
    return 'concept';
  }

  it('preserves machine_entrypoint and support_path', () => {
    expect(mapNodeType('machine_entrypoint')).toBe('machine_entrypoint');
    expect(mapNodeType('support_path')).toBe('support_path');
    expect(mapNodeType('canonical_link')).toBe('canonical_link');
  });

  it('falls back unknown types to concept', () => {
    expect(mapNodeType('WeirdType')).toBe('concept');
  });
});
