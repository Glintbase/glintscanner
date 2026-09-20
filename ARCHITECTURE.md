# Glintscanner Architecture

## Purpose

Glintscanner audits whether **AI coding agents** can discover, traverse, and act on a product’s developer ecosystem. It produces a versioned **Agent Readiness Score (ARS)**.

Hosted UI: Next.js app · Core logic: pure TypeScript pipeline · MCP: zero-config agent tools · CLI: `@glintbase/cli`

## Pipeline

```
URL
 │
 ├─ URL policy (SSRF / scheme / ports)
 ▼
1. Discovery       → surfaces (llms.txt, OpenAPI, MCP, docs, …) + content validation
2. Classification  → canonical / freshness metadata & framework detection
3. Crawl           → priority queue, budgets, dual HTML/MD parse, expansion
4. Knowledge graph → nodes/edges, evidence, OpenAPI operations, hyperlinks
5. Flight Simulator→ multi-agent autonomous journey simulation (Claude, Cursor, Perplexity)
6. ARS 3.0 Engine  → 119 checks, 6 pillars, dynamic denominator scoring
 │
 ▼
Stream events (web) · JSON/Markdown (CLI) · MCP tools (agents) · Flight Simulator Cockpit (#data=)
```

## Module map

| Path | Role |
|------|------|
| `src/lib/scanner/core/runScan.ts` | Single entrypoint for CLI + API |
| `src/lib/scanner/core/reportMarkdown.ts` | Shareable Markdown report |
| `src/lib/scanner/core/reachability.ts` | Standalone URL reachability check |
| `src/lib/scanner/core/parseSpec.ts` | Unified spec parser (OpenAPI, llms.txt, MCP) |
| `src/lib/scanner/v2/*` | Pipeline stages |
| `src/lib/scanner/v2/crawler.ts` | Priority-queue crawl; extraction-tier order: firecrawl -> raw -> embedded |
| `src/lib/scanner/v2/extractEmbedded.ts` | Zero-dep recovery of JS-rendered content (`__NEXT_DATA__`, RSC flight, JSON-LD, `<noscript>`, DOM selectors) |
| `src/lib/scanner/shared/*` | URL normalize, score bands |
| `src/app/api/scan/route.ts` | Streaming host + persistence |
| `src/app/api/mcp/route.ts` | Authoritative MCP endpoint (JSON-RPC 2.0 & SSE, 17 tools) |
| `src/app/api/simulate/route.ts` | Autonomous Flight Simulator REST endpoint |
| `src/app/tools/page.tsx` | Developer Tools hub (MCP / CLI / skill install) |
| `src/app/mcp/page.tsx` | MCP gateway — client config + tool catalog |
| `src/app/simulate/page.tsx` | Flight Simulator Replay Cockpit page |
| `src/components/scanner/*` | Report UI, graph, journeys, Cockpit, ARS 3.0 Live HUD |
| `skills/glintbase-agent-readiness/` | Distributable agent skill (SKILL.md + references) |
| `mcp/` | Standalone `@glintbase/mcp` package for local stdio usage |
| `mcp/src/session.ts` | In-memory scan session (tools build on each other) |
| `mcp/src/tools/*` | Tool implementations (discover, crawl, deep_crawl, graph, score, remediate) |
| `mcp/src/cache.ts` | File-based session cache (.glintbase/cache/) |
| `cli/` | Standalone CLI — terminal output, CI, local models |
| `cli/src/commands/*` | scan, init, config, report commands |
| `cli/src/providers.ts` | Provider resolution (Ollama, cloud, custom) |
| `cli/src/output/*` | Terminal (picocolors + ora) and JSON formatters |
| `docs/specs/*` | Behavioral contracts |
| `docs/methodology/ars-1.0.md` | Public scoring methodology |

## Data model (optional Supabase)

- `public_scans` — url, score, score_version, company_slug, is_latest, checks JSON
- `scan_nodes` / `scan_edges` — relational graph per scan

See `migration.sql`.

## Scoring integrity

- **One band table** via `scoreBand()` (90/70/40)
- **One composite** via `calculateARS()` 
- Journey UI must use pathfinder traces (SPEC-08)
- Synthetic graph nodes cannot satisfy journey goals

## Security posture

- SSRF denylist before and during fetch
- Rate limits on `/api/scan`
- Service role key server-only
- See `SECURITY.md`

## Packaging

Shared core, two thin front-ends:

```
src/lib/scanner/     ← scanner-core (imported by both)
├── mcp/             ← @glintbase/mcp (zero-config MCP tools)
└── cli/             ← @glintbase/cli (terminal + CI)
```

Both bundle scanner-core via tsup at build time. No runtime dependency on the Next.js app.

## Semver policy

| Change | Version impact |
|--------|----------------|
| ARS weight/band break | Bump `score_version` string; document methodology |
| `runScan` result shape break | Major (when published as npm package) |
| New optional fields | Minor |
| Bugfixes | Patch |
