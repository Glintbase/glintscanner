import { describe, it, expect } from 'vitest';
import { parseMarkdownPage, parseHtmlPage, parsePageContent } from '../parseContent';

describe('parseMarkdownPage', () => {
  it('extracts headings and code from markdown (Firecrawl path)', () => {
    const md = `# Authentication

## API keys

Use a bearer token.

\`\`\`bash
curl -H "Authorization: Bearer sk_test"
\`\`\`
`;
    const parsed = parseMarkdownPage(md);
    expect(parsed.contentKind).toBe('markdown');
    expect(parsed.title).toBe('Authentication');
    expect(parsed.headings.some((h) => h.toLowerCase().includes('auth'))).toBe(true);
    expect(parsed.codeBlocks.length).toBe(1);
    expect(parsed.codeBlocks[0].lang).toBe('bash');
    expect(parsed.textForMatch.toLowerCase()).toContain('bearer');
  });
});

describe('parseHtmlPage', () => {
  it('extracts title and headings from HTML', () => {
    const html = `<html><head><title>Webhooks Guide</title></head>
<body><h1>Webhooks</h1><h2>Events</h2>
<pre><code class="language-js">fetch('/hook')</code></pre>
</body></html>`;
    const parsed = parseHtmlPage(html);
    expect(parsed.contentKind).toBe('html');
    expect(parsed.title).toBe('Webhooks Guide');
    expect(parsed.headings[0]).toBe('Webhooks');
    expect(parsed.codeBlocks[0].lang).toBe('js');
  });
});

describe('parsePageContent auto-detect', () => {
  it('detects markdown without HTML wrapper', () => {
    const parsed = parsePageContent('# Install\n\nRun npm install.');
    expect(parsed.contentKind).toBe('markdown');
    expect(parsed.headings[0]).toBe('Install');
  });
});
