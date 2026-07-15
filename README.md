# Glintscanner

**Agent readiness scanner** for developer products.

Analyze whether AI coding agents (Cursor, Claude Code, Copilot, …) can discover, parse, and complete integration journeys against your docs ecosystem — then get a versioned **Agent Readiness Score (ARS)**.

- **Hosted:** [scan.glintbase.dev](https://scan.glintbase.dev)  
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
