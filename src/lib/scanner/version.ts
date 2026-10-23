/**
 * Single source of truth for version identifiers.
 * Bump ARS_SCORE_VERSION whenever scoring rules change, so scores from different
 * rule sets are never compared as if they were equivalent.
 */

/** Product version shared by the web app, CLI and MCP packages. */
export const GLINTBASE_VERSION = '3.4.0';

/** Scoring model version stamped on every scan result (score_version). */
export const ARS_SCORE_VERSION = 'ars-3.3.0' as const;

/** Human-readable name of the current scoring model. */
export const ARS_LABEL = 'ARS 3.3';

export function isCurrentArsVersion(version?: string | null): boolean {
  return version === ARS_SCORE_VERSION;
}

/** Any ARS 3.x scan (3.0, 3.1, 3.2, ...). */
export function isArs3Version(version?: string | null): boolean {
  return typeof version === 'string' && version.startsWith('ars-3.');
}
