# ARS 3.4 dry-run rescan: `ars-3.3.1` vs `ars-3.4.0`

**Run:** 2026-11-14, from one machine (local network), both versions back to back, read-only (`scripts/rescan-leaderboard.ts` without `--apply`; nothing was saved).
**Baseline:** `ars-3.3.1` from `main` (`--force`). **New:** `ars-3.4.0` from `feat/ars-3.4`. Same machine, same day, so the comparison is not confounded by network vantage; the stored leaderboard scores were measured from the hosted scanner and are listed only for reference.
**Scope:** 108 leaderboard companies; 106 scored on both versions; 2 failed on at least one (listed in `scores.csv`).

Per the methodology, 3.4 scores are never published side by side with 3.3 scores. This file exists to review the release before `--apply`.

## Summary

| | `ars-3.3.1` | `ars-3.4.0` |
|---|---:|---:|
| Mean score | 49.7 | 49.8 |
| Median score | 47 | 47 |
| Mean base coverage | 55% | 66% |
| Grades | A+ 0, A 1, B 26, C 18, D 45, F 16 | A+ 0, A 1, B 27, C 17, D 47, F 14 |

- **Median change:** +0 points (mean +0.1).
- **Direction:** 21 up, 76 unchanged, 9 down.
- **Change distribution:** -7: 1, -5: 1, -3: 1, -1: 6, 0: 76, +1: 18, +4: 1, +7: 2.
- **Grade moves:** F → D (2), C → B (1); 103 companies keep their grade.

**Cause of each move** (`cause` column in `scores.csv`): rubric 11, mixed 16, noise 3, none 0, among the 30 companies that moved. *rubric*: only checks whose rules changed in 3.4 moved. *noise*: only checks with unchanged rules moved (latency, a page that timed out once, a robots.txt fetch), i.e. run-to-run variation between two scans a few hours apart. *mixed*: both. *none*: no check with points changed (a rounding effect of bonus or coverage).

Some of the change on any one site is measurement noise (latency, a request that times out once); a ±1 move with no score-moving check change in `scores.csv` is noise, not rubric.

## Reading the results

- **The rubric moves scores very little.** The median change is 0 and only 3 companies change grade. The removed checks were never measured (`na` / `skip`), so dropping them changes no layer's verifiable base points. What they do change is base coverage, 55% → 66% on average, because the registry no longer counts points that could never be earned.
- **The largest rubric effect is `image-alt-prose`** (a 1-point base check): it passes on 52 companies and warns on 11, which explains most +1 / −1 moves. `mcp-app-registry` (warn on 36) is a bonus check, so it costs nothing.
- **The ±4 to ±7 moves are mostly run-to-run variation, not rubric.** On ai.meta.com and imbue.com the robots.txt fetch differed between the two runs. On vercel.com, cognition.ai and bolt.new it was `developer-portal`, whose `/docs` / `/developers` probe has a 2 s timeout. On openai.com it was the soft-404 canary. These checks have the same rules in both versions. The `cause` column marks them.
- **S5 (`.well-known` control):** 7 companies' `/.well-known/api-catalog` turned out to be a catch-all page (vaulted-app-six.vercel.app, windsurf.com, wandb.ai, pxxl.app, moonshot.ai, rewind-stores.com, prembly.com). In 3.3 those were a `warn` ("answers but is not a linkset") and are now `na` (not published). It's a bonus check either way, so scores don't move. No leaderboard company lost a pass to S5.
- **S6 (edge-injected WebMCP):** `webmcp` passes on 7 companies instead of 5. The 2 new ones are ohelenlashes.com and electricwheelchairshop.com, which are storefronts with the edge-injected bridge script.
- **S3:** 2 companies declare `io.modelcontextprotocol/skills` with a working `skills/list`: glean.com and huggingface.co.
- **S1:** 1 company shows a Content-Signal conflict (replicate.com); 17 have consistent signals; 67 declare none.
- **S2:** `ard-catalog` passes on the same 9 companies in both versions (via a draft-shaped manifest or the AI Catalog fallback); none flipped. `ard-entries-valid` (bonus) goes pass → warn on one company, **glintbase.dev itself**: its `/.well-known/ard.json` doesn't meet the draft's entry rules (`identifier`, `displayName`, `type`, exactly one of `url` / `data`). That's a fix for our own site before the release post.
- **S4:** `markdown-alternate-link` newly passes on mintlify.com, ora.ai and zernio.com.
- **Payments is `skip` on all 106** because 105 companies classify as `devtool` and 1 as `docs_kb`, including storefronts such as ohelenlashes.com, electricwheelchairshop.com and anywellshop.com. This is an archetype-classification issue, unchanged from 3.3, and it means `mpp-support` and the S5 effect on UCP/AP2 can't be observed on this leaderboard.

## Biggest movers and why

"Why" lists the checks with points whose status changed between the two runs, most important first (a pass gained or lost, then base checks entering or leaving the verifiable set). Removing never-measured base checks changes no layer's verifiable base, so removals alone don't move scores.

| Company | 3.3.1 | 3.4.0 | Δ | Cause | Score-moving changes |
|---|---:|---:|---:|---|---|
| ai.meta.com | 27 F | 20 F | -7 | noise | robots-ai-policy-quality pass→warn (2 base); robots-oai-searchbot pass→warn (2 bonus) |
| cognition.ai | 27 F | 34 D | +7 | mixed | image-alt-prose na→pass (1 base); developer-portal warn→pass (6 base); response-latency-p95 warn→pass (1 base) |
| imbue.com | 16 F | 23 F | +7 | mixed | robots-ai-policy-quality warn→pass (2 base); robots-oai-searchbot warn→pass (2 bonus); image-alt-prose na→warn (1 base) |
| vercel.com | 82 B | 77 B | -5 | mixed | image-alt-prose na→pass (1 base); developer-portal pass→warn (6 base); response-latency-p95 pass→warn (1 base); mcp-app-registry na→skip (4 bonus) |
| bolt.new | 30 D | 34 D | +4 | mixed | image-alt-prose na→pass (1 base); developer-portal warn→pass (6 base) |
| openai.com | 26 F | 23 F | -3 | mixed | anti-spa-404 pass→fail (2 base); image-alt-prose na→skip (1 base) |
| apple.com | 29 D | 30 D | +1 | noise | response-latency-p95 warn→pass (1 base) |
| arrivl.ai | 40 D | 41 D | +1 | mixed | image-alt-prose na→pass (1 base); response-latency-p95 warn→pass (1 base) |
| aws.amazon.com | 38 D | 39 D | +1 | rubric | image-alt-prose na→pass (1 base) |
| baseten.co | 74 B | 75 B | +1 | mixed | image-alt-prose na→pass (1 base); response-latency-p95 warn→pass (1 base); mcp-app-registry na→warn (4 bonus) |
| cerebrium.ai | 81 B | 80 B | -1 | rubric | image-alt-prose na→warn (1 base); mcp-app-registry na→warn (4 bonus) |
| chipencool-demo.vercel.app | 31 D | 30 D | -1 | mixed | anti-spa-404 pass→skip (2 base); image-alt-prose na→pass (1 base) |

## Check-level changes across paired companies

Status transitions seen on at least 2 companies (removed checks omitted):

- 79 × `mcp-skills-extension`: (new) → na
- 67 × `content-signal-consistency`: (new) → na
- 52 × `image-alt-prose`: na → pass
- 36 × `mcp-app-registry`: na → warn
- 25 × `mcp-app-registry`: na → skip
- 25 × `mcp-apps-ui-quality`: na → skip
- 25 × `mcp-view-csp`: na → skip
- 25 × `mcp-skills-extension`: (new) → skip
- 22 × `image-alt-prose`: na → skip
- 22 × `api-sandbox-environment`: na → warn
- 21 × `content-signal-consistency`: (new) → skip
- 17 × `content-signal-consistency`: (new) → pass
- 14 × `api-bulk-batch-operations`: na → warn
- 11 × `image-alt-prose`: na → warn
- 11 × `response-latency-p95`: warn → pass
- 8 × `api-bulk-batch-operations`: na → pass
- 7 × `api-catalog-rfc9727`: warn → na
- 4 × `response-latency-p95`: pass → warn
- 4 × `llms-full-txt-present`: na → pass
- 3 × `sitemap-xml-present`: warn → pass
- 3 × `api-graphql-schema`: na → pass
- 3 × `markdown-alternate-link`: na → pass
- 2 × `llms-txt-exists`: na → pass
- 2 × `llms-txt-formatting`: na → pass
- 2 × `llms-txt-links-resolve`: na → pass
- 2 × `auth-md-walkthrough-simulation`: na → pass
- 2 × `oauth-rfc8414-metadata`: na → pass
- 2 × `oauth-rfc9728-prm`: na → pass
- 2 × `auth-bearer-token-support`: na → pass
- 2 × `auth-scoped-permissions`: na → pass
- 2 × `webmcp`: na → pass
- 2 × `webmcp-model-context`: na → pass
- 2 × `mcp-skills-extension`: (new) → pass
- 2 × `markdown-table-syntax`: na → pass
- 2 × `developer-portal`: warn → pass

## New and changed checks on `ars-3.4.0`

- `content-signal-consistency`: na 67, skip 21, pass 17, warn 1
- `mcp-skills-extension`: na 79, skip 25, pass 2
- `ard-catalog`: warn 97, pass 9
- `ard-entries-valid`: na 102, pass 3, warn 1
- `markdown-alternate-link`: na 73, skip 22, pass 11
- `webmcp`: na 99, pass 7
- `markdown-table-syntax`: na 104, pass 2
- `image-alt-prose`: pass 52, skip 22, na 21, warn 11
- `mcp-app-registry`: na 45, warn 36, skip 25
- `mcp-apps-ui-quality`: na 81, skip 25
- `mcp-view-csp`: na 81, skip 25
- `api-bulk-batch-operations`: na 84, warn 14, pass 8
- `api-sandbox-environment`: na 84, warn 22
- `api-graphql-schema`: na 103, pass 3
- `mpp-support`: skip 106
- `ucp-support`: skip 106
- `ap2-support`: skip 106

## Files

- `scores.csv`: one row per company: stored score, local `ars-3.3.1` and `ars-3.4.0` scores and grades, delta, base coverage, and the score-moving check changes.
