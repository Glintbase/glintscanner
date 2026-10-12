/**
 * ARS 3.0 Check Taxonomy & Scorecard Type Definitions
 * Specification: GLINTBASE_AUDIT_3_0_UPGRADE_SPEC.md & Master Implementation Plan
 */

import type { ArchetypeProfile } from '../archetype';

export type LayerId = 'discovery' | 'access' | 'usability' | 'payments';
export type CheckTier = 'required' | 'recommended' | 'emerging' | 'beta';
export type CheckKind = 'product' | 'docs' | 'generic' | 'ecommerce';
export type EvaluatorMode = 'static_ast' | 'live_probe' | 'both';
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'na' | 'skip';
export type ArsGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface CheckRemediation {
  title: string;
  file: string;
  diffSnippet: string[];
  fixCommand: string;
  mcpPrompt?: string;
}

export interface CheckDefinition {
  id: string;
  name: string;
  layer: LayerId;
  points: number;
  isBonus: boolean;
  tier: CheckTier;
  targetKind: CheckKind;
  evaluatorMode: EvaluatorMode;
  description: string;
  remediationId?: string;
}

export interface CheckResult {
  checkId: string;
  name?: string;
  layer?: LayerId;
  status: CheckStatus;
  earnedPoints: number;
  maxPoints: number;
  isBonus: boolean;
  message: string;
  evidence?: Record<string, any>;
  remediation?: CheckRemediation;
}

export interface LayerScoreSummary {
  layer: LayerId;
  name: string;
  baseEarned: number;
  bonusEarned: number;
  totalEarned: number;
  baseMax: number;
  statusText: string;
  applicable: boolean;
  /** Share (0-1) of the layer's registered base points that this scan could verify. */
  coverage: number;
  /** True when coverage is below MIN_LAYER_COVERAGE: the layer score rests on too little evidence. */
  lowConfidence: boolean;
  checks: CheckResult[];
}

/** How much of the rubric a scan actually measured. */
export interface ScanEvidenceSummary {
  /** False when the target's homepage never answered; such scans must not be scored. */
  targetReachable: boolean;
  checksRegistered: number;
  /** Checks with a pass / warn / fail verdict (na and skip excluded). */
  checksEvaluated: number;
  /** Verified base points / registered base points across applicable layers (0-1). */
  baseCoverage: number;
  lowConfidenceLayers: LayerId[];
}

export interface RemediationSummary {
  id: string;
  layer: LayerId;
  severity: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
  fixCommand: string;
  mcpPrompt?: string;
  targetFile: string;
  diffSnippet?: string;
}

export interface CriticalVulnerability {
  id: string;
  name: string;
  severity: 'critical' | 'high';
  description: string;
  impact: string;
  mcpFixPrompt: string;
  cliFixCommand: string;
}

export interface SimulationResult {
  passed: boolean;
  durationMs: number;
  summary: string;
  metrics: {
    ragNavigationSteps: number;
    authStagesResolved: number;
    toolsVerified: number;
    tokenUsageEstimate: number;
  };
  details: string[];
}

export interface ArsPillarSummary {
  score: number;
  grade: ArsGrade;
  description: string;
}

export interface Ars3Scorecard {
  /** Scoring model version; see src/lib/scanner/version.ts */
  version: string;
  spec?: 'ars' | 'strict' | 'core';
  score: number;
  grade: ArsGrade;
  gradeLabel: string;
  archetype: ArchetypeProfile;
  baseEarned: number;
  bonusEarned: number;
  totalEarned: number;
  baseDenominator: number;
  activeDenominator: number;
  /** Decoupled Two-Pillar Standard (ARS 3.1) */
  pillars?: {
    discoverability: ArsPillarSummary;
    runtimeErgonomics: ArsPillarSummary;
  };
  layers: {
    discovery: LayerScoreSummary;
    access: LayerScoreSummary;
    usability: LayerScoreSummary;
    payments: LayerScoreSummary;
  };
  results: CheckResult[];
  remediations: RemediationSummary[];
  evidence?: ScanEvidenceSummary;
  criticalVulnerabilities?: CriticalVulnerability[];
  simulation?: SimulationResult;
  durationMs?: number;
  aiEvaluations?: Record<string, any>;
  intelligence?: string;
}
