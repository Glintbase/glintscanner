# Interpreting scores

The **Agent Readiness Score (ARS 1.0)** is a 0-100 composite. It estimates how easily an AI coding agent can **discover** your docs and machine entrypoints, **retrieve** the right page without multi-hop thrash, and **complete** common integration journeys (auth, install, first request, errors). It is not an SEO, performance, or security grade.

## Bands

| Score | Band |
|------:|------|
| 90-100 | Elite Agent-Native |
| 70-89 | AI-Friendly |
| 40-69 | AI-Capable |
| 0-39 | Legacy Ecosystem |

## Dimensions and weights

| Dimension | Weight | What "good" looks like |
|-----------|--------|-------------------------|
| Discoverability | 12% | Sitemap + reachable landing/docs seeds |
| Machine entrypoints | 20% | Validated llms.txt, OpenAPI, MCP |
| Canonical sources | 12% | Clear docs root + public GitHub/SDK |
| Content quality | 12% | Structure, headings, code samples |
| Graph connectivity | 14% | Linked docs graph; few sinks/islands |
| Journey success | 20% | Pathfinder completes core tasks |
| Freshness | 5% | Changelog / status signals |
| Runtime validity | 5% | High ratio of live, verified surfaces |

Two dimensions dominate: **machine entrypoints** and **journey success** (20% each). If those are weak, the score cannot be high regardless of prose quality.

## Anti-gaming

- HTTP 200 alone is not enough. An OpenAPI spec must parse and expose `paths`; an `llms.txt` must be non-trivial text, not an HTML error page.
- Presence-without-quality caps the machine-entrypoints dimension at 40/100.

## Reading a low journey pass-rate

A low `run_journeys` completion rate usually means one of:
- A missing or hard-to-find quickstart / first-request path.
- Dead-end pages or an unconnected docs graph (agents get stuck).
- A spec that does not parse, so operations cannot be resolved.

Inspect which journeys failed and at which hop before recommending fixes, then use `get_remediation` for the concrete, templated changes.

## Reading a discrepancy (important)

The same URL can score differently depending on **how content was retrieved** and **which journey engine ran**:

- A **hosted deep scan** (Firecrawl-cleaned content + an LLM multi-agent harness) will generally score a JS-heavy site higher than a **default MCP scan** (raw HTML + deterministic pathfinder), because raw HTTP returns a near-empty shell for SPA docs.
- To make an MCP run comparable: call **`deep_crawl`** before `score_readiness` (recovers JS content with no key), or set `FIRECRAWL_API_KEY` and use `profile: "deep"`.

Both numbers are valid — each reports readiness under its own retrieval and reasoning configuration. When you see a surprisingly low score on a modern site, the first thing to check is whether `deep_crawl` was used.

The score is deterministic for a given `score_version` (`ars-1.0.0`): same inputs produce the same score, so it is safe for regression gates.
