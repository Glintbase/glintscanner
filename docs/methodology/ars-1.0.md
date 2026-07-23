# Agent Readiness Score (ARS) 1.0 — Methodology

**Status:** active  
**score_version:** `ars-1.0.0`  
**Spec:** [SPEC-06](../specs/06-scoring-ars.md)  
**Implementation:** `src/lib/scanner/v2/ars.ts` & `src/lib/scanner/agent/`

## What this measures

ARS estimates how easily an **AI coding agent** (Cursor, Claude Code, Copilot, Antigravity, etc.) can:

1. **Discover** your docs and machine entrypoints  
2. **Retrieve** the right page without multi-hop thrash  
3. **Complete** common integration journeys (auth, install, first request, errors)

It is **not** a security audit, SEO score, or general website quality grade.

## Design principles

1. **Deterministic & Empirically Verified** — same inputs + same `score_version` → reproducible score  
2. **Evidence over presence** — empty `llms.txt` does not earn full machine points  
3. **Dual Simulation Engines** — benchmarked via both **Deterministic Graph Pathfinder** (fast baseline) and **LLM Multi-Agent Tool Harness** (real AI reasoning & tool execution)  
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
| Journey success | 20% | Pathfinder / LLM agent completes core tasks |
| Freshness | 5% | Changelog / status signals |
| Runtime validity | 5% | High ratio of live, verified surfaces |

Final score is rounded to the nearest integer in \(0\)–\(100\).

## Dimension notes

### Machine entrypoints (anti-gaming)

- HTTP 200 alone is insufficient.  
- OpenAPI must parse and expose `paths`.  
- llms.txt must be non-trivial text (not an HTML error page).  
- Presence without quality caps this dimension at **40/100**.

### Journey success (Dual Simulation Engine)

Journeys are executed by the **Agent Pathfinder** ([SPEC-05](../specs/05-pathfinder.md)):

1. **⚡ Deterministic Pathfinder Mode (Fast Baseline)**:
   - Multi-start traversal across the knowledge graph (docs root, machine entrypoints, support path)  
   - Greedy / beam search scoring node relevance against task intent  

2. **🤖 LLM Multi-Agent Harness Mode (Real AI Reasoning)**:
   - Dynamic task planning tailored to product ecosystem  
   - Bounded multi-step tool execution loop (`search_docs`, `read_surface`, `inspect_openapi_spec`, `verify_goal`)  
   - Unified rate-limiting governor & token budget manager  
   - Empirical ground-truth verification engine matching evidence claims against scraped surfaces  
   - Human-readable procedural step visualization (URL, action, found details)

**Which engine runs depends on the execution surface** (see below). The deterministic engine is the reproducible baseline that every surface can run offline; the LLM harness is an optional higher-fidelity layer that requires a model provider.

### Graph connectivity

Derived from the knowledge graph ([SPEC-04](../specs/04-graph.md)): weakly connected components, dead-end pages, unresolved references, and presence of key workflow nodes.

### Content extraction tiers

Content quality and journey success both depend on **how much real page text the crawler recovers**. Modern docs sites are frequently JS-rendered, so a raw HTTP fetch returns a near-empty shell. The scanner recovers content in three escalating tiers:

1. **Raw HTML** — default; direct fetch + dual HTML/Markdown parse. Sufficient for server-rendered/static docs.
2. **Embedded-data extraction** (`deep_crawl`, zero-dependency) — when a page is thin or flagged `needsRender`, recover the payload the framework already ships in the HTML: Next.js `__NEXT_DATA__`, App Router RSC flight chunks, JSON-LD, `<noscript>`, and main-content containers. **No API key or headless browser.**
3. **Firecrawl** (optional, `FIRECRAWL_API_KEY`) — external rendering service for the cleanest markdown on the hardest SPAs.

Each extracted page records an `extractionMethod` (`raw` · `next_data` · `rsc_flight` · `json_ld` · `noscript` · `dom_selector` · `firecrawl`) so results are auditable. A shell scored on raw HTML alone will report **artificially low** content quality and journey success versus the same site recovered via tier 2/3 — the score is honest about *what the agent could actually retrieve given that extraction tier*.

## Execution surfaces & how they shape the score

The identical scanner core runs behind three surfaces. They select **different journey engines and extraction tiers**, so the same URL can legitimately produce different scores:

| Surface | Journey engine | Extraction | LLM provider |
|---------|----------------|------------|--------------|
| **Web** (`scan.glintbase.dev`) | Deterministic (`quick`) · **LLM harness auto-on for `deep`** | Raw + Firecrawl (if key) | Hosted (Google) |
| **CLI** (`@glintbase/cli`) | Deterministic · **`--agent` → LLM harness** | Raw + Firecrawl (if key) | Yours (cloud or local model) |
| **MCP** (`@glintbase/mcp`) | **Always deterministic** — the calling coding agent is the reasoning layer | Raw + zero-dep `deep_crawl`; Firecrawl optional | None (agent-provided) |

**Reading a discrepancy:** a hosted `deep` scan (Firecrawl + LLM harness) will generally score a JS-heavy site higher than a default MCP scan (raw HTML + deterministic pathfinder). To align them, run `deep_crawl` before `score_readiness` in the MCP, or supply `FIRECRAWL_API_KEY` and `profile: "deep"`. Both numbers are valid — each reports readiness *under its own retrieval and reasoning configuration*.

## What is excluded (v1.0)

- Authenticated (logged-in) dashboard quality  
- Production API write operations requiring payment methods  
- Trademark / legal / compliance review  

## Reproducibility

1. Run the open-source core or CLI against a URL or offline fixture  
2. Read `score` and `score_version` from the report  
3. Golden fixtures in CI assert expected ranges (±5)  

## Changelog

| Version | Notes |
|---------|--------|
| ars-1.0.0 | Initial public methodology + LLM Multi-Agent Simulation Harness support |
| ars-1.0.0 (doc rev) | Documented execution surfaces (web / CLI / MCP), content extraction tiers, and zero-dependency `deep_crawl` embedded-data recovery (`__NEXT_DATA__`, RSC flight, JSON-LD, `<noscript>`, main-content). No formula change — clarifies how retrieval tier and journey engine affect the score. |

## Feedback

Wrong score? Open an issue with:

- URL or fixture  
- `score_version`  
- Unexpected dimension  
- Optional HTML snapshot  

See `SECURITY.md` for vulnerability reports (SSRF, abuse), not score disputes.
