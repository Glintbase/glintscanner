/**
 * Unified ARS score bands (SPEC-06 / SPEC-08).
 * Single source of truth for home, report, OG images, badges, leaderboard.
 */
export type ScoreBandKey = 'elite' | 'friendly' | 'capable' | 'legacy';

export interface ScoreBand {
  key: ScoreBandKey;
  /** Short label for chips / OG */
  label: string;
  /** Longer label for report hero */
  displayLabel: string;
  /** Tailwind text color utility (app theme) */
  textClass: string;
  /** Tailwind border utility */
  borderClass: string;
  /** Glow shadow class for hero cards */
  glowClass: string;
  /** Hex for SVG / OG canvas */
  colorHex: string;
  min: number;
  max: number;
}

const BANDS: ScoreBand[] = [
  {
    key: 'elite',
    label: 'Agent-Native',
    displayLabel: 'Elite Agent-Native',
    textClass: 'text-success',
    borderClass: 'border-success',
    glowClass: 'shadow-[0_0_60px_rgba(16,185,129,0.3)]',
    colorHex: '#10B981',
    min: 90,
    max: 100,
  },
  {
    key: 'friendly',
    label: 'AI-Friendly',
    displayLabel: 'AI-Friendly Ecosystem',
    textClass: 'text-[#22D3EE]',
    borderClass: 'border-[#22D3EE]',
    glowClass: 'shadow-[0_0_60px_rgba(34,211,238,0.2)]',
    colorHex: '#22D3EE',
    min: 70,
    max: 89,
  },
  {
    key: 'capable',
    label: 'AI-Capable',
    displayLabel: 'AI-Capable Ecosystem',
    textClass: 'text-warning',
    borderClass: 'border-warning',
    glowClass: 'shadow-[0_0_60px_rgba(245,158,11,0.2)]',
    colorHex: '#F59E0B',
    min: 40,
    max: 69,
  },
  {
    key: 'legacy',
    label: 'Legacy Ecosystem',
    displayLabel: 'Legacy Ecosystem',
    textClass: 'text-danger',
    borderClass: 'border-danger',
    glowClass: 'shadow-[0_0_60px_rgba(239,68,68,0.3)]',
    colorHex: '#EF4444',
    min: 0,
    max: 39,
  },
];

/** Return the band for a 0–100 score. */
export function scoreBand(score: number): ScoreBand {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  for (const band of BANDS) {
    if (s >= band.min && s <= band.max) return band;
  }
  return BANDS[BANDS.length - 1];
}

/** Tailwind text class for score display. */
export function scoreBandTextClass(score: number): string {
  return scoreBand(score).textClass;
}

/** Short label only (e.g. "AI-Friendly"). */
export function scoreBandLabel(score: number): string {
  return scoreBand(score).label;
}

/** Hex color for badges / OG. */
export function scoreBandColorHex(score: number): string {
  return scoreBand(score).colorHex;
}

/** Badge SVG color (same thresholds as scoreBand). */
export function badgeColorForScore(score: number): string {
  return scoreBandColorHex(score);
}

export const SCORE_BANDS = BANDS;
