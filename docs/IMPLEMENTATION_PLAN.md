# Glintscanner — Spec-Driven Implementation Plan

**Status:** Ready for execution  
**Version:** 1.0  
**Last updated:** 2026-07-15  
**Target outcomes:** Trustworthy public beta → industry-grade scanner → open-source ready → enterprise-credible  

**Docs index:** [docs/README.md](./README.md) · **Task checklist:** [docs/TASKS.md](./TASKS.md) · **All specs:** [docs/specs/](./specs/)

This plan turns the codebase audit (bugs, crawl/graph/journey gaps, scoring integrity) into an ordered, spec-driven delivery program. Every phase has:

- **Specs** (contracts, invariants, acceptance criteria)
- **Task list** (IDs, owners, dependencies, DoD)
- **PR boundaries** (mergeable increments)

---

## Table of contents

1. [North star & principles](#1-north-star--principles)
2. [Current-state defect registry](#2-current-state-defect-registry)
3. [Target architecture](#3-target-architecture)
4. [Spec index](#4-spec-index)
5. [Phase program](#5-phase-program)
6. [Master task list](#6-master-task-list)
7. [PR plan](#7-pr-plan)
8. [Test & fixture strategy](#8-test--fixture-strategy)
9. [Definition of done (program)](#9-definition-of-done-program)
10. [Risks & open decisions](#10-risks--open-decisions)
11. [Execution order (recommended)](#11-execution-order-recommended)

---

## 1. North star & principles

### 1.1 Product north star

> A **deterministic, evidence-based Agent Readiness Scanner** that discovers product surfaces, crawls documentation, builds a knowledge graph, simulates agent journeys, and produces a **versioned, reproducible score** — honest enough for open source, rigorous enough for enterprises, shareable enough for developers on X.

### 1.2 Engineering principles

| # | Principle | Rule |
|---|-----------|------|
| P1 | **Integrity over theater** | UI claims must match pipeline outputs. No fake journey checklists. |
| P2 | **Evidence over presence** | HTTP 200 alone never maxes a dimension; content must validate. |
| P3 | **Deterministic core** | Public leaderboard score is pure functions of inputs + `score_version`. |
| P4 | **Spec-driven** | No feature merges without acceptance criteria and types. |
| P5 | **Incremental PRs** | Each PR shippable; no big-bang rewrite of the web app. |
| P6 | **OSS-first core** | Crawl/graph/journey/score live in pure modules; Next.js is a host. |
| P7 | **Honest naming** | Call it “deterministic pathfinder” until an optional LLM probe exists. |

### 1.3 Non-goals (this program)

- Multi-tenant billing / Dodo payments wiring (defer until jobs + ARS 1.0)
- Full LLM-as-judge scoring on the public leaderboard
- Replacing the 3D graph UI aesthetics (keep; fix data fidelity underneath)
- Building a general-purpose web crawler product

---

## 2. Current-state defect registry

Each defect maps to tasks in §6. Severity: **C** critical, **H** high, **M** medium.

| ID | Sev | Summary | Primary files |
|----|-----|---------|---------------|
| C1 | C | ResultsReport “simulation” uses surface presence, not journeys | `ResultsReport.tsx` |
| C2 | C | Firecrawl markdown stored as `html`; strategies parse HTML only | `crawler.ts`, strategies |
| C3 | C | Legacy graph map drops `machine_entrypoint` / `support_path` | `graph.ts` |
| C4 | C | Journeys always start at `root:domain` | `journey.ts` |
| C5 | C | Dual scores + inconsistent bands (home vs report) | scoring, UI, discovery |
| H1 | H | Journey dep key typo `recover_from_setup_issue` | `journey.ts` |
| H2 | H | Semantic edges remapped to `page_references_page` | `graph.ts`, strategies |
| H3 | H | Machine surfaces “found” without content validation | `discovery.ts` |
| H4 | H | `landing` / `status` / `sdk` surfaces missing from discovery | `discovery.ts` |
| H5 | H | Strategy `get_next_urls` never used | `crawler.ts` |
| H6 | H | `isContentSuspicious` unused | `interface.ts`, crawler |
| H7 | H | User URL not always seeded as docs root | `discovery.ts` |
| H8 | H | `getScanBySlug` full-table scan + debug logs | `resolveSlug.ts` |
| H9 | H | Hard delete prior scan by URL (no history) | `api/scan/route.ts` |
| H10 | H | Sync request pipeline; no `maxDuration` / job status | `api/scan` |
| M1–M12 | M | HEAD false negatives, sitemap index, hash collisions, SSRF, dead V1, mojibake, etc. | various |

---

## 3. Target architecture

### 3.1 Logical pipeline (ARS host)

```
POST /api/scans (or legacy POST /api/scan)
        │
        ▼
┌───────────────────┐
│  URL Policy       │  SSRF, scheme, size, robots (optional)
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  Discovery        │  Surfaces + content-validated machine entrypoints
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  Crawl Engine     │  Priority queue, dual parse (html|md), specs
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  Framework Detect │  Unchanged contract; improved signals OK
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  Knowledge Graph  │  Typed nodes/edges, evidence, no phantom targets
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  Pathfinder       │  Multi-start journeys, evidence-backed goals
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  ARS Scorer       │  score_version + dimensions + persisted report
└─────────┬─────────┘
          ▼
   Persist + Stream events
```

### 3.2 Module boundaries (end-state)

```
src/lib/scanner/
  core/                     # pure, testable, no Next imports
    types.ts                # single source of truth
    url-policy.ts
    discovery/
    crawl/
    parse/                  # html, markdown, openapi, llms
    graph/
    pathfinder/             # was journey
    score/
  adapters/
    firecrawl.ts            # optional
    playwright.ts           # optional (later)
  legacy/                   # v1 checks quarantined or deleted
apps (Next.js host):
  app/api/...
  components/scanner/...
```

> **Migration rule:** Move code into `core/` incrementally; do not block Phase 0 on monorepo split. Full `packages/scanner-core` is Phase 6.

### 3.3 Data model (end-state)

**`public_scans` (additive columns):**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | existing |
| `url` | text | existing |
| `score` | int | ARS composite 0–100 |
| `score_version` | text | e.g. `ars-1.0.0` |
| `status` | text | `queued\|running\|complete\|failed` |
| `company_slug` | text | indexed |
| `checks` | jsonb | report payload (versioned shape) |
| `dimension_scores` | jsonb | optional denormalized |
| `error` | text | nullable |
| `duration_ms` | int | nullable |
| `created_at` | timestamptz | existing |

**`scan_nodes` / `scan_edges`:** add `evidence jsonb`, `synthetic boolean default false`.

---

## 4. Spec index

Detailed contracts live under `docs/specs/`. Implement against these; update specs when behavior changes.

| Spec ID | File | Covers |
|---------|------|--------|
| SPEC-00 | `docs/specs/00-scan-report-contract.md` | Scan report JSON schema, stream events |
| SPEC-01 | `docs/specs/01-url-policy.md` | SSRF, caps, robots |
| SPEC-02 | `docs/specs/02-discovery.md` | Surfaces, validation, weights |
| SPEC-03 | `docs/specs/03-crawl.md` | Queue, budgets, parsers |
| SPEC-04 | `docs/specs/04-graph.md` | Nodes, edges, metrics, evidence |
| SPEC-05 | `docs/specs/05-pathfinder.md` | Journeys, algorithms, failures |
| SPEC-06 | `docs/specs/06-scoring-ars.md` | ARS 1.0 formula, bands, versioning |
| SPEC-07 | `docs/specs/07-api-jobs.md` | API, jobs, persistence |
| SPEC-08 | `docs/specs/08-ui-integrity.md` | Report UI honesty rules |
| SPEC-09 | `docs/specs/09-oss-cli.md` | CLI, packages, fixtures CI |

Phase 0 implements partial contracts inline; full spec files are authored in Phase 0 tasks **T0.01–T0.03** and refined as modules land.

---

## 5. Phase program

| Phase | Name | Goal | Est. | Exit gate |
|-------|------|------|------|-----------|
| **0** | Integrity hotfix | Stop lying / stop silent bugs | 1–2 wks | Defects C1–C5, H1–H2 fixed; bands unified; dual parse |
| **1** | Crawl engine | Real corpus | 2–3 wks | Budgeted crawl + html/md/openapi/llms + expansion |
| **2** | Knowledge graph | Evidence-backed graph | 2–3 wks | Typed edges preserved; metrics real; no phantom targets |
| **3** | Pathfinder | Defensible journeys | 2–3 wks | Multi-start; evidence goals; UI 100% wired |
| **4** | ARS 1.0 | One score, versioned | 1–2 wks | Methodology published; golden set CI |
| **5** | Platform | Reliable host | 2–4 wks | Jobs, SSRF, slug index, observability |
| **6** | OSS packaging | Public core | 2–3 wks | CLI + fixtures + ARCHITECTURE + LICENSE |
| **7** | Enterprise polish | Depth | ongoing | Diff, deep profile, self-host docs |

**Dependency graph:**

```
0 ──► 1 ──► 2 ──► 3 ──► 4
              ╲         ╱
               ╲       ╱
                ▼     ▼
                  5 ──► 6 ──► 7
```

Phase 5 can start after Phase 0 (SSRF/jobs) in parallel with 1–3 if staffing allows; ARS (4) needs 2+3 data quality.

---

## 6. Master task list

### Legend

- **DoD** = Definition of Done  
- **Deps** = task IDs that must complete first  
- **Pri** = P0 / P1 / P2 / P3  

---

### Phase 0 — Integrity hotfix

#### Specs & scaffolding

| ID | Pri | Task | Deps | DoD |
|----|-----|------|------|-----|
| T0.01 | P0 | Create `docs/specs/` stubs for SPEC-00…SPEC-08 with status `draft` | — | Files exist; linked from this plan |
| T0.02 | P0 | Author SPEC-00 Scan Report Contract (stream + complete payload types) | T0.01 | TS types match spec; exported from `v2/types.ts` or `core/types.ts` |
| T0.03 | P0 | Author SPEC-08 UI Integrity rules | T0.01 | Documented: journeys UI MUST use `journeys.traces` |
| T0.04 | P0 | Add Vitest + `npm test` script; CI workflow skeleton (lint/typecheck/test) | — | `npm test` runs empty suite green; GH Actions optional if remote ready |
| T0.05 | P0 | Add `src/lib/scanner/shared/` helpers: `normalizeUrl`, `deriveCompany`, `scoreBand` | — | All UI duplicates import shared helpers (or mark follow-up tickets) |

#### Critical fixes

| ID | Pri | Task | Deps | DoD | Defects |
|----|-----|------|------|-----|---------|
| T0.10 | P0 | **Wire ResultsReport checklist to `journeys.traces`** | T0.03 | Pass/fail/hops/pressure from traces; remove surface-based fake list | C1 |
| T0.11 | P0 | **Unify score bands** in one module `scoreBand(score, version)` | T0.05 | Home, ResultsReport, OG, badge, leaderboard use same thresholds | C5 |
| T0.12 | P0 | **Dual content parsers**: `parseHtmlPage`, `parseMarkdownPage` | — | Both return same `ExtractedPage` fields; crawler sets `contentKind` | C2 |
| T0.13 | P0 | **Strategies extract from markdown + HTML** | T0.12 | DocsStrategy concepts/code work on Firecrawl MD fixtures | C2 |
| T0.14 | P0 | **Preserve node types** in graph→UI map (`machine_entrypoint`, `support_path`, …) | — | Unit test: surface types survive mapping | C3 |
| T0.15 | P0 | **Preserve edge relations** (extend allowed relation enum; stop silent collapse) | T0.14 | `documents`, `example_of` stored or mapped to explicit types | H2 |
| T0.16 | P0 | **Fix `findStartNode`** multi-start by journey `startTypes` | — | Unit tests per journey start preference | C4 |
| T0.17 | P0 | Fix journey dep key `recover_setup_issue` | — | Dep map key matches journey id | H1 |
| T0.18 | P0 | **Phantom target guard**: `synthetic: true` nodes cannot satisfy `isTarget` | T0.14 | Unit test: auto-stub concept ≠ success | C4/H phantom |
| T0.19 | P0 | Empty journeys → completion rate `0` not `100` | — | Unit test | M12 |
| T0.20 | P0 | Fix mojibake icons in ResultsReport (Lucide only) | — | No broken emoji strings | M10 |
| T0.21 | P0 | Remove production debug `console.log` from `resolveSlug` | — | No verbose match logs | H8 partial |
| T0.22 | P0 | Quarantine or delete unused V1 check path from exports; document dead code | — | README/ARCHITECTURE note; no imports from API | M9 |

#### Phase 0 acceptance (exit gate)

- [ ] Scanning Stripe-like fixture produces journeys UI matching pathfinder output  
- [ ] Firecrawl-off and Firecrawl-on (md fixture) both extract ≥1 concept when headings contain “Authentication”  
- [ ] `machine_entrypoint` nodes appear in graph payload for llms.txt surface  
- [ ] Score band for 74 is identical on home example chips and report component  
- [ ] Unit tests cover T0.14–T0.19  
- [ ] `npm run build` + `npm test` green  

---

### Phase 1 — Crawl engine

| ID | Pri | Task | Deps | DoD |
|----|-----|------|------|-----|
| T1.01 | P0 | Author SPEC-03 Crawl (budget, queue, fetch status enum) | T0.01 | Spec reviewed |
| T1.02 | P0 | Implement `FetchStatus` + `ContentBlob` types | T1.01, T0.02 | Types exported; crawler returns them |
| T1.03 | P0 | `fetchResource(url, policy)` GET-first, size cap, timeout, content-type | T1.02 | Soft-404 heuristic optional stub |
| T1.04 | P0 | Seed queue: **user URL always**, origin, found surfaces, sitemap locs | T1.03 | User pastes docs subdomain → crawled |
| T1.05 | P0 | Priority scoring function (quickstart/auth/webhook/api/errors) | T1.04 | Deterministic sort unit-tested |
| T1.06 | P0 | Expand via strategy `get_next_urls` (same-host, budget-aware) | T1.05, H5 | Expansion used; max pages configurable |
| T1.07 | P0 | Budgets: `maxPages` (default 15), `maxDurationMs` (45s), `maxBytes` | T1.06 | Env-overridable; stream progress events |
| T1.08 | P1 | Parse sitemap **indexes** recursively (cap depth 2) | T1.04 | Nested sitemaps yield child locs |
| T1.09 | P0 | `parseOpenAPI` → operations list (paths × methods) | T1.03 | Invalid openapi → status `invalid_spec` not found |
| T1.10 | P0 | `parseLlmsTxt` → sections + outbound links; empty body ≠ found | T1.03 | Content validation for H3 |
| T1.11 | P1 | Wire `isContentSuspicious` → flag `needsRender` (no Playwright yet) | T1.03 | Flag on ExtractedPage |
| T1.12 | P0 | Fixture pack: 3 offline sites (good / medium / thin-SPA) | T1.07 | Tests run offline |
| T1.13 | P1 | Discover `landing`, `status`, `sdk` surfaces (or drop from UI) | T1.04 | SPEC-02 updated; no dead UI rows |
| T1.14 | P1 | Prefer GET over HEAD for existence; treat 401/403 as “exists restricted” | T1.03 | Documented in SPEC-02 |

#### Phase 1 acceptance

- [ ] Crawl of fixture site returns ≥8 pages when sitemap has ≥8 docs URLs and budget=15  
- [ ] Empty `llms.txt` body → `found: false` or `found: true` with `quality: empty` (per SPEC-02 decision)  
- [ ] OpenAPI fixture yields ≥1 operation node-ready structure  
- [ ] No network calls in unit tests  

---

### Phase 2 — Knowledge graph

| ID | Pri | Task | Deps | DoD |
|----|-----|------|------|-----|
| T2.01 | P0 | Author SPEC-04 Graph schema (node/edge enums, evidence, synthetic) | T0.01 | Spec complete |
| T2.02 | P0 | Single graph type path (stop lossy dual mapping OR make mapping 1:1) | T2.01, T0.14 | Round-trip test |
| T2.03 | P0 | Extract same-site hyperlinks as `page_links_to_page` edges | T2.02, T1.06 | Degree > star-from-root only |
| T2.04 | P0 | Concept extraction requires evidence snippet; store on node | T2.02 | Evidence non-empty for non-synthetic |
| T2.05 | P0 | OpenAPI → `operation` nodes + edges from API surface | T1.09, T2.02 | Visible in graph |
| T2.06 | P0 | llms.txt → machine entrypoint children + link edges | T1.10, T2.02 | Graph shows entrypoint fan-out |
| T2.07 | P0 | Metrics: WCC count, true sinks, path-exists samples | T2.03 | Documented formulas |
| T2.08 | P0 | Synthetic stubs excluded from journey targets (enforce in graph builder) | T0.18, T2.02 | Property on nodes |
| T2.09 | P1 | Content-addressed IDs via sha256 (replace 32-bit hash) | T2.02 | Collision-safe |
| T2.10 | P1 | DB migration: `evidence`, `synthetic` on scan_nodes | T2.01 | migration.sql / supabase migrate |
| T2.11 | P0 | Graph unit tests from fixtures | T2.03–T2.07 | CI green |

#### Phase 2 acceptance

- [ ] Graph for good fixture has page–page edges, not only root–surface star  
- [ ] No journey success on `synthetic: true`  
- [ ] Metrics islands/deadEnds match SPEC-04 definitions  

---

### Phase 3 — Pathfinder (journeys)

| ID | Pri | Task | Deps | DoD |
|----|-----|------|------|-----|
| T3.01 | P0 | Author SPEC-05 Pathfinder (algorithms, failure taxonomy) | T0.01 | Spec complete |
| T3.02 | P0 | Rename product strings to “Agent journey simulation (deterministic pathfinder)” | T3.01 | UI + meta copy |
| T3.03 | P0 | Multi-start: docs, machine entrypoints, API, support by journey mode | T0.16, T2.02 | Tests |
| T3.04 | P0 | Goal predicates: evidence-backed concepts OR operation+code | T2.04, T2.05 | Tests |
| T3.05 | P0 | Scoring: token overlap on page text + edge-type priors | T3.03 | Better than label-only |
| T3.06 | P1 | Beam search k=3 mode (config); default greedy | T3.05 | Comparable traces |
| T3.07 | P0 | Failure taxonomy enum aligned with UI | T3.01 | JourneyPanel shows enum labels |
| T3.08 | P0 | Journey pack v1.1: add `find_llms_entrypoint`, `resolve_openapi_operation` | T3.04 | 10 journeys total |
| T3.09 | P0 | JourneyPanel + ResultsReport share one `JourneyTrace` type | T0.10, T3.07 | No divergent models |
| T3.10 | P0 | Pathfinder fixture tests (success/fail paths) | T3.04 | CI |

#### Phase 3 acceptance

- [ ] Recovery journeys prefer support starts when available  
- [ ] Authenticate journey fails if no auth evidence page (not stub)  
- [ ] Report checklist ≡ JourneyPanel success flags  

---

### Phase 4 — ARS 1.0 scoring

| ID | Pri | Task | Deps | DoD |
|----|-----|------|------|-----|
| T4.01 | P0 | Author SPEC-06 + `docs/methodology/ars-1.0.md` | T0.01 | Public methodology |
| T4.02 | P0 | Implement `calculateARS(report) → { score, dimensions, version }` | T4.01, T2, T3 | Pure function |
| T4.03 | P0 | Persist `score_version`, `dimension_scores` | T4.02 | DB columns + insert path |
| T4.04 | P0 | Replace discovery-only persisted score with ARS | T4.02 | Single score everywhere |
| T4.05 | P0 | Anti-gaming: presence without quality caps machine dimension | T4.02 | Spec + tests |
| T4.06 | P0 | Golden set 5–10 sites with expected score ±5 | T4.02 | `fixtures/golden/*.json` |
| T4.07 | P0 | Badge + OG use ARS + version tooltip/query | T4.03 | Consistent branding |
| T4.08 | P1 | Leaderboard shows score_version filter (default latest) | T4.03 | No mix of eras |

#### Phase 4 acceptance

- [ ] Methodology page linked from report footer  
- [ ] Golden CI job fails if score drifts >5  
- [ ] No dual scoring paths remain in UI |

---

### Phase 5 — Platform reliability

| ID | Pri | Task | Deps | DoD |
|----|-----|------|------|-----|
| T5.01 | P0 | Author SPEC-01 URL policy + SPEC-07 API/jobs | T0.01 | Specs |
| T5.02 | P0 | SSRF denylist (private IP, link-local, metadata, file/gopher) | T5.01 | Unit + integration tests |
| T5.03 | P0 | Zod validation for scan request body | T5.01 | 400 on invalid URL |
| T5.04 | P0 | Scan status model + job runner (Inngest or in-process queue for OSS) | T5.01 | `queued→running→complete\|failed` |
| T5.05 | P0 | `POST /api/scans` returns `{ id }`; stream/poll progress by id | T5.04 | Frontend updated |
| T5.06 | P0 | Soft history: no hard delete; `is_latest` or version chain | H9 | Prior scans retained |
| T5.07 | P0 | `company_slug` column + index; rewrite `getScanBySlug` | H8 | O(1) lookup |
| T5.08 | P1 | Collapse `/[slug]` vs `/scan/[slug]` (redirect) | T5.07 | One canonical path |
| T5.09 | P0 | Rate limit required in prod (fail closed or strict default) | T5.01 | Documented |
| T5.10 | P0 | Structured logs with `scanId`; optional Sentry | T5.04 | Phase timings logged |
| T5.11 | P1 | Remove localhost rewrite from prod next.config | — | Env-gated |
| T5.12 | P1 | `maxDuration` / platform timeout docs | T5.04 | Host config set |

#### Phase 5 acceptance

- [ ] `http://127.0.0.1` scan rejected  
- [ ] Concurrent scans same domain don’t corrupt graph FKs  
- [ ] Slug page works without loading entire table  

---

### Phase 6 — Open source packaging

| ID | Pri | Task | Deps | DoD |
|----|-----|------|------|-----|
| T6.01 | P0 | Author SPEC-09 OSS/CLI | T0.01 | Spec |
| T6.02 | P0 | Extract pure core to `packages/scanner-core` (or `src/lib/scanner/core` interim) | T1–T4 | No Next imports in core |
| T6.03 | P0 | CLI `glintscan <url> [--json|--markdown]` | T6.02 | Runnable via `npx` |
| T6.04 | P0 | LICENSE (Apache-2.0 or MIT), CONTRIBUTING, SECURITY, ARCHITECTURE | T6.01 | Files complete |
| T6.05 | P0 | Real README (product + dev setup + methodology link) | T6.04 | Replaces create-next-app |
| T6.06 | P0 | Fixtures CI on PR | T4.06 | Required check |
| T6.07 | P1 | Docker compose self-host (web + redis optional + supabase local note) | T5.04 | Docs work |
| T6.08 | P1 | Public API stability doc for `scanner-core` | T6.02 | Semver policy |

#### Phase 6 acceptance

- [ ] Fresh clone: `npm i && npm test && npm run build`  
- [ ] CLI scans fixture without Firecrawl key  
- [ ] SECURITY.md describes SSRF + rate limits  

---

### Phase 7 — Enterprise polish (backlog)

| ID | Pri | Task | Deps | DoD |
|----|-----|------|------|-----|
| T7.01 | P2 | Playwright adapter when `needsRender` | T1.11, T5 | Optional profile |
| T7.02 | P2 | Re-scan diff (“+12 from llms.txt”) | T5.06 | Diff API |
| T7.03 | P2 | LLM probe mode (labeled, not leaderboard) | T3 | Flagged dimension |
| T7.04 | P2 | PDF export | T4 | Enterprise report |
| T7.05 | P2 | GitHub App private repos | T5 | Token path |
| T7.06 | P3 | Benchmarks page / public golden leaderboard | T4.06 | Marketing + trust |

---

## 7. PR plan

Ordered stack; each PR mergeable alone.

| PR | Title | Tasks | Notes |
|----|-------|-------|-------|
| PR-01 | chore: test harness + shared score/url helpers | T0.04, T0.05 | Foundation |
| PR-02 | docs: implementation plan + draft specs | T0.01–T0.03 | This doc + stubs |
| PR-03 | fix(ui): journey integrity + score bands + mojibake | T0.10, T0.11, T0.20 | Credibility |
| PR-04 | fix(crawl): dual html/md parsers | T0.12, T0.13 | C2 |
| PR-05 | fix(graph): type/edge fidelity + synthetic guard | T0.14, T0.15, T0.18 | C3/H2 |
| PR-06 | fix(pathfinder): start nodes + dep typo + empty rate | T0.16, T0.17, T0.19 | C4/H1 |
| PR-07 | chore: silence resolveSlug logs; quarantine V1 | T0.21, T0.22 | Hygiene |
| PR-08 | feat(crawl): fetchResource + budgets + seeds | T1.01–T1.07 | Phase 1 core |
| PR-09 | feat(crawl): openapi + llms parsers + fixtures | T1.09–T1.12 | Content validation |
| PR-10 | feat(crawl): expansion + sitemap index + surfaces | T1.08, T1.13, T1.14 | |
| PR-11 | feat(graph): hyperlinks + evidence + metrics | T2.01–T2.08, T2.11 | |
| PR-12 | feat(graph): sha256 ids + db columns | T2.09, T2.10 | |
| PR-13 | feat(pathfinder): multi-start + goals + journey pack | T3.01–T3.10 | |
| PR-14 | feat(score): ARS 1.0 + methodology + golden | T4.01–T4.07 | |
| PR-15 | feat(api): jobs + SSRF + zod + slug index | T5.01–T5.07, T5.09 | |
| PR-16 | feat(api): history + canonical routes + observability | T5.06, T5.08, T5.10–T5.12 | |
| PR-17 | feat(oss): core package + CLI + docs | T6.01–T6.08 | OSS drop |

---

## 8. Test & fixture strategy

### 8.1 Layers

| Layer | Tool | What |
|-------|------|------|
| Unit | Vitest | pure parse, score, pathfinder, url-policy |
| Contract | Vitest | JSON fixtures ↔ report schema |
| Golden | Vitest | score ranges for offline packs |
| Integration | Vitest + mocked fetch | pipeline with MSW or stub fetch |
| E2E (later) | Playwright | home → scan → report (optional Phase 5+) |

### 8.2 Fixture layout

```
fixtures/
  sites/
    good-docs/          # html + llms.txt + openapi.json
    medium-docs/
    thin-spa/
  golden/
    good-docs.expected.json   # { scoreMin, scoreMax, mustFindSurfaces, journeyExpect }
  snapshots/
    graph-good-docs.json
```

### 8.3 CI gates (target)

```
lint → typecheck → unit → golden → build
```

---

## 9. Definition of done (program)

Program complete for **open-source launch** when:

1. All Phase 0–4 exit gates pass  
2. Phase 5 SSRF + slug + status model pass (jobs may be simplified OSS in-process)  
3. Phase 6 CLI + methodology + LICENSE + fixtures CI pass  
4. No known C/H defects from §2 remain open  
5. Public ARS methodology published and linked in UI  

**Enterprise-ready** additionally requires Phase 5 jobs at scale + Phase 7 self-host/PDF as needed.

---

## 10. Risks & open decisions

| ID | Decision | Options | Recommendation |
|----|----------|---------|----------------|
| D1 | Job system | Inngest vs BullMQ vs in-process | Inngest for hosted; in-process for OSS CLI |
| D2 | License | MIT vs Apache-2.0 | Apache-2.0 if patent comfort for enterprise |
| D3 | Empty llms.txt | missing vs found+low quality | found + quality dimension penalty |
| D4 | Keep `/[slug]` | redirect vs remove | 301 → `/scan/[slug]` |
| D5 | Monorepo timing | early vs after Phase 4 | After Phase 4 (PR-17) |
| D6 | LLM probe | include in OSS | Optional adapter; never default score |

---

## 11. Execution order (recommended)

### Sprint A (Week 1–2) — Trust

```
PR-01 → PR-02 → PR-03 → PR-04 → PR-05 → PR-06 → PR-07
```

Ship messaging: *“Scanner integrity release: journeys, graph types, and scores now agree.”*

### Sprint B (Week 3–5) — Real crawl

```
PR-08 → PR-09 → PR-10
```

### Sprint C (Week 6–8) — Graph + pathfinder

```
PR-11 → PR-12 → PR-13
```

### Sprint D (Week 9–10) — ARS

```
PR-14
```

### Sprint E (Week 11–13) — Platform + OSS

```
PR-15 → PR-16 → PR-17
```

---

## Appendix A — File touch map (Phase 0)

| Area | Files |
|------|--------|
| UI integrity | `src/components/scanner/ResultsReport.tsx`, `JourneyPanel.tsx` |
| Bands | new `src/lib/scanner/shared/scoreBand.ts`, `src/app/page.tsx`, OG images |
| Crawl parse | `src/lib/scanner/v2/crawler.ts`, new `parseHtml.ts`, `parseMarkdown.ts` |
| Strategies | `strategies/docs.ts`, `generic.ts`, `blog.ts`, `product.ts`, `repo.ts` |
| Graph | `src/lib/scanner/v2/graph.ts`, `types.ts` |
| Pathfinder | `src/lib/scanner/v2/journey.ts` |
| Slug | `src/lib/resolveSlug.ts` |
| Tests | `src/**/__tests__/*`, `vitest.config.ts` |

---

## Appendix B — Stream event contract (SPEC-00 draft)

```ts
type ScanStreamEvent =
  | { type: 'progress'; check: string; status: 'running' | 'done' | 'warn' | 'failed'; message?: string }
  | { type: 'error'; message: string; code?: string }
  | {
      type: 'complete';
      id: string | null;
      score: number;
      score_version: string;
      checks: ScanReportPayload;
    };

interface ScanReportPayload {
  surfaces: DiscoveredSurface[];
  pages: ExtractedPage[]; // no raw html in DB path
  framework: string;
  graph: ContextGraph; // may be null in DB if relational
  journeys: JourneySimulation;
  dimensions?: ScoreDimension[];
}
```

---

## Appendix C — ARS 1.0 weight draft (SPEC-06)

| Dimension | Weight | Inputs |
|-----------|--------|--------|
| Discoverability | 0.12 | sitemap, landing, robots |
| Machine entrypoints (validated) | 0.20 | llms, openapi, mcp quality |
| Canonical docs & code | 0.12 | docs, github |
| Content quality | 0.12 | headings, code, word depth |
| Graph connectivity | 0.14 | WCC, sinks, bridges |
| Journey success | 0.20 | completion, hops, high-risk |
| Freshness signals | 0.05 | changelog, status |
| Runtime validity | 0.05 | verified surface ratio |

Bands (unified):

| Score | Band |
|------:|------|
| 90–100 | Elite Agent-Native |
| 70–89 | AI-Friendly |
| 40–69 | AI-Capable |
| 0–39 | Legacy Ecosystem |

---

## Appendix D — Task checklist (copy/paste tracker)

### Phase 0
- [ ] T0.01 Spec stubs
- [ ] T0.02 SPEC-00
- [ ] T0.03 SPEC-08
- [ ] T0.04 Vitest/CI
- [ ] T0.05 Shared helpers
- [ ] T0.10 Journey UI integrity
- [ ] T0.11 Score bands
- [ ] T0.12 Dual parsers
- [ ] T0.13 Strategies dual format
- [ ] T0.14 Node type preserve
- [ ] T0.15 Edge relation preserve
- [ ] T0.16 findStartNode
- [ ] T0.17 Journey dep key
- [ ] T0.18 Phantom targets
- [ ] T0.19 Empty journey rate
- [ ] T0.20 Mojibake
- [ ] T0.21 resolveSlug logs
- [ ] T0.22 Quarantine V1

### Phase 1
- [ ] T1.01–T1.14 (see §6)

### Phase 2
- [ ] T2.01–T2.11

### Phase 3
- [ ] T3.01–T3.10

### Phase 4
- [ ] T4.01–T4.08

### Phase 5
- [ ] T5.01–T5.12

### Phase 6
- [ ] T6.01–T6.08

### Phase 7
- [ ] T7.01–T7.06 (backlog)

---

## Appendix E — How to use this plan

1. **Do not start Phase 1 until Phase 0 exit gate passes.**  
2. Every PR references task IDs in the description (`Closes T0.10`).  
3. Update defect registry when fixed (`Status: closed` note in PR).  
4. When behavior changes, update the matching SPEC first (spec-driven).  
5. Prefer tests in the same PR as the fix.  

---

*End of implementation plan.*
