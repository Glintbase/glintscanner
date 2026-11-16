import { describe, it, expect } from 'vitest';
import { outlinePage, quoteAppearsIn, relevantPassages } from '../pageOutline';

describe('outlinePage', () => {
  it('reads title, headings, same-site links and visible text from HTML', () => {
    const html = `<html><head><title>Docs &amp; Guides</title><style>.x{}</style></head><body>
      <h1>Getting started</h1><script>var secret = 1;</script>
      <p>Install with <code>npm i acme</code>.</p>
      <a href="/docs/auth/">Auth</a><a href="guide">Guide</a><a href="https://www.acme.test/api">API</a>
      <a href="https://other.test/x">Other</a><a href="/logo.png">Logo</a><a href="mailto:a@b.c">Mail</a>
    </body></html>`;
    const o = outlinePage(html, 'https://acme.test/docs/');
    expect(o.title).toBe('Docs & Guides');
    expect(o.headings).toEqual(['Getting started']);
    expect(o.links.map((l) => l.path)).toEqual(['/docs/auth', '/docs/guide', '/api']);
    expect(o.text).toContain('Install with npm i acme .');
    expect(o.text).not.toContain('secret');
  });

  it('reads markdown and plain-text files such as llms.txt', () => {
    const md = '# Acme\n> Payments API\n## Docs\n- [Quickstart](/docs/quickstart): start here\n- https://acme.test/docs/auth\n';
    const o = outlinePage(md, 'https://acme.test/llms.txt');
    expect(o.title).toBe('Acme');
    expect(o.headings).toEqual(['Acme', 'Docs']);
    expect(o.links.map((l) => l.path)).toEqual(['/docs/quickstart', '/docs/auth']);
  });
});

describe('answer evidence helpers', () => {
  it('matches quotes despite case, curly quotes and whitespace, and rejects short ones', () => {
    const text = 'Send your key in the   Authorization header as "Bearer <key>".';
    expect(quoteAppearsIn('send your key in the authorization header as “Bearer <key>”.', text)).toBe(true);
    expect(quoteAppearsIn('Use OAuth device flow for every request.', text)).toBe(false);
    expect(quoteAppearsIn('Bearer', text)).toBe(false);
  });

  it('picks the passages that mention the intent', () => {
    const text = 'x'.repeat(2000) + ' Authentication uses an API key in the header. ' + 'y'.repeat(2000);
    const passages = relevantPassages(text, 'How do I authenticate with an API key?', 2, 600);
    expect(passages.some((p) => p.includes('Authentication uses an API key'))).toBe(true);
  });
});
