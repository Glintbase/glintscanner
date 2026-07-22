# SPEC-06 — Agent Readiness Score (ARS) 1.0

**Status:** active  
**Phase:** 4 + Multi-Agent Harness Upgrade  
**Related tasks:** T4.01–T4.08, C5  
**Public methodology:** `docs/methodology/ars-1.0.md`

## 1. Purpose

One composite, versioned score for leaderboards, badges, and reports.

`score_version = "ars-1.0.0"`

## 2. Bands (global — single source of truth)

| Score | Band key | Display label |
|------:|----------|---------------|
| 90–100 | elite | Elite Agent-Native |
| 70–89 | friendly | AI-Friendly |
| 40–69 | capable | AI-Capable |
| 0–39 | legacy | Legacy Ecosystem |

**Invariant:** Home, report, leaderboard, badge, OG images MUST import the same `scoreBand()` helper.

## 3. Dimensions & weights

| Dimension | Weight | Primary inputs |
|-----------|--------|----------------|
| discoverability | 0.12 | sitemap, landing, robots-derived |
| machine_entrypoints | 0.20 | llms/openapi/mcp **validated** quality |
| canonical_sources | 0.12 | docs, github |
| content_quality | 0.12 | avg words, headings, code blocks |
| graph_connectivity | 0.14 | components, sinks, bridges |
| journey_success | 0.20 | completion rate, hops, high-risk (Deterministic or LLM Agent Simulation) |
| freshness | 0.05 | changelog, status |
| runtime_validity | 0.05 | verified surface ratio |

Weights MUST sum to 1.0.

## 4. Anti-gaming & Evaluation Safeguards

- Machine entrypoint **presence without validation** caps that subscore at 40/100.  
- Journey success on synthetic targets counts as 0 (enforced in pathfinder & agent evaluator).  
- LLM agent assertions require empirical ground-truth verification against scraped surfaces.  
- Skipped surfaces excluded from denominators.  

## 5. Function contract

```ts
function calculateARS(input: {
  surfaces: DiscoveredSurface[];
  pages: StoredPage[];
  graph: ContextGraph;
  journeys: JourneySimulation;
}): {
  score: number; // round 0–100
  score_version: 'ars-1.0.0';
  dimensions: ScoreDimension[];
};
```

Pure: no I/O, no Date.now dependence except ignored.

## 6. Persistence

- `public_scans.score` = ARS composite  
- `public_scans.score_version` = version string  
- `public_scans.dimension_scores` = dimensions JSON (optional denorm)  
- Legacy discovery-only score removed after migration  

## 7. Golden tests

Each fixture declares:

```json
{
  "fixture": "good-docs",
  "scoreMin": 70,
  "scoreMax": 95,
  "mustPassJourneys": ["find_docs_overview"],
  "mustFindSurfaces": ["docs", "llms_txt"]
}
```

CI fails if score outside range.

## 8. Acceptance criteria

| ID | Criterion |
|----|-----------|
| AC-06.1 | Single scoreBand helper used in ≥4 UI entrypoints |
| AC-06.2 | Weights sum 1.0 unit test |
| AC-06.3 | Golden fixtures pass |
| AC-06.4 | Methodology doc linked from report |
| AC-06.5 | No dual V1/V2 band tables remain |

## 9. Versioning policy

Breaking weight or band changes → bump minor/major in `score_version`.  
Leaderboard may filter by version; default = latest ARS.  
