/**
 * Dual-format page parsers (HTML + Markdown).
 * SPEC-03 / Phase 0: never overload markdown into an "html" field without contentKind.
 */

export type ContentKind = 'html' | 'markdown';

export interface ParsedPageFields {
  title: string;
  headings: string[];
  codeBlocks: { lang: string; code: string }[];
  wordCount: number;
  contentKind: ContentKind;
  /** Body text used for concept matching (stripped / raw md) */
  textForMatch: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractCodeBlocksFromMarkdown(markdown: string): { lang: string; code: string }[] {
  const blocks: { lang: string; code: string }[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    blocks.push({
      lang: match[1]?.toLowerCase() || 'text',
      code: match[2].trim(),
    });
  }
  return blocks;
}

export function extractCodeBlocksFromHtml(html: string): { lang: string; code: string }[] {
  const blocks: { lang: string; code: string }[] = [];
  const regex =
    /<pre\s*[^>]*>[\s\S]*?<code\s*class=["'](?:language-)?([a-zA-Z0-9_-]+)?["'][^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    blocks.push({
      lang: match[1]?.toLowerCase() || 'text',
      code: match[2]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .trim(),
    });
  }
  // Fallback: bare <pre><code> without language class
  if (blocks.length === 0) {
    const bare = /<pre\s*[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi;
    while ((match = bare.exec(html)) !== null) {
      blocks.push({
        lang: 'text',
        code: match[1]
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .trim(),
      });
    }
  }
  return blocks;
}

export function parseMarkdownPage(markdown: string, fallbackTitle = ''): ParsedPageFields {
  const headings: string[] = [];
  const headingRegex = /^#{1,4}\s+(.+)$/gm;
  let headingMatch;
  while ((headingMatch = headingRegex.exec(markdown)) !== null) {
    headings.push(headingMatch[1].trim());
  }

  let title = fallbackTitle;
  const h1 = markdown.match(/^#\s+(.+)$/m);
  if (h1) title = h1[1].trim();
  else if (headings[0]) title = headings[0];

  const codeBlocks = extractCodeBlocksFromMarkdown(markdown);
  const textForMatch = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`]/g, ' ');

  return {
    title: title || fallbackTitle || 'Untitled',
    headings: headings.slice(0, 15),
    codeBlocks,
    wordCount: markdown.split(/\s+/).filter(Boolean).length,
    contentKind: 'markdown',
    textForMatch,
  };
}

export function parseHtmlPage(html: string, fallbackTitle = ''): ParsedPageFields {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripHtml(titleMatch[1]).trim() : fallbackTitle;

  const headings: string[] = [];
  const headingRegex = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let headMatch;
  while ((headMatch = headingRegex.exec(html)) !== null) {
    const t = stripHtml(headMatch[2]).trim();
    if (t) headings.push(t);
  }

  const codeBlocks = extractCodeBlocksFromHtml(html);
  const textForMatch = stripHtml(html);

  return {
    title: title || fallbackTitle || 'Untitled',
    headings: headings.slice(0, 15),
    codeBlocks,
    wordCount: textForMatch.split(/\s+/).filter(Boolean).length,
    contentKind: 'html',
    textForMatch,
  };
}

/** Detect whether body looks like markdown vs HTML. */
export function detectContentKind(body: string): ContentKind {
  const trimmed = body.trim();
  if (!trimmed) return 'html';
  // Strong HTML signals
  if (/<\/?(html|head|body|div|section|article|nav)\b/i.test(trimmed.slice(0, 2000))) {
    return 'html';
  }
  // Markdown signals
  if (/^#{1,4}\s+/m.test(trimmed) || /```/.test(trimmed) || /^\*\s+/m.test(trimmed)) {
    return 'markdown';
  }
  if (trimmed.includes('<') && /<[a-z][\s\S]*>/i.test(trimmed.slice(0, 500))) {
    return 'html';
  }
  return 'markdown';
}

export function parsePageContent(body: string, fallbackTitle = '', kind?: ContentKind): ParsedPageFields {
  const contentKind = kind ?? detectContentKind(body);
  return contentKind === 'markdown'
    ? parseMarkdownPage(body, fallbackTitle)
    : parseHtmlPage(body, fallbackTitle);
}
