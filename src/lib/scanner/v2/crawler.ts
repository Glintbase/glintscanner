import { ExtractedPage, DiscoveredSurface } from './types';
import { parseMarkdownPage, parseHtmlPage, detectContentKind } from './parseContent';
import { fetchResource } from './fetchResource';
import { sortUrlsByPriority, resolveBudget, type CrawlBudget } from './priority';
import { expandSitemapUrls } from './sitemap';
import { isContentSuspicious } from './strategies/interface';
import { DocsStrategy } from './strategies/docs';
import { GenericStrategy } from './strategies/generic';
import { BlogStrategy } from './strategies/blog';
import { ProductStrategy } from './strategies/product';
import { RepoStrategy } from './strategies/repo';
import { Classifier } from './classifier';

export interface CrawlOptions {
  /** Original user-submitted URL — always seeded */
  seedUrl?: string;
  profile?: 'quick' | 'deep';
  budget?: Partial<CrawlBudget>;
}

function sameHost(a: string, b: string): boolean {
  try {
    const ha = new URL(a).hostname.replace(/^www\./, '');
    const hb = new URL(b).hostname.replace(/^www\./, '');
    return ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`);
  } catch {
    return false;
  }
}

async function scrapePage(
  url: string,
  maxBytes: number
): Promise<ExtractedPage> {
  try {
    // Optional Firecrawl markdown
    if (process.env.FIRECRAWL_API_KEY) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          },
          signal: controller.signal,
          body: JSON.stringify({ url, formats: ['markdown'] }),
        });
        const scrapeResult = await res.json();
        if (scrapeResult.success && scrapeResult.data) {
          const md = scrapeResult.data.markdown || '';
          const fallbackTitle = scrapeResult.data.metadata?.title || url;
          const parsed = parseMarkdownPage(md, fallbackTitle);
          const needsRender = isContentSuspicious(md, parsed.wordCount, 'docs');
          return {
            url,
            title: parsed.title,
            headings: parsed.headings,
            codeBlocks: parsed.codeBlocks,
            wordCount: parsed.wordCount,
            html: md,
            contentKind: 'markdown',
            fetchStatus: 'ok',
            needsRender,
          };
        }
      } catch {
        /* fall through to local fetch */
      } finally {
        clearTimeout(id);
      }
    }

    const result = await fetchResource(url, { timeoutMs: 8000, maxBytes });
    if (!result.ok || !result.body) {
      return {
        url,
        title: 'Failed to Crawl',
        headings: [],
        codeBlocks: [],
        wordCount: 0,
        contentKind: 'html',
        fetchStatus:
          result.status === 'timeout'
            ? 'timeout'
            : result.status === 'empty'
              ? 'empty'
              : result.status === 'too_large'
                ? 'failed'
                : 'failed',
      };
    }

    const kind = detectContentKind(result.body);
    const parsed =
      kind === 'markdown'
        ? parseMarkdownPage(result.body, url)
        : parseHtmlPage(result.body, url);

    const needsRender = isContentSuspicious(result.body, parsed.wordCount, 'docs');

    return {
      url: result.finalUrl || url,
      title: parsed.title,
      headings: parsed.headings,
      codeBlocks: parsed.codeBlocks,
      wordCount: parsed.wordCount,
      html: result.body,
      contentKind: kind,
      fetchStatus: needsRender ? 'ok' : 'ok',
      needsRender,
    };
  } catch (err: any) {
    console.error(`Page scrape error for ${url}:`, err?.message);
    return {
      url,
      title: 'Failed to Crawl',
      headings: [],
      codeBlocks: [],
      wordCount: 0,
      contentKind: 'html',
      fetchStatus: 'failed',
    };
  }
}

function collectExpansionUrls(page: ExtractedPage, seedHostUrl: string): string[] {
  if (!page.html || page.title === 'Failed to Crawl') return [];
  const classifier = new Classifier();
  // Sync heuristic only
  const signals = classifier.classifyHeuristics(page.url, page.html);
  let best = 'generic';
  let conf = 0;
  for (const s of signals) {
    if (s.confidence > conf && s.confidence >= 0.6) {
      conf = s.confidence;
      best = s.strategy_type;
    }
  }

  const strategies: Record<string, { get_next_urls: (u: string, c: string) => string[] | Promise<string[]> }> = {
    generic: new GenericStrategy(),
    docs: new DocsStrategy(),
    blog: new BlogStrategy(),
    product: new ProductStrategy(),
    repo: new RepoStrategy(),
  };

  const strategy = strategies[best] || strategies.generic;
  const next = strategy.get_next_urls(page.url, page.html);
  const list = Array.isArray(next) ? next : [];
  return list.filter((u) => sameHost(u, seedHostUrl));
}

export async function crawlEcosystem(
  surfaces: DiscoveredSurface[],
  progressCallback?: (log: any) => void,
  options: CrawlOptions = {}
): Promise<ExtractedPage[]> {
  const emitProgress = (check: string, status: string, message?: string) => {
    progressCallback?.({ type: 'progress', check, status, message });
  };

  const budget = { ...resolveBudget(options.profile), ...options.budget };
  const started = Date.now();

  emitProgress('crawling', 'running', `Initiating crawl (budget: ${budget.maxPages} pages, ${budget.maxDurationMs}ms)...`);

  const seedCandidates: string[] = [];

  // 1. Always seed user URL
  if (options.seedUrl) {
    try {
      const u = options.seedUrl.startsWith('http') ? options.seedUrl : `https://${options.seedUrl}`;
      seedCandidates.push(u);
    } catch {
      /* ignore */
    }
  }

  // 2. Origin / landing
  const landing = surfaces.find((s) => s.type === 'landing' && s.found);
  if (landing) seedCandidates.push(landing.url);

  // 3. Found human/docs surfaces
  for (const s of surfaces) {
    if (
      s.found &&
      s.status !== 'skipped' &&
      !s.url.includes('-missing') &&
      s.type !== 'sitemap'
    ) {
      seedCandidates.push(s.url);
    }
  }

  // 4. Sitemap expansion (nested indexes)
  const sitemapSurface = surfaces.find((s) => s.type === 'sitemap' && s.found);
  if (sitemapSurface) {
    try {
      emitProgress('crawling', 'running', 'Expanding sitemap (including nested indexes)...');
      const locs = await expandSitemapUrls(sitemapSurface.url, {
        maxDepth: 2,
        maxUrls: 200,
      });
      seedCandidates.push(...locs);
    } catch (err) {
      console.error('Sitemap expansion error:', err);
    }
  }

  const hostAnchor = options.seedUrl || surfaces.find((s) => s.found)?.url || seedCandidates[0] || '';

  // Dedupe + same-host filter when we have an anchor
  let unique = Array.from(new Set(seedCandidates.filter(Boolean)));
  if (hostAnchor) {
    unique = unique.filter((u) => {
      try {
        return sameHost(u, hostAnchor);
      } catch {
        return true;
      }
    });
  }

  const queue = sortUrlsByPriority(unique);
  const visited = new Set<string>();
  const corpus: ExtractedPage[] = [];

  if (queue.length === 0) {
    emitProgress('crawling', 'done', 'No crawlable surfaces discovered.');
    return [];
  }

  emitProgress(
    'crawling',
    'running',
    `Seeded ${queue.length} URLs. Crawling up to ${budget.maxPages} pages...`
  );

  let qi = 0;
  while (corpus.length < budget.maxPages && qi < queue.length) {
    if (Date.now() - started > budget.maxDurationMs) {
      emitProgress('crawling', 'warn', 'Crawl time budget exhausted; continuing with partial corpus.');
      break;
    }

    const url = queue[qi++];
    if (visited.has(url)) continue;
    visited.add(url);

    emitProgress(
      'crawling',
      'running',
      `Crawling page ${corpus.length + 1}/${budget.maxPages}: ${url}...`
    );

    const page = await scrapePage(url, budget.maxBytesPerResource);
    corpus.push(page);

    // Expansion via strategy get_next_urls
    if (page.fetchStatus === 'ok' && page.html && hostAnchor) {
      try {
        const expanded = collectExpansionUrls(page, hostAnchor);
        for (const next of sortUrlsByPriority(expanded)) {
          if (!visited.has(next) && !queue.includes(next)) {
            queue.push(next);
          }
        }
        // Re-sort remaining unvisited portion lightly by appending sorted new only
      } catch {
        /* expansion best-effort */
      }
    }
  }

  // Re-prioritize any remaining queue is not needed — we process FIFO after initial sort + append

  const okCount = corpus.filter((p) => p.fetchStatus === 'ok').length;
  emitProgress(
    'crawling',
    'done',
    `Crawl complete: ${okCount}/${corpus.length} pages ok (${visited.size} fetched, ${queue.length} queued).`
  );

  return corpus;
}
