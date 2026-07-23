/**
 * Glintscanner core public API (SPEC-09).
 *
 * Import path (interim): `@/lib/scanner/core` or relative from CLI.
 * Future: `@glintbase/scanner-core` package.
 */

export { runScan, type ScanOptions, type ScanResult, type RunScanHooks, type ScanProgressEvent } from './runScan';
export { formatScanMarkdown } from './reportMarkdown';
export { checkReachability, type ReachabilityResult } from './reachability';
export { parseSpec, type SpecType, type SpecParseResult } from './parseSpec';
export { ARS_VERSION, calculateARS } from '../v2/ars';
export { validateScanUrl } from '../v2/urlPolicy';
export { scoreBand, scoreBandLabel } from '../shared/scoreBand';
