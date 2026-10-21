<div align="center">

<!-- Drop your banner in assets/banner.png (recommended ~1500x500) -->
<img src="https://raw.githubusercontent.com/Glintbase/.github/main/assets/banner.png" alt="Glintbase — Agent Readiness Infrastructure" width="100%" />
</div>

# Glintscanner

**Agent Readiness Scanner & Flight Simulator** for developer products.

[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg)](LICENSE)
[![CI](https://github.com/Glintbase/glintscanner/actions/workflows/ci.yml/badge.svg)](https://github.com/Glintbase/glintscanner/actions/workflows/ci.yml)
[![npm @glintbase/mcp](https://img.shields.io/npm/v/@glintbase/mcp.svg?color=cb3837&label=@glintbase/mcp)](https://www.npmjs.com/package/@glintbase/mcp)
[![Smithery Badge](https://smithery.ai/badge/@glintbase/mcp)](https://smithery.ai/server/@glintbase/mcp)
[![Glama](https://glama.ai/mcp/servers/Glintbase/glintscanner/badges/score.svg)](https://glama.ai/mcp/servers/Glintbase/glintscanner)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org)

Analyze whether AI coding agents (Cursor, Claude Code, Copilot, …) can discover, parse, and complete integration journeys against your docs ecosystem — then get a versioned **Agent Readiness Score (ARS 3.0)** and test your APIs inside the **Autonomous Flight Simulator**.

- **Hosted:** [scan.glintbase.dev](https://scan.glintbase.dev)  
- **Flight Simulator Cockpit:** [scan.glintbase.dev/simulate](https://scan.glintbase.dev/simulate)
- **Resources:** [Developer Tools hub](https://scan.glintbase.dev/tools) · [MCP gateway](https://scan.glintbase.dev/mcp) · in-repo [`skills/`](./skills) agent skill  
- **Methodology:** [docs/methodology/ars-3.2.md](./docs/methodology/ars-3.2.md)  
- **Roadmap / specs:** [docs/](./docs/)

## Features

- **Surface discovery** — `llms.txt`, `OpenAPI`, `MCP`, `sitemap.xml`, `auth.md`, `ard.json`, `robots.txt`
- **Content validation** — empty/HTML soft-404s don’t max machine scores
- **ARS 3.x probe engine** — 129 registered checks across 4 layers (discovery, access, usability, payments) with Dynamic Denominator scoring. Checks that cannot be verified are reported as `skip`/`na` and excluded, never passed by assumption
- **Live MCP probing** — handshake (2026-07-28 + legacy wire forms), `tools/list`, schema and annotation inspection, error-channel canary, and a read-only call only on tools annotated `readOnlyHint: true`
- **OpenAPI inspection** — operationIds, request/error schemas, pagination, rate-limit headers, problem+json and more, read from the spec itself
- **Flight Simulator** — separate agent journey simulations with visual DAGs and state replay (`#data=`) at `/simulate`; not part of the ARS score
- **Authoritative MCP Endpoint** — `/api/mcp` supporting JSON-RPC 2.0 and Server-Sent Events (SSE)
- **CLI & Web** — Real-time telemetry, visual terminal graphs, shareable reports, and automated CI quality gates

## Web vs CLI vs MCP — which should I use?

All three surfaces score with the **same engine**: the ARS 3.x probes in [`src/lib/scanner/v2/probes`](./src/lib/scanner/v2/probes) (wrapped by [`runScan`](./src/lib/scanner/core/runScan.ts) for the web app and MCP). The engine is published as [`@glintbase/scanner-core`](./core), which the CLI depends on. The same URL gets the same score on each; they differ only in how results are delivered.

| | **Web** — [scan.glintbase.dev](https://scan.glintbase.dev) | **CLI** — [`@glintbase/cli`](https://github.com/athertech/glintbase-cli) | **MCP** — `@glintbase/mcp` |
|---|---|---|---|
| **Best for** | One-click hosted scan, sharing, leaderboard | Local runs + CI gates | Driving from inside a coding agent |
| **Setup** | None (hosted) | `npm i -g`, optional `init` wizard | Zero-config — no `.env`, no keys |
| **Scoring** | ARS 3.x probes (`runScan`) | ARS 3.x probes (`runArs3Probes` from `@glintbase/scanner-core`) | ARS 3.x probes (`score_readiness` calls `runScan`) |
| **Extra tools** | Flight Simulator (`/simulate`) | `audit` (URL or local codebase), `check`, `ci`, `mcp lint`, `fix`, `simulate` | Diagnostic crawl / graph / journey tools (not part of the score) |
| **Output** | Interactive UI, saved report, badge | Terminal + JSON/Markdown, exit codes | Structured JSON per tool |
| **Persistence** | Supabase (history, leaderboard) | Local files | In-memory session (+ file cache) |

The ARS 3.x engine is deterministic HTTP probing; it does not crawl pages or run an LLM.

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

Free tier at [firecrawl.dev](https://firecrawl.dev) includes 500 credits/month. Firecrawl only affects the diagnostic `crawl_pages` / `build_knowledge_graph` / `run_journeys` tools; `score_readiness` uses the same probe engine as scan.glintbase.dev and does not crawl.

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
| `score_readiness` | ARS 3.x score from the same probe engine as the web app and CLI |
| `get_remediation` | Prioritized fixes with templates and expected score impact |

### Example agent flow

```
User: "Scan docs.stripe.com for agent readiness"
Agent: calls discover_surfaces → score_readiness → get_remediation
Agent: "Score: 82/100 (AI-Friendly). Top fix: add llms.txt with quickstart links."
```

## CLI (`@glintbase/cli`)

The Glintbase CLI lives in its own repository: [athertech/glintbase-cli](https://github.com/athertech/glintbase-cli)
([npm](https://www.npmjs.com/package/@glintbase/cli)). From 3.3.0 it scores with `@glintbase/scanner-core`,
so a CLI audit and a scan on scan.glintbase.dev use the same ARS 3.2 rules.

```bash
npx @glintbase/cli audit https://docs.example.com            # ARS 3.2 audit
npx @glintbase/cli audit https://docs.example.com --fail-under 70
npx @glintbase/cli mcp lint https://api.example.com/api/mcp   # MCP server lint
```

See the CLI README for local codebase audits, CI gates and the bundled MCP server.

## Programmatic API (`@glintbase/scanner-core`)

The engine is published as [`@glintbase/scanner-core`](./core) (built from `core/`, which bundles
`src/lib/scanner` with tsup; no runtime dependencies):

```ts
import { runArs3Probes, runScan, formatScanMarkdown } from '@glintbase/scanner-core';

const scorecard = await runArs3Probes('https://docs.example.com');
console.log(scorecard.score, scorecard.version, scorecard.evidence); // e.g. 74, ars-3.2.1

const result = await runScan(
  { url: 'https://docs.example.com', options: { profile: 'quick' } },
  { onProgress: (e) => console.error(e) }
);

console.log(result.score, result.score_version); // e.g. 74, ars-3.2.1
console.log(formatScanMarkdown(result));
```

`runScan` has **no** Next.js or Supabase dependency. Inside this repo you can also import it directly from `./src/lib/scanner/core`.

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

## Grades and bands (ARS 3.2)

Defined once in [`src/lib/scanner/shared/scoreBand.ts`](./src/lib/scanner/shared/scoreBand.ts); bands are groups of grades, so they always agree.

| Score | Grade | Band |
|------:|:-----:|------|
| 95–100 | A+ | Agent-Native |
| 86–94 | A | Agent-Native |
| 70–85 | B | AI-Friendly |
| 48–69 | C | AI-Capable |
| 28–47 | D | Legacy |
| 0–27 | F | Legacy |

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the pipeline diagram and module map.

```
Target URL → URL policy → Discover surfaces → ARS 3.x probes (discovery · access · usability · payments) → Score + remediations
```

## Tests & CI

```bash
npm test
npm run typecheck
npm run lint
```

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, tests, lint and a production build for the web app, and typecheck, tests and build for the CLI and MCP packages, on every push and PR to `main`. Unit tests run with network access blocked (`test/blockNetwork.ts`); set `ALLOW_NETWORK_TESTS=1` to allow it locally.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Spec-driven: update `docs/specs/*` when changing behavior.

## Security

See [SECURITY.md](./SECURITY.md). Report vulnerabilities privately — not as public score disputes.

## License

[Apache License 2.0](./LICENSE)

---

Built by [Glintbase](https://glintbase.dev) · Infrastructure for AI-agent-ready repositories
