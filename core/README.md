# @glintbase/scanner-core

The **ARS 3.3** (Agent Readiness Score) engine behind [scan.glintbase.dev](https://scan.glintbase.dev), packaged for reuse.
It contains the live probes, the check registry, archetype classification, scoring and grade bands, the URL
policy (SSRF guards) and the MCP live prober. The [Glintbase CLI](https://github.com/athertech/glintbase-cli)
(`@glintbase/cli`) scores with this package, so a CLI audit and a web scan of the same site use the same rules.

- ESM only, Node.js 20+, no runtime dependencies (uses the global `fetch`).
- Type declarations included.
- Every scorecard carries `version` (`ars-3.3.0`): never compare scores across score versions.

## Install

```bash
npm install @glintbase/scanner-core
```

## Usage

```ts
import { runArs3Probes, validateScanUrl, getAllChecks, ARS_SCORE_VERSION } from '@glintbase/scanner-core';

const policy = validateScanUrl('example.com', { allowHttp: false });
if (!policy.ok) throw new Error(policy.message);

const scorecard = await runArs3Probes(policy.url!);
console.log(scorecard.score, scorecard.grade, scorecard.version); // e.g. 78 'B' 'ars-3.3.0'
console.log(`${scorecard.evidence?.checksEvaluated}/${getAllChecks().length} checks measured`);
```

Main exports:

| Area | Exports |
| --- | --- |
| Scoring | `runArs3Probes`, `runArs3ProbesDetailed`, `runArs2Probes`, `RunProbesOptions`, `Ars3Scorecard`, `CheckResult`, `LayerScoreSummary`, `ScanEvidenceSummary`, `RemediationSummary` |
| Registry | `ALL_CHECKS`, `getAllChecks`, `getCheckById`, `getChecksForLayer`, `getBonusChecks`, `getChecksForSpec`, `CheckDefinition` |
| Re-checks | `parseCheckIds`, `partitionCheckIds`, `recheckFromResults`, `unknownCheckResult` |
| Archetypes | `classifyArchetype`, `normalizeArchetypeOverride`, `ArchetypeProfile` |
| Bands | `scoreBand`, `scoreBandLabel`, `getArsGrade`, `SCORE_BANDS`, `ARS_GRADE_BANDS` |
| URLs | `validateScanUrl`, `normalizeUrl`, `registrableDomain`, `brandFromHostname`, `deriveCompanySlug` |
| Network | `fetchResource`, `probeMcpServer`, `inspectOpenApi` |
| Full pipeline | `runScan`, `ScanResult`, `formatScanMarkdown` |
| Versions | `GLINTBASE_VERSION`, `ARS_SCORE_VERSION`, `ARS_LABEL` |

`fetchResource` (and therefore every probe) applies the URL policy before any network I/O: private, loopback
and metadata addresses and non-standard ports are refused.

## Development

The source is not duplicated here: `src/index.ts` re-exports `../src/lib/scanner` through the `@scanner`
alias and tsup bundles it into `dist/`.

```bash
npm install
npm run typecheck
npm run build
```

## License

Apache-2.0
