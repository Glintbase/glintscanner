# Agent Readiness Score (ARS) 1.0 — Methodology

**Status:** active  
**score_version:** `ars-1.0.0`  
**Spec:** [SPEC-06](../specs/06-scoring-ars.md)  
**Implementation:** `src/lib/scanner/v2/ars.ts`

## What this measures

ARS estimates how easily an **AI coding agent** (Cursor, Claude Code, Copilot, etc.) can:

1. **Discover** your docs and machine entrypoints  
2. **Retrieve** the right page without multi-hop thrash  
3. **Complete** common integration journeys (auth, install, first request, errors)

It is **not** a security audit, SEO score, or general website quality grade.

## Design principles

1. **Deterministic** — same inputs + same `score_version` → same score  
2. **Evidence over presence** — empty `llms.txt` does not earn full machine points  
3. **Honest simulation** — journey results come from a documented pathfinder, not marketing checklists  
4. **Versioned** — formula changes bump `score_version`; historical scans stay comparable  

## Score bands

| Score | Band |
|------:|------|
| 90–100 | Elite Agent-Native |
| 70–89 | AI-Friendly |
| 40–69 | AI-Capable |
| 0–39 | Legacy Ecosystem |

## Composite formula

\[
\text{ARS} = \sum_i w_i \cdot d_i
\]

Each dimension \(d_i\) is scaled to \(0\)–\(100\). Weights:

| Dimension | Weight | What “good” looks like |
|-----------|--------|-------------------------|
| Discoverability | 12% | Sitemap + reachable landing/docs seeds |
| Machine entrypoints | 20% | Validated llms.txt, OpenAPI, MCP |
| Canonical sources | 12% | Clear docs root + public GitHub/SDK |
| Content quality | 12% | Structure, headings, code samples |
| Graph connectivity | 14% | Linked docs graph; few sinks/islands |
| Journey success | 20% | Pathfinder completes core tasks |
| Freshness | 5% | Changelog / status signals |
| Runtime validity | 5% | High ratio of live, verified surfaces |

Final score is rounded to the nearest integer in \(0\)–\(100\).

## Dimension notes

### Machine entrypoints (anti-gaming)

- HTTP 200 alone is insufficient.  
- OpenAPI must parse and expose `paths`.  
- llms.txt must be non-trivial text (not an HTML error page).  
- Presence without quality caps this dimension at **40/100**.

### Journey success

Journeys are run by the **deterministic pathfinder** ([SPEC-05](../specs/05-pathfinder.md)):

- Multi-start (docs root, machine entrypoints, support for recovery)  
- Goals require **non-synthetic** graph nodes with evidence  
- Completion rate, hop cost, and high-risk journeys feed this dimension  

### Graph connectivity

Derived from the knowledge graph ([SPEC-04](../specs/04-graph.md)): weakly connected components, dead-end pages, unresolved references, and presence of key workflow nodes.

## What is excluded (v1.0)

- LLM-as-judge free-form scoring on the public leaderboard  
- Authenticated (logged-in) dashboard quality  
- Runtime API call success against production APIs  
- Trademark / legal / compliance review  

## Reproducibility

1. Run the open-source core or CLI against a URL or offline fixture  
2. Read `score` and `score_version` from the report  
3. Golden fixtures in CI assert expected ranges (±5)  

## Changelog

| Version | Notes |
|---------|--------|
| ars-1.0.0 | Initial public methodology (draft) |

## Feedback

Wrong score? Open an issue with:

- URL or fixture  
- `score_version`  
- Unexpected dimension  
- Optional HTML snapshot  

See `SECURITY.md` for vulnerability reports (SSRF, abuse), not score disputes.
