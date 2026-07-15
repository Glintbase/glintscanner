/**
 * Scoring module — ARS 1.0 (SPEC-06).
 */

export interface ScoreDimension {
  name: string;
  score: number;
  maxScore: number;
  description: string;
  observations: string[];
}

export {
  calculateARS,
  calculateScoreDimensions,
  ARS_VERSION,
  ARS_WEIGHTS,
  arsWeightsSum,
  type ArsInput,
  type ArsResult,
  type ArsDimensionKey,
} from './ars';
