<div align="center">

<!-- Drop your banner in assets/banner.png (recommended ~1500x500) -->
<img src="https://raw.githubusercontent.com/Glintbase/.github/main/assets/banner.png" alt="Glintbase — Agent Readiness Infrastructure" width="100%" />


# Glintscanner

**Agent readiness scanner** for developer products.

Analyze whether AI coding agents (Cursor, Claude Code, Copilot, …) can discover, parse, and complete integration journeys against your docs ecosystem — then get a versioned **Agent Readiness Score (ARS)**.

- **Hosted:** [scan.glintbase.dev](https://scan.glintbase.dev)  
- **Resources:** [Developer Tools hub](https://scan.glintbase.dev/tools) · [MCP gateway](https://scan.glintbase.dev/mcp) · in-repo [`skills/`](./skills) agent skill  
- **Methodology:** [docs/methodology/ars-1.0.md](./docs/methodology/ars-1.0.md)  
- **Roadmap / specs:** [docs/](./docs/)

## Features

- **Surface discovery** — llms.txt, OpenAPI, MCP, sitemap, docs, GitHub, SDK, …
- **Content validation** — empty/HTML soft-404s don’t max machine scores
- **Budgeted crawl** — priority seeds, dual HTML/Markdown parse, link expansion
- **Knowledge graph** — pages, concepts, operations, evidence-backed edges
- **Deterministic pathfinder** — multi-start agent journeys (not LLM free-form scoring)
- **ARS 1.0** — weighted, versioned, anti-gaming composite score
- **CLI** — JSON/Markdown reports for CI and shareable output

## Web vs CLI vs MCP — which should I use?

All three surfaces run the **same scanner core** ([`runScan`](./src/lib/scanner/core/runScan.ts) / the shared `v2` pipeline). They differ in **who supplies the AI reasoning**, **how page content is extracted**, and **how results are delivered** — which is why *the same URL can score differently* depending on the surface and profile you choose.

| | **Web** — [scan.glintbase.dev](https://scan.glintbase.dev) | **CLI** — `@glintbase/cli` | **MCP** — `@glintbase/mcp` |
|---|---|---|---|
| **Best for** | One-click hosted scan, sharing, leaderboard | Local runs + CI gates | Driving from inside a coding agent |
| **Setup** | None (hosted) | `npm i -g`, optional `init` wizard | Zero-config — no `.env`, no keys |
| **Journey engine** | Deterministic (`quick`) · **LLM Multi-Agent Harness auto-on for `deep`** | Deterministic · **`--agent` opts into the harness** | **Always deterministic** — the calling agent *is* the reasoning layer |
| **LLM provider / cost** | Hosted (Google/Gemini), paid by us | **Yours** — cloud key or local model (Ollama / LM Studio) | None — your agent already reasons over the JSON |
| **Content extraction** | Raw HTML + **Firecrawl** (if key set) | Raw HTML + **Firecrawl** (if key set) | Raw HTML + zero-dep **`deep_crawl`** embedded extraction; Firecrawl optional |
| **Crawl budget** | `quick` 15 / `deep` 50 pages | `quick` 15 / `deep` 50 pages | `quick` 15 / `deep` 50 pages |
| **Granularity** | Full pipeline, one call | Full pipeline, one call | **9 composable tools** over a cached session |
| **Output** | Interactive UI, graph viz, saved report, badge | Terminal + JSON/Markdown, exit codes | Structured JSON per tool |
| **Persistence** | Supabase (history, leaderboard) | Local files | In-memory session (+ file cache) |

### Why the same site can score differently

The most common surprise is that a **hosted `deep` scan and a default MCP scan disagree** (e.g. 80% vs 30% journey pass rate on a JS-heavy site like Vercel). Both are correct for their configuration — they simply run different engines:

- **Hosted `deep`** = Firecrawl-cleaned content **+** the LLM Multi-Agent Harness actually executing tool-use journeys. Highest fidelity, highest cost.
- **MCP default** = raw-HTML crawl **+** deterministic pathfinder. Fast and free, but a JS-rendered docs site returns a near-empty shell over raw HTTP, so journeys fail and the score drops.

To make an MCP run comparable to the hosted deep scan:

1. Call **`deep_crawl`** first (recovers JS-rendered content with **no API key**), *then* `score_readiness` — it reuses the recovered pages already in the session.
2. Or set `FIRECRAWL_API_KEY` in the MCP `env` **and** pass `profile: "deep"`.
3. The agent driving the MCP supplies the LLM reasoning that the hosted harness provides automatically — have it interpret `run_journeys` / `get_remediation` output rather than expecting the server to reason.

## Quick start (web)

```bash
npm install
cp .env.local.example .env.local
# Optional: FIRECRAWL_API_KEY, Supabase, Upstash Redis
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## CLI

```bash
npm install
npm run glintscan -- https://docs.example.com
npm run glintscan -- https://docs.example.com --json
npm run glintscan -- https://docs.example.com --markdown --fail-under 70
npm run glintscan -- --score-version
```

Or after install: `npx glintscan <url>` (via `bin/glintscan.mjs`).

| Exit code | Meaning |
|-----------|---------|  
| 0 | Success |
| 1 | Scan failed |
| 2 | Invalid URL / SSRF blocked |
| 3 | Score below `--fail-under` |

## MCP Server (`@glintbase/mcp`)

Zero-config scanner tools for AI coding agents. No API keys, no `.env` — the agent reasons over results using its own subscription.

### Setup

**Claude Code** (`.mcp.json`):
```json
{
  "mcpServers": {
    "glintbase": {
      "command": "npx",
      "args": ["-y", "@glintbase/mcp"]
    }
  }
}
```

**Cursor / Windsurf** (Settings → MCP):
```json
{
  "glintbase": {
    "command": "npx",
    "args": ["-y", "@glintbase/mcp"]
  }
}
```

**Local dev:**
```bash
cd mcp && npm install && npm run dev
```

**Optional: Firecrawl for better content extraction**

The MCP works zero-config with raw HTML parsing, but for JS-heavy docs sites (Vercel, Next.js, etc.), a Firecrawl API key significantly improves content extraction and journey pass rates:

```json
{
  "mcpServers": {
    "glintbase": {
      "command": "npx",
      "args": ["-y", "@glintbase/mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-your-key-here"
      }
    }
  }
}
```

Free tier at [firecrawl.dev](https://firecrawl.dev) includes 500 credits/month. For comparable results to the hosted scanner at scan.glintbase.dev, also pass `profile: "deep"` when calling `score_readiness` (crawls 50 pages instead of 15).

Even without a Firecrawl key, the `deep_crawl` tool recovers most JS-rendered content by extracting the framework payloads embedded in the HTML (Next.js `__NEXT_DATA__`, App Router RSC flight chunks, JSON-LD, `<noscript>`). Prefer it over `crawl_pages` for SPA/Next.js docs sites.

### Available tools

| Tool | Description |
|------|-------------|
| `discover_surfaces` | Find all machine-readable entrypoints (llms.txt, OpenAPI, MCP, docs, …) |
| `check_reachability` | Quick single-URL reachability + soft-404 detection |
| `parse_spec` | Parse OpenAPI / llms.txt / MCP configs without crawling |
| `crawl_pages` | Budgeted crawl with priority queue (quick/deep profiles) |
| `deep_crawl` | In-depth crawl that recovers JS-rendered content (Next.js `__NEXT_DATA__`, App Router RSC, JSON-LD, `<noscript>`, main-content) with no API key |
| `build_knowledge_graph` | Semantic graph from crawled pages |
| `run_journeys` | Deterministic agent journey simulations (no LLM) |
| `score_readiness` | Full pipeline → composite ARS score (auto-runs missing stages) |
| `get_remediation` | Prioritized fixes with templates and expected score impact |

### Example agent flow

```
User: "Scan docs.stripe.com for agent readiness"
Agent: calls discover_surfaces → crawl_pages → score_readiness → get_remediation
Agent: "Score: 82/100 (AI-Friendly). Top fix: add llms.txt with quickstart links."
```

## Standalone CLI (`@glintbase/cli`)

Beautiful terminal output, CI integration, local model support.

### Install

```bash
npm install -g @glintbase/cli
# or
npx @glintbase/cli scan https://docs.example.com
```

### Commands

```bash
glintbase init              # Interactive setup wizard (30 seconds)
glintbase scan <url>        # Run full scan with progress spinners
glintbase scan <url> --json # JSON output for CI/jq
glintbase scan <url> --fail-under 70  # Exit 3 if below threshold
glintbase config list       # Show resolved configuration
glintbase report <file>     # Re-format a saved result
```

### Local models (Ollama / LM Studio)

```bash
glintbase init
# Select "Ollama" → auto-detects models at localhost:11434
glintbase scan https://docs.example.com --agent
```

### CI integration (GitHub Actions)

```yaml
- name: Agent Readiness Gate
  run: npx @glintbase/cli scan https://docs.example.com --fail-under 70 --quiet
```

## Programmatic API

```ts
import { runScan, formatScanMarkdown, ARS_VERSION } from './src/lib/scanner/core';

const result = await runScan(
  { url: 'https://docs.example.com', options: { profile: 'quick' } },
  { onProgress: (e) => console.error(e) }
);

console.log(result.score, result.score_version); // e.g. 74, ars-1.0.0
console.log(formatScanMarkdown(result));
```

`runScan` has **no** Next.js or Supabase dependency — suitable for offline tooling and a future `@glintbase/scanner-core` package.

## Environment

See [`.env.local.example`](./.env.local.example).

| Variable | Required | Purpose |
|----------|----------|---------|
| `FIRECRAWL_API_KEY` | No | Cleaner markdown scrape |
| `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` | No | Persist scans / leaderboard |
| `UPSTASH_REDIS_*` | Prod recommended | Distributed rate limits |
| `ALLOW_HTTP` | No | Allow `http://` targets (dev) |
| `SCAN_MAX_PAGES` / `SCAN_MAX_DURATION_MS` | No | Crawl budgets |
| `PATHFINDER_BEAM_WIDTH` | No | Beam search (default 1 = greedy) |

Apply DB schema updates from [`migration.sql`](./migration.sql) in Supabase SQL editor when using persistence.

## Score bands (ARS 1.0)

| Score | Band |
|------:|------|
| 90–100 | Elite Agent-Native |
| 70–89 | AI-Friendly |
| 40–69 | AI-Capable |
| 0–39 | Legacy Ecosystem |

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the pipeline diagram and module map.

```
URL → discover → classify → crawl → graph → pathfinder → ARS
```

## Tests & CI

```bash
npm test
npm run typecheck
npm run lint
```

GitHub Actions runs test + typecheck on PRs (`.github/workflows/ci.yml`).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Spec-driven: update `docs/specs/*` when changing behavior.

## Security

See [SECURITY.md](./SECURITY.md). Report vulnerabilities privately — not as public score disputes.

## License

[Apache License 2.0](./LICENSE)

---

Built by [Glintbase](https://glintbase.dev) · Infrastructure for AI-agent-ready repositories
