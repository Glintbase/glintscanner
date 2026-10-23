# Agent Readiness Score (ARS) 3.3 — Methodology

**Status:** active since 2026-10-23 (supersedes [ARS 3.2](./ars-3.2.md))
**score_version:** `ars-3.3.0` (defined in `src/lib/scanner/version.ts`; see [Changes from ARS 3.2](#changes-from-ars-32))
**Implementation:** `src/lib/scanner/v2/probes/` (entry: `runArs3Probes`, called by `runScan`)
**Check registry:** `src/lib/scanner/v2/probes/registry.ts`

## What the score is, and what it is not

ARS 3.3 measures **which agent-readiness signals a product publicly exposes and whether they work when probed**: machine-readable docs, specs, MCP servers, auth metadata, and content that agents can read without a browser.

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
- Absent surfaces are penalised once, by their existence check (`mcp-server-manifest`, `openapi-spec`, ...). Quality checks for an absent surface are `na`.
- Exception: `llms.txt` is optional. Its absence costs nothing; when present it must be valid and its links must resolve (see Access).

## Registry

The registry is the single source of truth for each check's **points** and **bonus** status; probes only decide the status (`alignWithRegistry` in `probes/index.ts` enforces this). It holds **132 checks**:

| Layer | Checks | Base checks (points) | Bonus checks (points) |
|---|---:|---:|---:|
| Discovery | 17 | 10 (21) | 7 (14) |
| Access | 46 | 35 (51) | 11 (17) |
| Usability | 63 | 24 (41) | 39 (70) |
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
4. **Weighted score** = `min(100, round((Σ layer base + bonus) / (denominator + bonus) × 100))`.
5. **Gates.** If a gate check fails, the final score is `min(weighted score, 47)`, the top of grade D. The scorecard reports `gates[]` and `uncappedScore`.

   | Gate check | Fails when |
   |---|---|
   | `anti-crawler-challenge-free` | The homepage serves a bot challenge (challenge markers or `cf-mitigated: challenge`) or HTTP 403 to the scanner's request |
   | `content-no-js` | The homepage has under 300 characters of prose without JavaScript |

   These are the two failures that stopped retrieval outright in AgentReady.org's controlled experiment (19 configurations of one docs site; only a JavaScript-only answer and a 403 to agent user-agents stopped retrieval). Weighted points can't offset a site an agent can't read. The cap value is a policy choice.

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

### Where the weights come from

The four layers, their base weights (20 / 30 / 40 / 10, kept for the e-commerce archetype) and the grade cut-offs follow the structure ora.ai publishes at <https://ora.ai/methodology>. ARS adds the archetype weights, evidence-only scoring (unknowns are excluded, no partial credit) and evidence coverage. The weights themselves are not validated against agent outcomes (see top). A crosswalk to AgentReady.org, ora and draft-shah-agent-readiness-evaluation-00 is published at <https://glintbase.dev/blog/how-ars-compares-agentready-ora-ietf>.

## Evidence coverage

Because unverifiable checks are excluded, a layer with few verifiable checks rests on little evidence. Every scorecard therefore includes:

- `evidence.checksEvaluated` / `evidence.checksRegistered`: checks with a verdict vs. registered checks.
- `evidence.baseCoverage`: verified base points ÷ registered base points across scored layers.
- `layers.<id>.coverage` and `layers.<id>.lowConfidence`: a layer is **low evidence** when under 50% of its registered base points could be verified (`MIN_LAYER_COVERAGE`).

The web report, CLI and Markdown report show these alongside the score.

## What each layer probes

### Discovery
robots.txt AI-crawler policy, ARD / AI catalog files, Wikidata official-website claim (P856, matched on the registrable domain), and an npm package under the brand name that links back to the brand's domain or GitHub org. The brand is derived from the registrable domain (`docs.stripe.com` → `stripe`). Agent rules files are only checked for local codebases (`skip` remotely).

Registry listings (`v2/probes/registryListings.ts`) only count identities tied to the site, so third-party servers or skills about a brand earn it nothing:
- **`mcp-registry-listed`**: the official MCP Registry is searched by the domain's reverse-DNS namespace and by brand. It passes on an active, latest server whose namespace is the domain (`com.stripe/…`, which the registry grants only after domain verification) or a subdomain of it, whose remote endpoint is hosted on the domain, or whose namespace is the brand's GitHub owner (`io.github.stripe/…`). A self-declared `websiteUrl` does not count.
- **`skills-sh-listed`**: skills.sh search by brand. It passes on skills published from the domain itself (`docs.stripe.com/…`) or from the brand's GitHub owner (`stripe/…`).
- Both are `warn` (0 points) when the registry answered without a match and `skip` when it did not answer (timeout, error, unexpected response), so a registry outage never costs a site points. Lookups time out after 8 s on live scans; offline batch rescans may raise this with `GLINTBASE_REGISTRY_TIMEOUT_MS`.
- The search-ranking checks (`brand-search-accuracy`, `agentic-search-specific`) need a search API and are `skip` (not probed). `agentic-search-usecase` is held at `na` by design. Discovery is therefore still flagged low evidence on URL scans: at most 8 of its 21 registered base points are measured.

### Access
Zero-JS content, soft-404 canary, `llms-full.txt`, markdown negotiation, HTTP hygiene headers, and bot challenges (challenge page markers or `cf-mitigated: challenge`, re-reading 403/429/503 bodies).

- **llms.txt** is scored only when present. A 200 counts as an llms.txt only if the body is not HTML and has a Markdown heading or link, so soft-404 pages and error strings are rejected. `llms-txt-exists` (1, bonus) and `llms-txt-formatting` (1, bonus) can only add points. `llms-txt-links-resolve` (2, base) fetches up to 8 declared links and needs at least 80% to resolve, so a broken index costs points. `llms-txt-graph-reachability` (2, bonus) needs an `href` to llms.txt on the homepage. Reason: AgentReady's experiment found no retrieval difference from adding the file, and its agent traces show 86% of llms.txt fetches came from a page that linked to it.
- **Markdown alternate:** `markdown-alternate-link` (1, bonus) passes when the homepage declares `<link rel="alternate" type="text/markdown">` and the link resolves to non-HTML content.
- **OpenAPI discovery:** before standard paths, the scanner tries specs the site points to: `Link` headers with `rel="service-desc"` or `rel="describedby"` on the homepage, `service-desc` links in `/.well-known/api-catalog`, and `<link rel="service-desc">` or links to `openapi`/`swagger` files on the homepage. JSON specs are parsed.
- **API catalog:** `api-catalog-rfc9727` (2, bonus) passes only if `/.well-known/api-catalog` parses as an RFC 9264 linkset (`{"linkset": [...]}`).

If the homepage cannot be fetched (no successful response and no body), every check derived from its HTML or response headers is `skip` ("Homepage could not be fetched"), and `anti-crawler-challenge-free` is `skip` unless a challenge was actually observed.

**Not observed.** If the homepage serves a bot challenge or HTTP 403, the checks that would read its content are `skip` ("Not observed: ...") instead of scoring the refusal page, and `evidence.homepageBlocked` is set. The block itself fails `anti-crawler-challenge-free`, which is a gate. The term follows draft-shah-agent-readiness-evaluation-00. If the soft-404 canary request does not complete (timeout / unreachable), `anti-spa-404` is `skip`. An HTML page served at `/robots.txt` counts as no robots.txt; `#` comments are stripped before directives are read.

### Usability
- **MCP discovery** tries standard paths on the site, `docs.` / `api.` / `mcp.` subdomains of the registrable domain (so `www.acme.co.uk` probes `docs.acme.co.uk`), and the root plus standard paths of `mcp.` subdomains. A 401/403 only counts as an MCP server on an MCP-like path or host **and** when the response is a JSON-RPC envelope or carries an RFC 9728 `WWW-Authenticate: ... resource_metadata=` challenge (GET and POST). A generic 401 (any `WWW-Authenticate`, or a JSON error body) is not MCP evidence.
- **Live MCP probe** (`v2/mcpProbe.ts`), following the backward-compatibility procedure in MCP 2026-07-28 (the same procedure as the Remote MCP Server Reliability study): `server/discover` with per-request `_meta` and `MCP-Protocol-Version` / `Mcp-Method` headers; a DiscoverResult or a modern-only error (-32020, -32021) marks the server as modern. Otherwise `initialize` (2025-11-25, retried with 2025-03-26), then `notifications/initialized` with the session id. Later requests use the server's era. A legacy server that claims 2026-07-28 in its `initialize` result is still legacy. `mcp-protocol-modern` (1, bonus) passes for modern servers; `mcp-wire-compatibility` (2, bonus) passes for a modern server that also completes a legacy `initialize`. Then `tools/list` (in the server's era), schema strictness and `readOnlyHint` / `destructiveHint` annotations from real tool definitions, capabilities (prompts, resources, logging) from the initialize result, and an unknown-tool canary for in-channel errors.
- **Safety:** the prober calls a real tool only if the server annotates it `readOnlyHint: true` and it takes no required arguments. Unannotated tools are never called. SSRF behaviour is not probed.
- **Transports:** Streamable HTTP is a base check; legacy SSE is bonus only.
- **Server Card** (`v2/serverCard.ts`, SEP-2127, final 2026-10-06): `mcp-server-card` (1, bonus) passes for a card with the v1 schema's required fields (`$schema`, `name`, `version`, `description`) listed in `/.well-known/ai-catalog.json` (entry type `application/mcp-server-card+json`, by `url` or inline `data`) or served at `<mcp-endpoint>/server-card`. A card only at the superseded `/.well-known/mcp/server-card.json` path is a `warn`. Streamable HTTP remotes declared by a catalog card are probed first as MCP endpoints.
- **auth.md** stage checks are bonus only (emerging proposal) and require each stage to appear in the file. OAuth PRM / AS metadata must be valid JSON with the expected fields; bearer and scope checks read them.
- **OpenAPI inspection** (`v2/openapiInspect.ts`): unique operationIds, JSON request schemas, typed error responses (≥50% of operations), Idempotency-Key, rate-limit headers, versioned URIs, search, cursor pagination, webhooks, problem+json, OpenAPI 3.1. YAML specs are detected but not parsed (`skip`).

### Payments
Only for e-commerce archetypes or commerce signals: ACP, UCP, AP2, x402, MPP.

## Changes from ARS 3.2

- **Gates:** a failed `anti-crawler-challenge-free` or `content-no-js` caps the score at 47.
- **Not observed:** a challenged homepage skips the checks that read its content.
- **llms.txt** is optional: `llms-txt-exists` and `llms-txt-formatting` become bonus checks (formatting drops from 2 to 1 point), soft-404 bodies are rejected, and reachability needs an `href`.
- **New bonus checks:** `markdown-alternate-link`, `mcp-protocol-modern`, `mcp-server-card`. The registry has 132 checks.
- **MCP probe** speaks 2026-07-28 (`server/discover`) and falls back to `initialize`. `mcp-wire-compatibility` now means a modern server that also accepts a legacy `initialize`.
- **OpenAPI** is found through `Link` headers, the API catalog and homepage links before standard paths; `api-catalog-rfc9727` requires a valid linkset.
- **Server Cards** are found where the final SEP-2127 puts them.

ARS 3.2 scores are not comparable with 3.3.

## Changes from ARS 3.1 (in 3.2)

- Checks pass only on observed evidence; MCP, OpenAPI, auth.md, llms.txt link and bot-challenge checks rewritten accordingly.
- Registry owns points and bonus flags; no partial credit for `warn`.
- Legacy SSE transport and the 8 auth.md stage checks moved to bonus.
- `mcp-inchannel-signalling` removed (duplicate of `mcp-error-reporting`); registry is 129 checks.
- 2026-07-28 wire-form support requires the server to negotiate that version.
- MCP servers at the root of `mcp.` subdomains are discovered.
- Evidence coverage and low-evidence layers reported on every scan.
- Grades and bands unified.
- Auth-gated MCP detection requires a JSON-RPC envelope or an RFC 9728 `resource_metadata` challenge.
- Unreachable homepages and incomplete soft-404 canaries produce `skip`, not `fail` / `warn` / `pass`.
- A failed probe suite fails the scan (`PROBES_FAILED`) instead of falling back to a discovery-only score.
- Scans run with an explicit archetype override are stored as history only and never replace a company's latest score.

ARS 3.1 and earlier scores are not comparable with 3.2. Scorecard pages flag older scans and offer a rescan.

## ars-3.2.1

Same rubric, registry and weights as `ars-3.2.0`. Two Discovery checks that were previously excluded are now measured: `mcp-registry-listed` (official MCP Registry) and `skills-sh-listed` (skills.sh), as described under Discovery. `npm-sdk-package` is `skip` instead of `warn` when the npm registry does not answer (a 404 is still `warn`), and the Wikidata and npm lookups wait 5 s instead of 1.5 s. `brand-search-accuracy` and `agentic-search-specific` now report `skip` instead of `na` (still excluded). Because measured checks changed, `ars-3.2.1` scores are not compared with `ars-3.2.0` scores.

## Known limitations

- **No outcome validation** (see top). This includes the gate cap of 47 and the layer weights.
- **Single-sample measurements:** latency and availability come from one request per URL.
- **Keyword heuristics:** auth.md stage detection and WebMCP detection match keywords and can be gamed.
- **Registry availability:** registry checks depend on the MCP Registry and skills.sh answering in time; when they do not, the check is skipped, so the same site can show a skipped or a measured result on different scans. skills.sh search is not a versioned public API.
- **GitHub owner match:** matching a brand to a GitHub owner of the same name assumes the brand owns that GitHub account.
- **OpenAPI discovery:** specs are followed from `Link` headers, the API catalog and homepage links, but not from llms.txt or deeper pages.
- **Endpoint choice:** when several MCP candidates respond, the first to answer is used.
- **Auth-gated MCP without RFC 9728:** a gated MCP server that answers 401 with neither a JSON-RPC body nor `resource_metadata=` is not detected.
- **Absent MCP weighs heavily:** for API and docs archetypes, a site without an MCP server or OpenAPI spec typically scores 0 on most of the 35-point usability layer. This is intended by the current weights but is a policy choice worth revisiting.
- **Archetype drives rubric:** a docs host whose MCP server is a product (action) server is judged by the docs rubric (e.g. auth-gated MCP is a `warn`).
