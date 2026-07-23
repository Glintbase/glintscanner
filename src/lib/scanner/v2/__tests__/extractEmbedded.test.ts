import { describe, it, expect } from 'vitest';
import { extractEmbeddedContent } from '../extractEmbedded';

/** Build a paragraph with enough words to clear the 150-word threshold. */
function longProse(sentence: string, repeat: number): string {
  return Array.from({ length: repeat }, () => sentence).join(' ');
}

const PROSE = longProse(
  'The authentication flow requires a bearer token passed in the header.',
  30
);

describe('extractEmbeddedContent — __NEXT_DATA__', () => {
  it('recovers markdown content from a Next.js Pages Router shell', () => {
    const markdown = `# Getting Started\n\n## Authentication\n\n${PROSE}\n\n\`\`\`bash\ncurl -H "Authorization: Bearer TOKEN" https://api.example.com\n\`\`\``;
    const nextData = {
      props: {
        pageProps: {
          content: markdown,
          title: 'Getting Started',
        },
      },
    };
    const html = `<!DOCTYPE html><html><head><title>Docs</title></head><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
      nextData
    )}</script></body></html>`;

    const result = extractEmbeddedContent(html, 'https://example.com/docs');
    expect(result).not.toBeNull();
    expect(result!.method).toBe('next_data');
    expect(result!.wordCount).toBeGreaterThan(150);
    expect(result!.headings.length).toBeGreaterThan(0);
    expect(result!.headings).toContain('Authentication');
  });

  it('returns null for a thin shell with no embedded content', () => {
    const html = `<!DOCTYPE html><html><head><title>Loading</title></head><body><div id="__next"></div></body></html>`;
    const result = extractEmbeddedContent(html, 'https://example.com');
    expect(result).toBeNull();
  });
});

describe('extractEmbeddedContent — RSC flight chunks', () => {
  it('harvests readable text and leaves the title empty for raw fallback', () => {
    // Content only lives in framed __next_f chunks with escaped chars + noise.
    const sentence1 = longProse(
      'Install the client library and configure your API credentials before making requests.',
      12
    );
    const sentence2 = longProse(
      'Every webhook delivery includes a signature header you should verify to prevent spoofing.',
      12
    );
    const chunks = [
      `self.__next_f.push([1,"1:[[\\"HL\\",\\"children\\",\\"className\\"]]"])`,
      `self.__next_f.push([1,"2:\\"${sentence1}\\""])`,
      `self.__next_f.push([1,"3:[\\"div\\",\\"${sentence2}\\",true,null]"])`,
    ];
    const html = `<!DOCTYPE html><html><head><title>App Router Docs</title></head><body><div id="__next"></div><script>${chunks.join(
      '</script><script>'
    )}</script></body></html>`;

    const result = extractEmbeddedContent(html, 'https://example.com/docs');
    expect(result).not.toBeNull();
    expect(result!.method).toBe('rsc_flight');
    // Title fallback contract: rsc_flight defers to the raw <title>.
    expect(result!.title).toBe('');
    // Readable sentences recovered.
    expect(result!.textForMatch).toContain('client library');
    expect(result!.textForMatch).toContain('webhook delivery');
    // Framework/structural tokens filtered out (not standalone segments).
    expect(result!.textForMatch).not.toContain('className');
  });
});
