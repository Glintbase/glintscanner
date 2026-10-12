/**
 * Targeted re-verification of registry check IDs (CLI `glintbase check`, MCP `recheck_issues`).
 * Results are looked up by exact checkId in the ARS scorecard; there is no
 * substring matching, so "auth" never silently means "auth-md-structure".
 */

import { getCheckById } from './registry';
import type { CheckStatus, CheckResult } from './types';

export interface RecheckResult {
  checkId: string;
  /** False when the id is not in the check registry. */
  known: boolean;
  status: CheckStatus | 'unknown' | 'not_evaluated';
  /** True only for an observed pass. */
  passed: boolean;
  earnedPoints: number;
  maxPoints: number;
  message: string;
}

/** Parses "a, b,c" / ["a","b"] into trimmed, de-duplicated ids ("all" stays as "all"). */
export function parseCheckIds(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(',');
  return Array.from(new Set(parts.map((s) => s.trim()).filter(Boolean)));
}

/** Splits requested ids into registry ids and unknown ids (case-insensitive match on the registry id). */
export function partitionCheckIds(ids: string[]): { known: string[]; unknown: string[] } {
  const known: string[] = [];
  const unknown: string[] = [];
  for (const id of ids) {
    const def = getCheckById(id) || getCheckById(id.toLowerCase());
    if (def) known.push(def.id);
    else unknown.push(id);
  }
  return { known, unknown };
}

export function unknownCheckResult(id: string): RecheckResult {
  return {
    checkId: id,
    known: false,
    status: 'unknown',
    passed: false,
    earnedPoints: 0,
    maxPoints: 0,
    message: `Unknown check id "${id}". Use a registry id such as auth-md-structure, robots-ai-policy-quality or anti-spa-404.`,
  };
}

/** Looks each requested id up by exact checkId in the scorecard results. */
export function recheckFromResults(results: CheckResult[], ids: string[]): RecheckResult[] {
  const byId = new Map(results.map((r) => [r.checkId, r]));
  return ids.map((rawId) => {
    const def = getCheckById(rawId) || getCheckById(rawId.toLowerCase());
    if (!def) return unknownCheckResult(rawId);
    const r = byId.get(def.id);
    if (!r) {
      return {
        checkId: def.id,
        known: true,
        status: 'not_evaluated',
        passed: false,
        earnedPoints: 0,
        maxPoints: def.points,
        message: 'Check is registered but was not evaluated in this scan',
      };
    }
    return {
      checkId: r.checkId,
      known: true,
      status: r.status,
      passed: r.status === 'pass',
      earnedPoints: r.earnedPoints,
      maxPoints: r.maxPoints,
      message: r.message,
    };
  });
}
