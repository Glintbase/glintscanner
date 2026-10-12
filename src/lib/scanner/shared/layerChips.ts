/**
 * Layer chips for share images, derived only from a persisted ARS scorecard.
 * No scorecard layers -> no chips (never inferred from the overall score).
 */

export interface LayerChip {
  label: string;
  earned: number;
  max: number;
  /** True when at least half of the layer's base points were earned. */
  passed: boolean;
}

const LAYER_CHIP_LABELS: Array<[key: string, label: string]> = [
  ['discovery', 'Discovery'],
  ['access', 'Access'],
  ['usability', 'Usability'],
  ['payments', 'Payments'],
];

export function layerChipsFromChecks(checks: unknown): LayerChip[] {
  const layers = (checks as any)?.scorecard?.layers;
  if (!layers || typeof layers !== 'object') return [];
  const chips: LayerChip[] = [];
  for (const [key, label] of LAYER_CHIP_LABELS) {
    const layer = layers[key];
    if (!layer || layer.applicable === false) continue;
    const earned = Number(layer.baseEarned);
    const max = Number(layer.baseMax);
    if (!Number.isFinite(earned) || !Number.isFinite(max) || max <= 0) continue;
    chips.push({ label: `${label} ${earned}/${max}`, earned, max, passed: earned / max >= 0.5 });
  }
  return chips;
}
