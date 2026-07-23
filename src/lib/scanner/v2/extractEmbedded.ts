/**
 * Embedded-content extraction for JS-rendered pages (zero dependency).
 *
 * Modern docs frameworks ship the real page content inside the HTML as JSON
 * even when the visible DOM is an empty SPA shell:
 *   - Next.js Pages Router  -> <script id="__NEXT_DATA__" type="application/json">
 *   - Next.js App Router     -> self.__next_f.push([...]) RSC flight chunks
 *   - Any site               -> <script type="application/ld+json"> (JSON-LD)
 *   - Progressive enhancement -> <noscript> fallback
 *   - Server-rendered docs    -> <main> / <article> / .prose containers
 *
 * A raw fetch already has this markup in memory, so we can recover the content
 * without a headless browser or an external API. All parsing is regex + guarded
 * JSON.parse over the fetched HTML string.
 */

import {
  parseMarkdownPage,
  parseHtmlPage,
  type ParsedPageFields,
} from './parseContent';

export type ExtractionMethod =
  | 'next_data'
  | 'rsc_flight'
  | 'json_ld'
  | 'noscript'
  | 'dom_selector';

export interface EmbeddedExtraction {
  /** May be empty — caller should fall back to the raw <title> when so. */
  title: string;
  headings: string[];
  codeBlocks: { lang: string; code: string }[];
  wordCount: number;
  textForMatch: string;
  method: ExtractionMethod;
}

/** Below this we don't consider a recovery worthwhile. */
const MIN_MEANINGFUL_WORDS = 150;

/** Safety caps for walking large/cyclic __NEXT_DATA__ payloads. */
const MAX_WALK_NODES = 20_000;
const MAX_WALK_DEPTH = 40;
/** Only collect string values long enough to be real prose. */
const MIN_STRING_LEN = 40;

/** Keys whose string values are most likely to hold page content. */
const PRIORITY_CONTENT_KEYS = new Set([
  'content',
  'body',
  'markdown',
  'mdxsource',
  'mdx',
  'source',
  'description',
  'rawbody',
  'text',
  'html',
]);

/**
 * Framework / structural tokens that appear in RSC flight payloads and are not
 * human-readable prose. Compared case-insensitively against whole segments.
 */
const RSC_NOISE_TOKENS = new Set([
  'children',
  'classname',
  'div',
  'span',
  'true',
  'false',
  'null',
  'undefined',
  'href',
  'rel',
  'src',
  'style',
  'className',
  '$',
  '$l',
  '$undefined',
  'default',
  'meta',
  'link',
  'script',
  'html',
  'head',
  'body',
]);

function toParsedShape(fields: ParsedPageFields): Omit<EmbeddedExtraction, 'method'> {
  return {
    title: fields.title === 'Untitled' ? '' : fields.title,
    headings: fields.headings,
    codeBlocks: fields.codeBlocks,
    wordCount: fields.wordCount,
    textForMatch: fields.textForMatch,
  };
}

/**
 * Depth-limited iterative (BFS) walk of a parsed __NEXT_DATA__ object.
 * Collects string values, prioritizing known content keys. Guards against
 * cyclic references and pathological nesting via a visited set + node/depth caps.
 */
function collectStringsFromNextData(root: unknown): string {
  const priority: string[] = [];
  const other: string[] = [];
  const visited = new WeakSet<object>();
  let nodes = 0;

  const queue: { value: unknown; key: string; depth: number }[] = [
    { value: root, key: '', depth: 0 },
  ];

  while (queue.length > 0) {
    const { value, key, depth } = queue.shift()!;
    if (nodes++ > MAX_WALK_NODES || depth > MAX_WALK_DEPTH) break;

    if (typeof value === 'string') {
      if (value.length >= MIN_STRING_LEN) {
        if (PRIORITY_CONTENT_KEYS.has(key.toLowerCase())) priority.push(value);
        else other.push(value);
      }
      continue;
    }

    if (value === null || typeof value !== 'object') continue;
    if (visited.has(value as object)) continue;
    visited.add(value as object);

    if (Array.isArray(value)) {
      for (const item of value) {
        queue.push({ value: item, key, depth: depth + 1 });
      }
    } else {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        queue.push({ value: v, key: k, depth: depth + 1 });
      }
    }
  }

  // Priority content first so parseMarkdownPage picks a sensible title/headings.
  return [...priority, ...other].join('\n\n');
}

function extractNextData(html: string): EmbeddedExtraction | null {
  const match = html.match(
    /<script\s+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) return null;
  try {
    const json = JSON.parse(match[1].trim());
    const text = collectStringsFromNextData(json);
    if (!text.trim()) return null;
    const parsed = parseMarkdownPage(text);
    return { ...toParsedShape(parsed), method: 'next_data' };
  } catch {
    return null;
  }
}

function unescapeJsString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\r/g, '')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16))
    );
}

function isReadableSegment(seg: string): boolean {
  const trimmed = seg.trim();
  if (trimmed.length < MIN_STRING_LEN) return false;
  if (RSC_NOISE_TOKENS.has(trimmed.toLowerCase())) return false;
  // Reject segments that look like identifiers / paths / css rather than prose.
  if (!/\s/.test(trimmed)) return false; // single token, no spaces
  if (/^[a-z0-9\-_/.]+$/i.test(trimmed)) return false; // slug/path/id
  // Require at least a couple of word-like tokens.
  const words = trimmed.split(/\s+/).filter((w) => /[a-zA-Z]{2,}/.test(w));
  return words.length >= 3;
}

/**
 * Harvest human-readable strings from App Router RSC flight chunks.
 * We deliberately do NOT parse the payload as one JSON object — the framed
 * streaming format (e.g. `1:[["HL",...]]`) corrupts trivially. Instead we pull
 * every quoted string literal, unescape, and keep prose-like segments.
 */
function extractRscFlight(html: string): EmbeddedExtraction | null {
  const pushRegex = /self\.__next_f\.push\(\s*(\[[\s\S]*?\])\s*\)/g;
  let m: RegExpExecArray | null;
  const raw: string[] = [];
  while ((m = pushRegex.exec(html)) !== null) {
    raw.push(m[1]);
  }
  if (raw.length === 0) return null;

  const combined = raw.join('');
  const literalRegex = /"((?:[^"\\]|\\.)*)"/g;
  const segments: string[] = [];
  let lit: RegExpExecArray | null;
  while ((lit = literalRegex.exec(combined)) !== null) {
    const seg = unescapeJsString(lit[1]);
    if (isReadableSegment(seg)) segments.push(seg.trim());
  }
  if (segments.length === 0) return null;

  const text = Array.from(new Set(segments)).join('\n\n');
  const parsed = parseMarkdownPage(text);
  // RSC harvesting rarely yields a clean title — leave it for the raw <title>.
  return { ...toParsedShape(parsed), title: '', method: 'rsc_flight' };
}

function extractJsonLd(html: string): EmbeddedExtraction | null {
  const regex =
    /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  const texts: string[] = [];
  let title = '';
  while ((m = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1].trim());
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const body =
          node.articleBody || node.text || node.description || node.abstract;
        if (typeof body === 'string' && body.length >= MIN_STRING_LEN) {
          texts.push(body);
        }
        if (!title && typeof node.headline === 'string') title = node.headline;
        if (!title && typeof node.name === 'string') title = node.name;
      }
    } catch {
      /* skip malformed block */
    }
  }
  if (texts.length === 0) return null;
  const parsed = parseMarkdownPage(texts.join('\n\n'), title);
  return { ...toParsedShape(parsed), title: title || parsed.title, method: 'json_ld' };
}

function extractNoscript(html: string): EmbeddedExtraction | null {
  const match = html.match(/<noscript[^>]*>([\s\S]*?)<\/noscript>/i);
  if (!match) return null;
  const inner = match[1];
  if (!/[a-zA-Z]/.test(inner)) return null;
  const parsed = parseHtmlPage(inner);
  return { ...toParsedShape(parsed), method: 'noscript' };
}

const DOM_CONTAINERS: { name: string; regex: RegExp }[] = [
  { name: 'main', regex: /<main[\s\S]*?>([\s\S]*?)<\/main>/i },
  { name: 'article', regex: /<article[\s\S]*?>([\s\S]*?)<\/article>/i },
  {
    name: 'theme-doc-markdown',
    regex: /<[^>]*class=["'][^"']*theme-doc-markdown[^"']*["'][\s\S]*?>([\s\S]*?)<\/(?:div|article|section)>/i,
  },
  { name: 'docusaurus', regex: /<[^>]*id=["']__docusaurus["'][\s\S]*?>([\s\S]*?)<\/div>/i },
  {
    name: 'prose',
    regex: /<[^>]*class=["'][^"']*\bprose\b[^"']*["'][\s\S]*?>([\s\S]*?)<\/(?:div|article|section)>/i,
  },
];

function extractDomSelector(html: string): EmbeddedExtraction | null {
  for (const { regex } of DOM_CONTAINERS) {
    const match = html.match(regex);
    if (!match || !match[1]) continue;
    const parsed = parseHtmlPage(match[1]);
    if (parsed.wordCount >= MIN_MEANINGFUL_WORDS) {
      // Keep the container title only if it found one; otherwise defer to raw.
      return { ...toParsedShape(parsed), title: '', method: 'dom_selector' };
    }
  }
  return null;
}

/**
 * Attempt to recover real content from an HTML shell. Returns the best tier
 * result whose wordCount clears the meaningful threshold, or null when nothing
 * beats a raw parse. The caller decides whether the recovery is richer than
 * what it already has.
 */
export function extractEmbeddedContent(
  html: string,
  _url: string
): EmbeddedExtraction | null {
  if (!html) return null;

  const tiers: (() => EmbeddedExtraction | null)[] = [
    () => extractNextData(html),
    () => extractRscFlight(html),
    () => extractJsonLd(html),
    () => extractNoscript(html),
    () => extractDomSelector(html),
  ];

  for (const run of tiers) {
    let result: EmbeddedExtraction | null = null;
    try {
      result = run();
    } catch {
      result = null;
    }
    if (result && result.wordCount >= MIN_MEANINGFUL_WORDS) {
      return result;
    }
  }
  return null;
}
