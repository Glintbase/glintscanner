/**
 * Turns a fetched page into what the Simulate planner reads (title, headings, same-site links,
 * visible text), and checks answer quotes against the text that was actually fetched.
 * Pure functions, no network.
 */

export interface PageLink {
  path: string;
  text: string;
}

export interface PageOutline {
  title: string;
  headings: string[];
  links: PageLink[];
  /** Visible text, tags and scripts removed, whitespace collapsed. */
  text: string;
}

const MAX_TEXT = 200_000;
const ASSET_RE = /\.(css|js|mjs|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf|mp4|webm|pdf|zip)$/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : ' ';
    });
}

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function samePath(href: string, pageUrl: string): string | null {
  try {
    const base = new URL(pageUrl);
    const u = new URL(href, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (u.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) return null;
    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (ASSET_RE.test(path) || path.length > 120) return null;
    return path;
  } catch {
    return null;
  }
}

export function looksLikeHtml(body: string): boolean {
  return /<(!doctype html|html|head|body|div|p|a)\b/i.test(body.slice(0, 5000));
}

export function outlinePage(body: string, pageUrl: string): PageOutline {
  const raw = body || '';
  const links = new Map<string, string>();
  const addLink = (href: string, text: string) => {
    const path = samePath(href, pageUrl);
    if (!path || links.has(path) || links.size >= 80) return;
    links.set(path, text.slice(0, 60));
  };

  if (!looksLikeHtml(raw)) {
    // Plain text, markdown (llms.txt, .md) or JSON.
    for (const m of raw.matchAll(/\[([^\]]{0,80})\]\(([^)\s]+)\)/g)) addLink(m[2], m[1]);
    for (const m of raw.matchAll(/https?:\/\/[^\s)"'<>]+/g)) addLink(m[0], '');
    const titleLine = raw.match(/^#\s+(.+)$/m);
    const headings = [...raw.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1].trim().slice(0, 120)).slice(0, 20);
    return {
      title: titleLine ? titleLine[1].trim() : '',
      headings,
      links: [...links].map(([path, text]) => ({ path, text })),
      text: raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT),
    };
  }

  const html = raw.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ');
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const headings = [...html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => stripTags(m[2]).slice(0, 120))
    .filter(Boolean)
    .slice(0, 20);
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    addLink(m[1].trim(), stripTags(m[2]));
  }
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  return {
    title: titleMatch ? stripTags(titleMatch[1]) : '',
    headings,
    links: [...links].map(([path, text]) => ({ path, text })),
    text: stripTags(bodyMatch ? bodyMatch[1] : html).slice(0, MAX_TEXT),
  };
}

const STOP = new Set([
  'what', 'which', 'where', 'when', 'with', 'from', 'that', 'this', 'there', 'their', 'have', 'does', 'find',
  'show', 'tell', 'about', 'into', 'your', 'please', 'developer', "i'm", 'them', 'they', 'will', 'would',
  'could', 'should', 'how', 'the', 'and', 'for',
]);

/** Intent words as rough stems, so "authenticate" also matches "authentication". */
export function intentKeywords(intent: string): string[] {
  const words = (intent.toLowerCase().match(/[a-z0-9][a-z0-9._-]{2,}/g) || []).filter((w) => !STOP.has(w));
  return [...new Set(words.map((w) => (w.length > 6 ? w.slice(0, w.length - 2) : w)))];
}

/** The most intent-relevant passages of a page, so the answer step stays within a small budget. */
export function relevantPassages(text: string, intent: string, maxPassages = 2, size = 600): string[] {
  if (!text) return [];
  const keys = intentKeywords(intent);
  const chunks: Array<{ s: string; score: number; i: number }> = [];
  for (let i = 0, n = 0; i < text.length && n < 400; i += Math.floor(size * 0.75), n++) {
    const s = text.slice(i, i + size);
    const lower = s.toLowerCase();
    const score = keys.reduce((acc, k) => acc + (lower.includes(k) ? 1 : 0), 0);
    chunks.push({ s, score, i });
  }
  const top = chunks
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, maxPassages);
  return (top.length ? top : chunks.slice(0, 1)).sort((a, b) => a.i - b.i).map((c) => c.s.trim());
}

const normalise = (s: string) =>
  decodeEntities(s)
    .toLowerCase()
    .replace(/[‘’“”"'`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** True when the quote (at least 15 characters) appears in the fetched text. */
export function quoteAppearsIn(quote: string, text: string): boolean {
  const q = normalise(quote || '');
  if (q.length < 15) return false;
  return normalise(text || '').includes(q);
}
