# SPEC-03 — Crawl Engine

**Status:** draft  
**Phase:** 1  
**Related tasks:** T1.01–T1.14, T0.12  

## 1. Purpose

Build a bounded, prioritized corpus of pages and machine-readable specs for graph + pathfinder.

## 2. Content model

```ts
type ContentKind = 'html' | 'markdown' | 'openapi' | 'llms' | 'unknown';

type FetchStatus =
  | 'ok'
  | 'unreachable'
  | 'timeout'
  | 'blocked'
  | 'soft_404'
  | 'empty'
  | 'too_large'
  | 'invalid_spec'
  | 'needs_render';

interface ExtractedPage {
  url: string;
  title: string;
  headings: string[];
  codeBlocks: { lang: string; code: string }[];
  wordCount: number;
  contentKind: ContentKind;
  fetchStatus: FetchStatus;
  contentHash: string;
  /** Raw body only in-memory during scan; never persist */
  body?: string;
  needsRender?: boolean;
}
```

### Invariant

`body` field MUST NOT be written to Supabase.  
`html` overload for markdown is **forbidden** after T0.12.

## 3. Pipeline

```
seeds → priority queue → fetchResource → parse by content-type
      → strategy.get_next_urls → re-queue (budget)
```

### Seeds (ordered)

1. User input URL  
2. Origin `/` (landing)  
3. All `found` human/docs surfaces  
4. Sitemap `<loc>` values (expanded indexes, depth ≤ 2)  
5. llms.txt outbound links (same host)  

### Priority score (higher first)

| Signal in URL/path | Weight |
|--------------------|--------|
| quickstart, getting-started | +10 |
| install, setup, onboard | +8 |
| auth, oauth, api-key, token | +8 |
| webhook | +7 |
| api, reference, endpoint | +6 |
| error, troubleshoot | +5 |
| docs | +3 |
| changelog | +1 |

Deterministic: stable sort by score desc, then URL asc.

## 4. Budgets

See SPEC-01 defaults. When budget hit:

- Stop expansion  
- Emit progress `crawling` / `done` with partial corpus  
- Scan continues to graph/pathfinder on partial data  

## 5. Parsers

| Kind | Extract |
|------|---------|
| html | title, h1–h3, pre/code, wordCount, same-host hrefs |
| markdown | title (first H1 or meta), ATX headings, fenced code |
| openapi | operations list (side channel, not always ExtractedPage) |
| llms | sections, links |

Strategies MUST accept both html and markdown (Phase 0 dual parse).

## 6. Firecrawl adapter

- Optional: if `FIRECRAWL_API_KEY` set, prefer markdown scrape  
- On failure, fall back to local fetch  
- Result `contentKind: 'markdown'`  

## 7. Acceptance criteria

| ID | Criterion |
|----|-----------|
| AC-03.1 | User URL always in crawl set if fetch ok |
| AC-03.2 | maxPages respected |
| AC-03.3 | Markdown fixture yields headings + code |
| AC-03.4 | get_next_urls contributes ≥1 expansion on good fixture |
| AC-03.5 | Unit tests offline |

## 8. Non-goals

- Full browser automation (Playwright = Phase 7)  
- Cross-domain crawl (same registrable domain optional later)  
