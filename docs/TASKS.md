# Task tracker

Source of truth for IDs and DoD: [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).  
Check boxes as work merges. Prefer one PR per plan PR-XX when possible.

**Legend:** `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase 0 — Integrity hotfix

**Exit gate:** C1–C5 + H1–H2 fixed; dual parse; bands unified; tests green

### Specs & scaffolding

- [x] **T0.01** Create `docs/specs/` stubs SPEC-00…09 *(done)*  
- [x] **T0.02** SPEC-00 Scan Report Contract *(done)*  
- [x] **T0.03** SPEC-08 UI Integrity *(done)*  
- [x] **T0.04** Vitest + `npm test` *(done — CI workflow optional follow-up)*  
- [x] **T0.05** Shared helpers: `normalizeUrl`, `deriveCompany`, `scoreBand` *(done)*

### Critical fixes

- [x] **T0.10** Wire ResultsReport journeys to `journeys.traces` (C1)  
- [x] **T0.11** Unify score bands via shared `scoreBand` (C5)  
- [x] **T0.12** Dual parsers HTML + Markdown (C2)  
- [x] **T0.13** Strategies extract from both formats (C2)  
- [x] **T0.14** Preserve node types in graph map (C3)  
- [x] **T0.15** Preserve edge relations (H2)  
- [x] **T0.16** Fix `findStartNode` multi-start (C4)  
- [x] **T0.17** Fix journey dep key `recover_setup_issue` (H1)  
- [x] **T0.18** Phantom/synthetic targets cannot succeed  
- [x] **T0.19** Empty journeys → 0% completion (not 100)  
- [x] **T0.20** Fix mojibake icons in ResultsReport  
- [x] **T0.21** Remove debug logs from `resolveSlug`  
- [x] **T0.22** Quarantine V1 check path (README)  

### Phase 0 PR map

| PR | Tasks |
|----|--------|
| PR-01 | T0.04, T0.05 |
| PR-02 | docs (done) |
| PR-03 | T0.10, T0.11, T0.20 |
| PR-04 | T0.12, T0.13 |
| PR-05 | T0.14, T0.15, T0.18 |
| PR-06 | T0.16, T0.17, T0.19 |
| PR-07 | T0.21, T0.22 |

---

## Phase 1 — Crawl engine

- [x] **T1.01** SPEC-03 draft in docs/specs  
- [x] **T1.02** `FetchStatus` + ExtractedPage fields  
- [x] **T1.03** `fetchResource` GET-first, size cap, timeout  
- [x] **T1.04** Seed queue: user URL + origin + surfaces + sitemap  
- [x] **T1.05** Priority scoring function + unit tests  
- [x] **T1.06** Expansion via `get_next_urls`  
- [x] **T1.07** Budgets: maxPages / maxDurationMs / maxBytes  
- [x] **T1.08** Sitemap index recursion (depth ≤ 2)  
- [x] **T1.09** `parseOpenAPI`  
- [x] **T1.10** `parseLlmsTxt` + empty body rules  
- [x] **T1.11** Wire `isContentSuspicious` → `needsRender`  
- [x] **T1.12** Fixture pack: good-docs + thin-spa  
- [x] **T1.13** Discover landing / status / sdk  
- [x] **T1.14** Prefer GET over HEAD for existence  

| PR | Tasks |
|----|--------|
| PR-08 | T1.01–T1.07 |
| PR-09 | T1.09–T1.12 |
| PR-10 | T1.08, T1.13, T1.14 |

---

## Phase 2 — Knowledge graph

- [x] **T2.01** SPEC-04 draft + implementation  
- [x] **T2.02** Single graph type path (types preserved 1:1)  
- [x] **T2.03** Same-site hyperlink edges (`page_links_to_page`)  
- [x] **T2.04** Concept evidence required  
- [x] **T2.05** OpenAPI → operation nodes  
- [x] **T2.06** llms.txt → entrypoint_lists children  
- [x] **T2.07** Metrics: WCC, sinks, pathDocsToAuth  
- [x] **T2.08** Synthetic stubs excluded from journey targets (P0)  
- [x] **T2.09** sha256 content IDs (`contentHash`)  
- [x] **T2.10** DB columns evidence + synthetic in migration.sql  
- [x] **T2.11** Graph unit tests from fixtures  

| PR | Tasks |
|----|--------|
| PR-11 | T2.01–T2.08, T2.11 |
| PR-12 | T2.09, T2.10 |

---

## Phase 3 — Pathfinder

- [x] **T3.01** SPEC-05 + implementation  
- [x] **T3.02** Product copy: deterministic pathfinder  
- [x] **T3.03** Multi-start by mode/startTypes + preferMachineStart  
- [x] **T3.04** Evidence-backed goal predicates + no_evidence  
- [x] **T3.05** Relevance scoring with evidence text + edge priors  
- [x] **T3.06** Beam search (PATHFINDER_BEAM_WIDTH / options)  
- [x] **T3.07** Failure taxonomy aligned with UI labels  
- [x] **T3.08** Journey pack v1.1 (llms + openapi + 10 journeys)  
- [x] **T3.09** JourneyPanel / report copy honesty  
- [x] **T3.10** Pathfinder unit tests (39 total suite)  

| PR | Tasks |
|----|--------|
| PR-13 | T3.01–T3.10 |

---

## Phase 4 — ARS 1.0

- [x] **T4.01** SPEC-06 + methodology active  
- [x] **T4.02** `calculateARS` pure function  
- [x] **T4.03** Persist score_version + dimension_scores (migration + insert)  
- [x] **T4.04** Replace discovery-only persisted score with ARS  
- [x] **T4.05** Anti-gaming caps on machine entrypoints  
- [x] **T4.06** ARS unit tests (strong / invalid / legacy / deterministic)  
- [x] **T4.07** Bands already unified; report shows score_version + methodology  
- [ ] **T4.08** Leaderboard score_version filter *(optional follow-up)*  

| PR | Tasks |
|----|--------|
| PR-14 | T4.01–T4.07 |

---

## Phase 5 — Platform

- [x] **T5.01** SPEC-01/07 implemented in code  
- [x] **T5.02** SSRF denylist (`urlPolicy` + fetchResource)  
- [x] **T5.03** Request validation (`scanRequest` lightweight schema)  
- [ ] **T5.04** Full async job runner *(deferred — stream path remains; scanId emitted)*  
- [ ] **T5.05** POST `/api/scans` poll API *(deferred)*  
- [x] **T5.06** Soft history (`is_latest` mark; no hard delete when columns exist)  
- [x] **T5.07** `company_slug` + indexed lookup in getScanBySlug  
- [x] **T5.08** Canonical `/scan/[slug]` (`/[slug]` permanentRedirect)  
- [x] **T5.09** Rate limit always-on (Upstash or in-memory fallback)  
- [x] **T5.10** Structured JSON logs (`scanLogger`)  
- [x] **T5.11** next.config fallback rewrite dev-only  
- [x] **T5.12** `maxDuration = 300` on scan route  

| PR | Tasks |
|----|--------|
| PR-15 | T5.01–T5.07, T5.09 |
| PR-16 | T5.06, T5.08, T5.10–T5.12 |

---

## Phase 6 — OSS packaging

- [x] **T6.01** SPEC-09 implemented  
- [x] **T6.02** Pure core: `src/lib/scanner/core` (`runScan`, no Next/Supabase)  
- [x] **T6.03** CLI `glintscan` / `npm run glintscan`  
- [x] **T6.04** LICENSE (Apache-2.0), CONTRIBUTING, SECURITY, ARCHITECTURE  
- [x] **T6.05** Product README  
- [x] **T6.06** GitHub Actions CI (test + typecheck + CLI smoke)  
- [x] **T6.07** Self-host notes (`docs/SELF-HOST.md`)  
- [x] **T6.08** Semver policy in ARCHITECTURE.md  

| PR | Tasks |
|----|--------|
| PR-17 | T6.01–T6.08 |

---

## Phase 7 — Enterprise backlog

- [ ] **T7.01** Playwright when `needsRender`  
- [ ] **T7.02** Re-scan diff  
- [ ] **T7.03** LLM probe mode (labeled)  
- [ ] **T7.04** PDF export  
- [ ] **T7.05** GitHub App private repos  
- [ ] **T7.06** Public benchmarks page  

---

## Defect registry (close when fixed)

| ID | Status | Task |
|----|--------|------|
| C1 Fake journey UI | **closed** | T0.10 |
| C2 Firecrawl MD breaks extract | **closed** | T0.12–13 |
| C3 Node types dropped | **closed** | T0.14 |
| C4 Always start root | **closed** | T0.16 |
| C5 Dual bands/scores | **partial** (bands unified; ARS formula = Phase 4) | T0.11, T4.* |
| H1 Journey dep typo | **closed** | T0.17 |
| H2 Edges collapsed | **closed** | T0.15 |
| H3 Existence ≠ quality | open | T1.09–10 |
| H4 Missing surfaces | open | T1.13 |
| H5 get_next_urls unused | open | T1.06 |
| H8 Full table slug | open | T5.07 |
| H9 Hard delete scans | open | T5.06 |
| H10 Sync-only pipeline | open | T5.04–05 |
