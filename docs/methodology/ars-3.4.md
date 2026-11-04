# Agent Readiness Score (ARS) 3.4 — Methodology

**Status:** release candidate (branch `feat/ars-3.4`); becomes active when `ars-3.4.0` is deployed, superseding [ARS 3.3](./ars-3.3.md)
**score_version:** `ars-3.4.0` (defined in `src/lib/scanner/version.ts`; see [Changes from ARS 3.3](#changes-from-ars-33))
**Implementation:** `src/lib/scanner/v2/probes/` (entry: `runArs3Probes`, called by `runScan`)
**Check registry:** `src/lib/scanner/v2/probes/registry.ts`

## What the score is, and what it is not

ARS 3.4 measures **which agent-readiness signals a product publicly exposes and whether they work when probed**: machine-readable docs, specs, MCP servers, auth metadata, and content that agents can read without a browser.

It is **not yet validated as a predictor of agent task success**. No study in this repo correlates ARS with measured agent outcomes. Until that exists, present ARS as "readiness signals present and verified", not "agents will succeed". ARS 3.4 changes no weights; weight changes wait for outcome data (ARS 3.5).

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
- **New in 3.4:** every check in the registry can now return `pass`. A check that the scanner could never measure was removed instead of being carried as a permanent `na` (see [The notProbed audit](#the-notprobed-audit-s7)).

## Registry

The registry is the single source of truth for each check's **points** and **bonus** status; probes only decide the status (`alignWithRegistry` in `probes/index.ts` enforces this). It holds **124 checks** (137 in ARS 3.3, minus 15 removed, plus 2 new reported checks):

| Layer | Checks | Base checks (points) | Bonus checks (points) |
|---|---:|---:|---:|
| Discovery | 14 | 7 (9) | 7 (12) |
| Access | 43 | 30 (46) | 13 (17) |
| Usability | 61 | 23 (40) | 38 (64) |
| Payments | 6 | 0 | 6 (16) |

Layer base scores are a share of the *verifiable* base points (see Scoring), so removing never-measured checks does not change any layer weight. It does raise evidence coverage: in ARS 3.3, Discovery registered 21 base points of which at most 8 could ever be measured on a URL scan.

Every scan still reports how many checks it actually measured (see *Evidence coverage*); publish that number, not the registry size.

## Scoring

Unchanged from ARS 3.3.

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
   | `content-no-js` | The homepage has under 300 characters of prose without JavaScript and relies on scripts to render (an app root, a noscript notice, or far more script than text) |

   These are the two failures that stopped retrieval outright in AgentReady.org's controlled experiment (19 configurations of one docs site). The cap value is a policy choice.

### Grades and bands

Defined once in `src/lib/scanner/shared/scoreBand.ts`.

| Score | Grade | Band |
|---:|:---:|---|
| 95–100 | A+ | Agent-Native |
| 86–94 | A | Agent-Native |
| 70–85 | B | AI-Friendly |
| 48–69 | C | AI-Capable |
| 28–47 | D | Legacy |
| 0–27 | F | Legacy |

### Where the weights come from

The four layers, their base weights and the grade cut-offs follow the structure ora.ai publishes at <https://ora.ai/methodology>. ARS adds the archetype weights, evidence-only scoring and evidence coverage. The weights are not validated against agent outcomes.

## Measurement kinds

Every check result carries a `measurement` (`probes/measurement.ts`): `live` (the verdict depends on how the target behaved), `content` (a fetched artifact was parsed), `presence` (only existence is known) or `declared` (local codebase context). `pillars.runtimeMeasured` scores usability base checks with `live` or `content` evidence only. New in 3.4: `mcp-skills-extension`, `mcp-apps-ui-quality` and `api-graphql-schema` are `live`; `api-sandbox-environment` and `mpp-support` move from `presence` to `content` (both now parse a document).

## Reported, unscored checks

Six checks have 0 points and are reported only:

- `mcp-logging-notifications`: the Logging capability, deprecated by MCP 2026-07-28 (SEP-2577). (`mcp-sampling-support` and `mcp-roots-support` were removed in 3.4: both are client capabilities a server scan can never observe.)
- `poppy-discovery`: a valid Personal Agent Protocol `/.well-known/poppy.json` (draft 0.2). Emerging: not scored until a second large vendor adopts it.
- `robots-edge-consistency`: `warn` when robots.txt allows AI agents but the edge challenged or refused the scanner.
- **`content-signal-consistency`** (new, S1): see Access.
- **`mcp-skills-extension`** (new, S3): see Usability.

## Evidence coverage

Every scorecard includes `evidence.checksEvaluated` / `evidence.checksRegistered`, `evidence.baseCoverage` (verified ÷ registered base points across scored layers) and per-layer `coverage` / `lowConfidence` (under 50% of the layer's registered base points verified). Because 3.4 removes never-measured base checks, coverage numbers are higher than in 3.3 for the same evidence; do not compare coverage across versions either.

## `.well-known` control path (S5)

Many sites answer every path under `/.well-known/` with the same response: an SPA shell, a marketing page, or a JSON stub such as `{}`. A check that accepted any non-HTML 200 passed on it. In ARS 3.3 the UCP and AP2 payment checks did exactly that.

Since 3.4, before trusting a `.well-known` response the scanner requests a random path on the same origin, `/.well-known/glintbase-control-<12 hex>`, once per origin per scan (`v2/wellKnown.ts`). If the control answers 2xx with a body, the origin has a catch-all, and a well-known response is rejected (treated as not found) when:

- the control was HTML and the response is HTML, or
- the response body equals the control body after normalisation (the requested path removed, runs of 8+ hex characters and all digit runs collapsed, whitespace collapsed), so request ids and timestamps don't hide a stub.

If the control 404s (the common case), nothing changes. A real document that differs from the catch-all still passes.

It applies to: `/.well-known/ard.json`, `ai-catalog.json` (and the root `/ai-catalog.json` fallback), `mcp.json`, `mcp/manifest.json`, `mcp/server-card.json`, `poppy.json`, `api-catalog`, `security.txt`, `auth.md`, `oauth-protected-resource`, `oauth-authorization-server`, `ucp` and `ap2`.

## What each layer probes

### Discovery

robots.txt AI-crawler policy, ARD / AI catalog files, Wikidata official-website claim (P856), an npm package under the brand name that links back to the brand, and registry listings (`mcp-registry-listed`, `skills-sh-listed`; unchanged from 3.3, see that document). Agent rules files are only checked for local codebases.

**ARD (S2).** `ard-catalog` (1, base) follows the two IETF Internet-Drafts of 2026-10-30 (individual drafts, no IETF endorsement):

- *draft-jimenez-dawn-ard-initial-contact-00* (how a client finds the manifest): `GET https://<domain>/.well-known/ard.json`, following **at most one redirect** (a redirect to a further redirect means "no manifest", §4.3.1); if that yields nothing, `HEAD https://<domain>/` and read the `ard` link relation from the `Link` header **whatever the status code** (§4.3.2), again after at most one redirect; a publisher that cannot set headers may use `<link rel="ard">` in the root page, which the scanner reads from a GET of the root as the last step. DNS discovery (SVCB at `_index._agents.<domain>`, DNS-SD) is not probed.
- *draft-bu-dawn-ard-discovery-00* (the manifest): media type `application/ard+json` (§8.1.1); a top-level `entries` array (§3.6); each entry has `identifier`, `displayName` and `type`, and exactly one of `url` or `data` (§3.2.1).

`ard-catalog` passes on a manifest with an `entries` array whose entries are all well formed. The media type is reported in the message and evidence but not required, because static hosts commonly serve `.json` as `application/json`. A pre-draft file (ARD v0.91: `urn:air` ids, an `endpoints` object, no `entries`) no longer counts. **Fallback kept:** an AI Catalog at `/.well-known/ai-catalog.json` or `/ai-catalog.json` still passes `ard-catalog`, as in 3.3. `ard-entries-valid` (2, bonus) passes when the manifest is valid and has at least one entry, and is `warn` when a manifest exists but is not valid.

**Removed in 3.4:** `brand-search-accuracy`, `agentic-search-specific`, `agentic-search-usecase`, `chatgpt-app-listed` (see the audit).

### Access

Zero-JS content, soft-404 canary, `llms.txt`, markdown negotiation, HTTP hygiene headers and bot challenges, as in 3.3 (llms.txt rules, OpenAPI discovery, API catalog and the "not observed" rule are unchanged; see the 3.3 document). Changes:

- **`markdown-alternate-link` (S4)** (1, bonus) passes when the homepage declares a Markdown alternate either as `<link rel="alternate" type="text/markdown" href=…>` or as a response header `Link: <…>; rel="alternate"; type="text/markdown"` (the discovery form llms.txt v2 proposes), and the target resolves to non-HTML content. Each declared alternate is tried; the message says which form resolved.
- **`content-signal-consistency` (S1)** (0, reported). [Content Signals](https://contentsignals.org) (`search`, `ai-input`, `ai-train` = `yes` / `no`) can be stated in robots.txt (`Content-Signal:` inside a user-agent group) and as a `Content-Signal` HTTP response header, which some CDNs add by default (Cloudflare's Markdown for Agents sends `ai-train=yes, search=yes, ai-input=yes` on Markdown responses). The check compares three surfaces: the robots.txt values for `User-agent: *` (groups for named agents are kept in the evidence but not compared, because the scanner is not a named agent), the header on the HTML response, and the header on the `Accept: text/markdown` response of the same URL.
  - `warn` (**conflict**): two surfaces give different values for the same key, e.g. robots.txt `ai-train=no` and the Markdown header `ai-train=yes`. The HTML and Markdown headers can also conflict with each other.
  - `pass`: **agree** (robots.txt and a header both declare, with no disagreement), **header-only** or **robots-only** (only one side declares; that is not a contradiction).
  - `na` (**none**): no Content-Signal for all agents anywhere. `skip`: the homepage was not observed (blocked or unreachable).
  - Reported only because a header may be a CDN default the site never chose, and because no AI company is known to honour either form. It measures what a site says, not what anyone does with it.
- **`markdown-table-syntax` (S7, implemented)** (1, base): GFM pipe tables in the Markdown the site serves (the `Accept: text/markdown` response, else the `.md` twin), outside code fences, must have the same number of columns in the header, the delimiter row and every body row (`\|` is an escaped pipe). `na` when no Markdown is served or it has no tables.
- **`image-alt-prose` (S7, implemented)** (1, base): at least 90% of the homepage's non-decorative `<img>` elements carry an `alt` attribute. Decorative images follow WCAG and are excluded: `alt=""`, `role="presentation"` / `"none"`, `aria-hidden="true"`, and 1×1 tracking pixels. `na` without non-decorative images; homepage-derived, so `skip` when the homepage was not observed. The 90% threshold is a policy choice. The check cannot tell whether alt text is descriptive, only whether it is there.

**Removed in 3.4:** `http2-support`, `pagination-rel-links`, `dns-caa-record`, `relative-link-resolution`, `plain-text-accessible`.

### Usability

MCP discovery, the dual-era live probe, tool-schema checks, Server Cards, auth.md stages, OAuth metadata and OpenAPI inspection are unchanged from 3.3 (see that document). Changes:

- **`mcp-skills-extension` (S3)** (0, reported). [SEP-2640](https://modelcontextprotocol.io/seps/2640-skills-extension) (Skills Extension, Final) defines the extension `io.modelcontextprotocol/skills`, declared under `capabilities.extensions` (SEP-2133); declaring it commits a server to `skills/list` and `skills/get`. When the handshake result declares the extension, the scanner sends one `skills/list` (in the server's era) and the check passes when the result has a `skills` array (it may be empty: the SEP allows partial or empty listings). `warn` when the extension is declared but `skills/list` fails; `na` when it is not declared. The message and evidence always list every extension identifier the server declares. Reported, not scored: SDK and host support is still landing. No skill files are fetched.
- **WebMCP (S6).** In 3.3, `webmcp`, `webmcp-model-context` and `webmcp-js-registration` looked for `modelContext` / `registerTool(` in the homepage HTML only. Cloudflare's WebMCP integration, which Commerce.com turned on for its storefronts, injects at the edge `<script type="module" src="/.webmcp/bridge.js" data-packs="…" data-mcp-url="/api/mcp">`; the page itself never mentions `modelContext`, so 3.3 reported these checks as `na`. On 2026-11-04 we confirmed this on Commerce.com demo storefronts (e.g. `cornerstone-light-demo.mybigcommerce.com`): 3.3 found nothing, 3.4 passes all three via `/.webmcp/bridge.js`. The scanner now reads up to three same-site scripts whose `src` names `webmcp` or whose tag carries `data-mcp-url` / `data-packs`; a script that mentions `modelContext` counts as model-context evidence and one that also calls `registerTool(` counts as a JS registration. Still a keyword match on the script (see Known limitations); tools themselves are not enumerated, because that needs a browser.
- **MCP Apps (S7, implemented).** The MCP Apps extension (`io.modelcontextprotocol/ui`, spec 2026-01-26) lets a tool point at an HTML UI resource with `_meta.ui.resourceUri` (`ui://` scheme; the deprecated flat key `_meta["ui/resourceUri"]` is also read).
  - `mcp-app-registry` (4, bonus): a tool in `tools/list` declares a `ui://` resource.
  - `mcp-apps-ui-quality` (4, bonus): the scanner reads the first declared UI resource once with `resources/read` (a read, not a tool call) and passes when it is served as `text/html;profile=mcp-app` with content.
  - `mcp-view-csp` (4, bonus): that resource declares the external origins it needs in `_meta.ui.csp` (`connectDomains`, `resourceDomains`, `frameDomains` or `baseUriDomains`). The 3.3 description ("CSP frame-ancestors permits chatgpt.com…") did not match the MCP Apps spec, where hosts enforce the declared CSP.
- **OpenAPI and API checks (S7, implemented).**
  - `api-bulk-batch-operations` (1, bonus): a path segment or `operationId` names `batch` or `bulk`.
  - `api-sandbox-environment` (2, bonus): a `servers[]` entry whose URL or description names sandbox, test, testnet, testing, staging or mock.
  - `api-graphql-schema` (1, bonus): a POST of `{ __schema { queryType { name } } }` to `/graphql`, then `/api/graphql`. `pass` with a schema, `warn` when a GraphQL endpoint answers but introspection is disabled, `na` when there is none (a JSON 404/405 is not a GraphQL endpoint).

**Removed in 3.4:** `mcp-sampling-support`, `mcp-roots-support`, `mcp-ssrf-guard`, `api-sdk-documentation`, `api-grpc-reflection`, `api-error-actionability`.

Safety is unchanged: the prober calls a real tool only if the server annotates it `readOnlyHint: true` and it takes no required arguments. The new requests are read-only protocol calls (`skills/list`, one `resources/read`) and a GraphQL introspection query.

### Payments

Only for e-commerce archetypes or commerce signals; OR-scoring as before.

- **`mpp-support` (S7, implemented)** (2, bonus): Machine Payments Protocol. Passes when the site's OpenAPI document has an operation with `x-payment-info` offers (each with `intent` `charge` or `session` and a `method`) and a `402` response (the MPP payment-discovery draft, `draft-payment-discovery-01` in `tempoxyz/mpp-specs`), or when the payment probe (`/api/payment`) answers `402` with `WWW-Authenticate: Payment` (`draft-ryan-httpauth-payment`). A `402` with a `Payment` challenge now counts as MPP, not x402.
- UCP and AP2 now go through the `.well-known` control (S5).

## The notProbed audit (S7)

ARS 3.3 registered 24 checks that its probes could never pass (the website's catalog marks them `notProbed`: every status the probe emits is `na` or `skip`, or detection was hard-coded off). Each was either given a real probe or removed. Rules for the decision: the evidence must be obtainable from plain HTTP without a browser, a search API or a paid service; it must plausibly matter to an agent using the site; and probing it must be safe for a third-party site.

| # | Layer | Check | Pts | Decision | Reason |
|---:|---|---|---|---|---|
| 1 | Discovery | `chatgpt-app-listed` | 2 bonus | **Removed** | No public, stable API for the ChatGPT app directory; a listing can't be verified. |
| 2 | Discovery | `brand-search-accuracy` | 3 base | **Removed** | Needs a search API; results vary by engine, location and time, so not reproducible. Was `skip` on every scan. |
| 3 | Discovery | `agentic-search-specific` | 3 base | **Removed** | Same as above. |
| 4 | Discovery | `agentic-search-usecase` | 6 base | **Removed** | Held at `na` since ARS 3.0 "pending noise reduction"; same search-API problem. |
| 5 | Access | `http2-support` | 1 base | **Removed** | Measurable (TLS ALPN), but HTTP/2 has no shown effect on an agent's ability to read a site. |
| 6 | Access | `pagination-rel-links` | 1 base | **Removed** | Needs a collection page the scanner can't identify; OpenAPI pagination is already `api-pagination-cursor`. |
| 7 | Access | `dns-caa-record` | 1 base | **Removed** | Certificate-issuance hygiene, not agent readiness. |
| 8 | Access | `markdown-table-syntax` | 1 base | **Implemented** | Parses the Markdown the site already serves. |
| 9 | Access | `relative-link-resolution` | 1 base | **Removed** | Overlaps `llms-txt-links-resolve`, which already resolves relative links. |
| 10 | Access | `image-alt-prose` | 1 base | **Implemented** | Read from the homepage HTML. |
| 11 | Access | `plain-text-accessible` | 1 base | **Removed** | Duplicates `markdown-negotiation`, `markdown-url-fallback` and `llms.txt`. |
| 12 | Usability | `mcp-app-registry` | 4 bonus | **Implemented** | Read from `tools/list` (`_meta.ui.resourceUri`). |
| 13 | Usability | `mcp-apps-ui-quality` | 4 bonus | **Implemented** | One `resources/read` of the declared UI resource; MIME type check. |
| 14 | Usability | `mcp-view-csp` | 4 bonus | **Implemented** | `_meta.ui.csp` on that resource; definition corrected to the MCP Apps spec. |
| 15 | Usability | `mcp-sampling-support` | 0 | **Removed** | A client capability; a server scan can't observe it. Deprecated (SEP-2577). |
| 16 | Usability | `mcp-roots-support` | 0 | **Removed** | Same as above. |
| 17 | Usability | `api-bulk-batch-operations` | 1 bonus | **Implemented** | From the OpenAPI document. |
| 18 | Usability | `api-sandbox-environment` | 2 bonus | **Implemented** | From the OpenAPI `servers` list. |
| 19 | Usability | `api-sdk-documentation` | 1 base | **Removed** | No objective definition of "SDK documentation"; code samples are already `api-code-samples` and `api-curl-examples`. |
| 20 | Usability | `api-graphql-schema` | 1 bonus | **Implemented** | Read-only introspection query at `/graphql` and `/api/graphql`. |
| 21 | Usability | `api-grpc-reflection` | 1 bonus | **Removed** | Needs an HTTP/2 gRPC client and a known endpoint; no discovery convention to find one. |
| 22 | Usability | `mcp-ssrf-guard` | 2 bonus | **Removed** | Testing it means sending private-network URLs to third-party servers, which the scanner will not do. |
| 23 | Usability | `api-error-actionability` | 2 bonus | **Removed** | No objective test beyond `api-error-schemas`, `api-rfc7807-problem-details` and `mcp-error-reporting`. |
| 24 | Payments | `mpp-support` | 2 bonus | **Implemented** | MPP discovery (`x-payment-info`) and the `Payment` 402 challenge are now specified. |

Result: 9 implemented, 15 removed. Removed base points: Discovery 12 (of 21), Access 5 (of 51), Usability 1 (of 41). Points of kept checks are unchanged. A removed check can come back in a later version with a real probe.

## Scanner identity

Unchanged from `ars-3.3.1`: scored requests send `Mozilla/5.0 (compatible; GlintbaseScanner/3.5; +https://glintbase.dev/research/bot)`. The version token in the user agent stays `3.5` in this release so that identity, a measured input, does not change alongside the rubric. Requests are not signed (Web Bot Auth); S8 waits for the signed-agent study (E6).

## Changes from ARS 3.3

- **S5:** `.well-known` responses are checked against a random control path; catch-all HTML and JSON stubs no longer pass (UCP and AP2 passed on them in 3.3).
- **S2:** `ard-catalog` follows the IETF ARD drafts of 2026-10-30 (well-known with one redirect, `Link: rel="ard"`, `<link rel="ard">`, the `entries` shape); pre-draft `urn:air` files no longer pass; the AI Catalog fallback is kept. `ard-entries-valid` uses the draft's entry rules.
- **S1:** new reported check `content-signal-consistency`.
- **S3:** new reported check `mcp-skills-extension`; declared MCP extensions are listed.
- **S4:** `markdown-alternate-link` also accepts a `Link` header.
- **S6:** WebMCP checks follow same-site WebMCP scripts, so edge-injected WebMCP (Cloudflare, Commerce.com) is detected.
- **S7:** 9 never-probed checks implemented, 15 removed; registry 137 → 124.
- **Redirects:** a response still redirecting after the redirect limit is a failed fetch. In 3.3 the final 3xx was treated as a successful response.
- Product and packages 3.6.0.

Because rules and measured inputs changed, **`ars-3.4.0` scores are not compared with `ars-3.3.x` scores**, and neither are coverage figures.

## Known limitations

- **No outcome validation** (see top). This includes the gate cap, the layer weights, and the thresholds introduced here (90% alt coverage).
- **Single-sample measurements:** latency and availability come from one request per URL.
- **Keyword heuristics:** auth.md stage detection and WebMCP detection (now including the bridge script) match keywords and can be gamed.
- **Catch-all detection is one control request:** a site whose catch-all varies by path in ways the normalisation does not remove could still pass a well-known check; a site whose catch-all is byte-identical to a real document would be rejected (unlikely, not observed).
- **ARD:** DNS-based discovery (SVCB, DNS-SD) is not probed; the drafts are individual submissions and may change, including the media type and relation names (the initial-contact draft lists them as open issues).
- **Content Signals:** only the `*` group is compared; signals in named-agent groups are not. Only the homepage URL is compared, not deeper pages.
- **MCP Apps:** only the first declared UI resource is read.
- **GraphQL:** only `/graphql` and `/api/graphql` on the scanned origin are tried.
- **Registry availability, GitHub owner match, OpenAPI discovery, declared-not-verified identity, one network vantage point, endpoint choice, auth-gated MCP without RFC 9728, the weight of an absent MCP server, archetype-driven rubric:** unchanged from ARS 3.3.
