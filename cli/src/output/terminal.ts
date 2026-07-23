/**
 * CLI terminal output — beautiful colored output with score boxes and tables.
 */

import pc from 'picocolors';
import type { ResolvedConfig } from '../config.js';
import { scoreBandLabel } from '@scanner/shared/scoreBand';

function scoreColor(score: number): (s: string) => string {
  if (score >= 90) return pc.green;
  if (score >= 70) return pc.cyan;
  if (score >= 40) return pc.yellow;
  return pc.red;
}

export function printHeader(url: string, config: ResolvedConfig): void {
  console.log('');
  console.log(pc.dim('  Glintbase Scanner v0.1.0 (ARS 1.0.0)'));
  console.log(`  Target: ${pc.bold(pc.white(url))}`);
  const providerStr = config.provider
    ? `${config.provider}${config.model ? ` (${config.model})` : ''}`
    : 'deterministic (no LLM)';
  console.log(pc.dim(`  Profile: ${config.profile} | Provider: ${providerStr}`));
  console.log('');
}

export function printScoreBox(score: number, version: string): void {
  const band = scoreBandLabel(score);
  const color = scoreColor(score);
  const scoreStr = `${score}/100`;

  console.log(`  ${pc.dim('┌─────────────────────────────────────────────┐')}`);
  console.log(`  ${pc.dim('│')}  AGENT READINESS SCORE: ${color(pc.bold(scoreStr))}${' '.repeat(Math.max(0, 16 - scoreStr.length))}${pc.dim('│')}`);
  console.log(`  ${pc.dim('│')}  Band: ${color(band)}${' '.repeat(Math.max(0, 33 - band.length))}${pc.dim('│')}`);
  console.log(`  ${pc.dim('│')}  Version: ${pc.dim(version)}${' '.repeat(Math.max(0, 28 - version.length))}${pc.dim('│')}`);
  console.log(`  ${pc.dim('└─────────────────────────────────────────────┘')}`);
}

export function printDimensions(dimensions: { name: string; score: number; maxScore: number }[]): void {
  if (!dimensions || dimensions.length === 0) return;

  console.log(pc.dim('\n  Dimensions:'));
  for (const d of dimensions) {
    const color = scoreColor(Math.round((d.score / d.maxScore) * 100));
    const name = d.name.padEnd(28, ' ');
    const dots = '.'.repeat(Math.max(1, 30 - d.name.length));
    const scoreStr = `${d.score}/${d.maxScore}`;
    console.log(`    ${name} ${pc.dim(dots)} ${color(pc.bold(scoreStr))}`);
  }
}
