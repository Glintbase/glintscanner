# Tool sequences

Glintbase MCP exposes granular, composable tools that share a cached **session**. Most tools auto-run any missing upstream stages, but calling them in the right order avoids wasted work and produces the most accurate score.

## The golden path

```
discover_surfaces  ->  deep_crawl  ->  score_readiness  ->  get_remediation
```

Why this order:

1. **`discover_surfaces`** seeds the session with the machine-readable entrypoints (llms.txt, OpenAPI, MCP config, sitemap, docs root, GitHub, SDK). Everything downstream depends on knowing the surfaces.
2. **`deep_crawl`** fetches and parses pages, and for thin / JS-rendered pages it recovers the real content that the framework ships embedded in the HTML. It writes the recovered pages into the session.
3. **`score_readiness`** builds the graph, runs deterministic journeys, and computes the composite ARS. Because `deep_crawl` already populated `session.pages`, the score step **skips re-crawling** and scores the recovered content.
4. **`get_remediation`** turns the gaps into prioritized, templated fixes with expected score impact.

## crawl_pages vs deep_crawl

| | `crawl_pages` | `deep_crawl` |
|---|---|---|
| Best for | Static / server-rendered docs (Markdown sites, classic HTML) | JS-rendered docs (Next.js, Docusaurus, Nextra, SPA shells) |
| Extraction | Raw HTML + dual HTML/Markdown parse | Raw HTML **plus** zero-dependency embedded-data recovery |
| Recovers from | Pages whose content is present in the initial HTML | `__NEXT_DATA__`, App Router RSC flight chunks, JSON-LD, `<noscript>`, main-content containers |
| API key | none | none |
| Default budget | quick 15 / deep 50 pages | deep profile (more pages, longer budget) |

**Rule of thumb:** if a site is modern and content comes back thin, or `crawl_pages` reports `needsRender: true`, switch to `deep_crawl`. When unsure, prefer `deep_crawl` — it degrades gracefully to raw extraction on static sites.

Each recovered page reports an `extractionMethod` (`raw`, `next_data`, `rsc_flight`, `json_ld`, `noscript`, `dom_selector`, `firecrawl`) plus a `recovery` summary (how many pages were rescued from thin shells, and how many still need rendering) so the crawl is auditable.

## Session reuse and resets

- The session caches surfaces, framework, pages, graph, journeys, and score across tool calls, and is persisted to a file cache for fast re-runs on the same URL.
- Passing a **new `url`** to a tool resets the session for that URL.
- To force a fresh crawl (for example, after the site changed), re-run `deep_crawl`/`crawl_pages`; it overwrites `session.pages`.

## Targeted (non-scoring) calls

You do not always need the full pipeline:
- **`check_reachability`** — one URL, is it live and not a soft-404? Fast pre-flight.
- **`parse_spec`** — parse an OpenAPI / llms.txt / MCP config directly without crawling the whole site.
- **`build_knowledge_graph`** / **`run_journeys`** — run a single stage when you want to inspect graph connectivity or journey completion in isolation.
