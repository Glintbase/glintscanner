/**
 * Sitemap parsing with nested sitemap index support (depth ≤ 2).
 */

import { fetchResource } from './fetchResource';

const LOC_RE = /<loc>\s*(https?:\/\/[^\s<]+)\s*<\/loc>/gi;

export function extractLocs(xml: string): string[] {
  const locs: string[] = [];
  let m;
  const re = new RegExp(LOC_RE.source, 'gi');
  while ((m = re.exec(xml)) !== null) {
    locs.push(m[1].trim());
  }
  return locs;
}

export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

/**
 * Expand a sitemap URL into page URLs.
 * Nested indexes expanded up to maxDepth (default 2).
 */
export async function expandSitemapUrls(
  sitemapUrl: string,
  options: { maxDepth?: number; maxUrls?: number; timeoutMs?: number } = {}
): Promise<string[]> {
  const maxDepth = options.maxDepth ?? 2;
  const maxUrls = options.maxUrls ?? 500;
  const timeoutMs = options.timeoutMs ?? 8000;
  const seen = new Set<string>();
  const pageUrls: string[] = [];

  async function walk(url: string, depth: number): Promise<void> {
    if (depth > maxDepth || pageUrls.length >= maxUrls) return;
    if (seen.has(url)) return;
    seen.add(url);

    const res = await fetchResource(url, { timeoutMs, maxBytes: 5_000_000 });
    if (!res.ok || !res.body) return;

    const locs = extractLocs(res.body);
    if (isSitemapIndex(res.body) && depth < maxDepth) {
      for (const child of locs) {
        if (pageUrls.length >= maxUrls) break;
        // Child sitemaps often end with .xml
        if (/\.xml(\?|$)/i.test(child) || child.includes('sitemap')) {
          await walk(child, depth + 1);
        } else {
          pageUrls.push(child);
        }
      }
    } else {
      for (const loc of locs) {
        if (pageUrls.length >= maxUrls) break;
        pageUrls.push(loc);
      }
    }
  }

  await walk(sitemapUrl, 0);
  return Array.from(new Set(pageUrls));
}
