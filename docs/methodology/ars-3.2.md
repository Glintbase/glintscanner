# Agent Readiness Score (ARS) 3.2 — Methodology

**Status:** active (supersedes [ARS 1.0](./ars-1.0.md) and ARS 3.0 / 3.1)
**score_version:** `ars-3.2.0` (defined in `src/lib/scanner/version.ts`)
**Implementation:** `src/lib/scanner/v2/probes/` (entry: `runArs3Probes`, called by `runScan`)
**Check registry:** `src/lib/scanner/v2/probes/registry.ts`

## What the score is, and what it is not

ARS 3.2 measures **which agent-readiness signals a product publicly exposes and whether they work when probed**: machine-readable docs, specs, MCP servers, auth metadata, and content that agents can read without a browser.

It is **not yet validated as a predictor of agent task success**. No study in this repo correlates ARS with measured agent outcomes. Until that exists, present ARS as "readiness signals present and verified", not "agents will succeed".

## Core rule: points only for observed evidence

Every check ends in one of five states:

| Status | Meaning | Effect on score |
|---|---|---|
| `pass` | The scanner observed the evidence | Earns the check's full registry points |
| `warn` / `fail` | Checked, and the evidence was missing or wrong | Base checks count against the layer; earns 0 |
| `na` | The surface the check inspects does not exist (e.g. no MCP server, no OpenAPI) | Excluded |
| `skip` | The surface exists but this scan could not verify the check | Excluded |

- No check may pass because a related file merely exists, or by assumption.
- No partial credit: `warn` earns 0.
- Absent surfaces are penalised once, by their existence check (`mcp-server-manifest`, `openapi-spec`, `llms-txt-exists`, ...). Quality checks for an absent surface are `na`.

## Registry

The registry is the single source of truth for each check's **points** and **bonus** status; probes only decide the status (`alignWithRegistry` in `probes/index.ts` enforces this). At `ars-3.2.0` it holds **129 checks**:

| Layer | Checks | Base checks (points) | Bonus checks (points) |
|---|---:|---:|---:|
| Discovery | 17 | 10 (21) | 7 (14) |
| Access | 45 | 37 (54) | 8 (14) |
| Usability | 61 | 24 (41) | 37 (68) |
| Payments | 6 | 0 | 6 (16) |

Several registered checks are not probed yet and always report `na` (for example `http2-support`, `dns-caa-record`, `mcp-view-csp`, `mcp-ssrf-guard`, `brand-search-accuracy`). Every scan reports how many checks it actually measured (see *Evidence coverage*); publish that number, not the registry size.

## Scoring

1. **Archetype.** The site is classified (`v2/archetype.ts`) and given layer weights:

   | Archetype | Discovery | Access | Usability | Payments | Denominator |
   |---|---:|---:|---:|---:|---:|
   | API / devtool | 20 | 30 | 35 | 0 | 85 |
   | Docs / knowledge base | 20 | 30 | 35 | 0 | 85 |
   | E-commerce | 20 | 30 | 40 | 10 | 100 |
   | Content / media | 20 | 30 | 0 | 0 | 50 |

2. **Layer base score** = `round(passed base points / verifiable base points × layer weight)`, where verifiable means `pass`, `warn` or `fail`.
3. **Bonus** = points from passed bonus checks (payments excluded; payments uses its own OR-scoring).
4. **Final score** = `min(100, round((Σ layer base + bonus) / (denominator + bonus) × 100))`.

### Grades and bands

Defined once in `src/lib/scanner/shared/scoreBand.ts`. Bands are groups of grades, so they cannot disagree.

| Score | Grade | Band |
|---:|:---:|---|
| 95–100 | A+ | Agent-Native |
| 86–94 | A | Agent-Native |
| 70–85 | B | AI-Friendly |
| 48–69 | C | AI-Capable |
| 28–47 | D | Legacy |
| 0–27 | F | Legacy |

## Evidence coverage

Because unverifiable checks are excluded, a layer with few verifiable checks rests on little evidence. Every scorecard therefore includes:

- `evidence.checksEvaluated` / `evidence.checksRegistered`: checks with a verdict vs. registered checks.
- `evidence.baseCoverage`: verified base points ÷ registered base points across scored layers.
- `layers.<id>.coverage` and `layers.<id>.lowConfidence`: a layer is **low evidence** when under 50% of its registered base points could be verified (`MIN_LAYER_COVERAGE`).

The web report, CLI and Markdown report show these alongside the score.

## What each layer probes

### Discovery
robots.txt AI-crawler policy, ARD / AI catalog files, Wikidata official-website claim (P856, matched on the registrable domain), and an npm package under the brand name that links back to the brand's domain or GitHub org. The brand is derived from the registrable domain (`docs.stripe.com` → `stripe`). Agent rules files are only checked for local codebases (`skip` remotely).

### Access
Zero-JS content, soft-404 canary, `llms.txt` (exists, formatting, and up to 8 declared links actually fetched; ≥80% must resolve), `llms-full.txt`, markdown negotiation, OpenAPI at standard paths (JSON specs are parsed), HTTP hygiene headers, and bot challenges (challenge page markers or `cf-mitigated: challenge`, re-reading 403/429/503 bodies).

### Usability
- **MCP discovery** tries standard paths on the site, `docs.` / `api.` subdomains, and the root plus standard paths of `mcp.` subdomains. A 401/403 only counts as an MCP server on an MCP-like path or host.
- **Live MCP probe** (`v2/mcpProbe.ts`): `initialize` on the 2026-07-28 and legacy wire forms (2026-07-28 support requires the server to answer with that version), `tools/list` (carrying the session id), schema strictness and `readOnlyHint` / `destructiveHint` annotations from real tool definitions, capabilities (prompts, resources, logging) from the initialize result, and an unknown-tool canary for in-channel errors.
- **Safety:** the prober calls a real tool only if the server annotates it `readOnlyHint: true` and it takes no required arguments. Unannotated tools are never called. SSRF behaviour is not probed.
- **Transports:** Streamable HTTP is a base check; legacy SSE is bonus only.
- **auth.md** stage checks are bonus only (emerging proposal) and require each stage to appear in the file. OAuth PRM / AS metadata must be valid JSON with the expected fields; bearer and scope checks read them.
- **OpenAPI inspection** (`v2/openapiInspect.ts`): unique operationIds, JSON request schemas, typed error responses (≥50% of operations), Idempotency-Key, rate-limit headers, versioned URIs, search, cursor pagination, webhooks, problem+json, OpenAPI 3.1. YAML specs are detected but not parsed (`skip`).

### Payments
Only for e-commerce archetypes or commerce signals: ACP, UCP, AP2, x402, MPP.

## Changes from ARS 3.1

- Checks pass only on observed evidence; MCP, OpenAPI, auth.md, llms.txt link and bot-challenge checks rewritten accordingly.
- Registry owns points and bonus flags; no partial credit for `warn`.
- Legacy SSE transport and the 8 auth.md stage checks moved to bonus.
- `mcp-inchannel-signalling` removed (duplicate of `mcp-error-reporting`); registry is 129 checks.
- 2026-07-28 wire-form support requires the server to negotiate that version.
- MCP servers at the root of `mcp.` subdomains are discovered.
- Evidence coverage and low-evidence layers reported on every scan.
- Grades and bands unified.

ARS 3.1 and earlier scores are not comparable with 3.2. Scorecard pages flag older scans and offer a rescan.

## Known limitations

- **No outcome validation** (see top).
- **Single-sample measurements:** latency and availability come from one request per URL.
- **Keyword heuristics:** auth.md stage detection and WebMCP detection match keywords and can be gamed.
- **Fixed paths:** OpenAPI is only found at standard paths; it is not followed from links, headers or llms.txt.
- **Endpoint choice:** when several MCP candidates respond, the first to answer is used.
- **Absent MCP weighs heavily:** for API and docs archetypes, a site without an MCP server or OpenAPI spec typically scores 0 on most of the 35-point usability layer. This is intended by the current weights but is a policy choice worth revisiting.
- **Archetype drives rubric:** a docs host whose MCP server is a product (action) server is judged by the docs rubric (e.g. auth-gated MCP is a `warn`).
