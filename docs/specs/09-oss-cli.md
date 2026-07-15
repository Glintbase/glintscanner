# SPEC-09 — Open Source Packaging & CLI

**Status:** draft  
**Phase:** 6  
**Related tasks:** T6.01–T6.08  

## 1. Purpose

Ship a modular, self-hostable scanner core that developers can run locally and enterprises can audit—without requiring the hosted Next.js app or paid crawl APIs.

## 2. Package layout (target)

```
/
  apps/web/                    # Next.js host (current app migrates here)
  packages/scanner-core/       # pure TypeScript: discovery, crawl, graph, pathfinder, score
  packages/cli/                # glintscan CLI
  fixtures/                    # offline sites + golden expectations
  docs/
    IMPLEMENTATION_PLAN.md
    methodology/
    specs/
```

### Interim (allowed before monorepo)

```
src/lib/scanner/core/          # no Next.js / React imports
```

`scanner-core` MUST NOT import:

- `next/*`
- `react` / `react-dom`
- `@supabase/*` (persistence is a host adapter)
- browser-only modules

## 3. Core public API

```ts
// packages/scanner-core
export async function runScan(
  input: { url: string; options?: ScanOptions },
  hooks?: { onProgress?: (e: ScanStreamEvent) => void }
): Promise<ScanResult>;

export interface ScanResult {
  score: number;
  score_version: string;
  report: ScanReportPayload;
  duration_ms: number;
}
```

Optional adapters (injected, not required):

```ts
interface CrawlAdapters {
  fetchFn?: typeof fetch;
  firecrawl?: { scrape(url: string): Promise<MarkdownResult> };
}
```

## 4. CLI contract

```bash
npx glintscan <url> [options]

Options:
  --json              Full JSON report to stdout
  --markdown          Human + shareable markdown report
  --profile quick|deep
  --max-pages <n>
  --surfaces <csv>    enabled surface types
  --offline-fixture <path>   run against fixture root (CI)
  --score-version     print ARS version and exit
  -q, --quiet         errors only
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Scan failed (unreachable, internal) |
| 2 | Invalid args / SSRF blocked |
| 3 | Score below optional `--fail-under <n>` (CI gate) |

### Markdown report minimum sections

1. Score + band + `score_version`  
2. Surfaces table  
3. Journey results  
4. Top recommended fixes  
5. Link to methodology  

## 5. Repository hygiene (OSS drop)

| File | Required |
|------|----------|
| `LICENSE` | MIT or Apache-2.0 |
| `README.md` | Product + quickstart + architecture link |
| `CONTRIBUTING.md` | PR/test expectations |
| `SECURITY.md` | SSRF, disclosure, rate limits |
| `ARCHITECTURE.md` | Pipeline diagram + module map |
| `docs/methodology/ars-1.0.md` | Public scoring |

## 6. CI for OSS

```
lint → typecheck → unit → golden fixtures → build (web optional job)
```

Golden fixture job MUST run without network and without Firecrawl key.

## 7. Versioning

- `scanner-core`: semver; breaking score formula → major or explicit `score_version` bump documented  
- CLI depends on core; pin compatible range  
- Hosted app may lag CLI by one minor  

## 8. Acceptance criteria

| ID | Criterion |
|----|-----------|
| AC-09.1 | `scanner-core` builds with zero Next imports |
| AC-09.2 | CLI scans offline fixture without API keys |
| AC-09.3 | `--markdown` produces score + journeys |
| AC-09.4 | LICENSE + SECURITY + CONTRIBUTING present |
| AC-09.5 | Fresh clone: install, test, CLI fixture scan |

## 9. Non-goals

- npm publish automation on day one (document manual release)  
- GUI desktop app  
- Bundling Playwright by default  
