/**
 * Modern Terminal UI for Glintbase CLI (ARS 2.0)
 * Inspired by Claude Code and OpenCode (hairline typography, HUD scorecard, step tree, remediation diff cards).
 */

import pc from 'picocolors';
import type { ResolvedConfig } from '../config.js';
import { scoreBandLabel } from '@scanner/shared/scoreBand';

export function renderProgressBar(score: number, maxScore = 100, length = 24): string {
  const pct = maxScore > 0 ? Math.min(1, Math.max(0, score / maxScore)) : 0;
  const filledCount = Math.round(pct * length);
  const emptyCount = length - filledCount;

  const color = scoreColor(Math.round(pct * 100));
  const bar = color('█'.repeat(filledCount)) + pc.dim('░'.repeat(emptyCount));
  const percentText = `${Math.round(pct * 100)}%`.padStart(4, ' ');

  return `${bar} ${pc.bold(color(percentText))}`;
}

export function scoreColor(score: number): (s: string) => string {
  if (score >= 90) return pc.green;
  if (score >= 75) return pc.cyan;
  if (score >= 50) return pc.yellow;
  return pc.red;
}

export function printHeader(
  url: string,
  config: ResolvedConfig,
  archetype = 'Developer Platform / API',
  denominator = 85
): void {
  const width = 78;
  const top = `╭─ ${pc.bold(pc.cyan('GLINTBASE'))} ${pc.dim('✦')} ${pc.white('Agent Readiness Scanner v2.0')} ${'─'.repeat(width - 48)}╮`;
  const bottom = `╰${'─'.repeat(width - 2)}╯`;

  const providerStr = config.provider
    ? `${config.provider}${config.model ? ` (${config.model})` : ''}`
    : 'Deterministic + Probes';

  console.log('');
  console.log(pc.cyan(top));
  console.log(pc.cyan('│') + `  ${pc.dim('Target     :')} ${pc.bold(pc.white(url))}`.padEnd(width + 8, ' ') + pc.cyan('│'));
  console.log(pc.cyan('│') + `  ${pc.dim('Archetype  :')} ${pc.green(archetype)} ${pc.dim('[Auto-classified]')}`.padEnd(width + 17, ' ') + pc.cyan('│'));
  console.log(pc.cyan('│') + `  ${pc.dim('Denominator:')} ${pc.yellow(`${denominator} pts`)} ${pc.dim('(Dynamic scaling active)')}`.padEnd(width + 17, ' ') + pc.cyan('│'));
  console.log(pc.cyan('│') + `  ${pc.dim('Profile    :')} ${config.profile} · ${pc.dim('Engine:')} ${providerStr}`.padEnd(width + 17, ' ') + pc.cyan('│'));
  console.log(pc.cyan(bottom));
  console.log('');
}

export function printStepTreeHeader(): void {
  console.log(`  ${pc.cyan('◇')}  ${pc.bold('Autonomous Probe Sequence')}`);
}

export function printStepItem(
  status: 'pass' | 'fail' | 'warn' | 'skip' | 'info',
  stepNumber: number,
  label: string,
  detail?: string,
  points?: string
): void {
  let icon = pc.green('✓');
  if (status === 'fail') icon = pc.red('✕');
  if (status === 'warn') icon = pc.yellow('▲');
  if (status === 'skip') icon = pc.dim('○');
  if (status === 'info') icon = pc.blue('●');

  const stepStr = `${stepNumber}.`.padEnd(3, ' ');
  const labelStr = label.padEnd(26, ' ');
  const detailStr = detail ? pc.dim(detail.slice(0, 34).padEnd(35, ' ')) : ''.padEnd(35, ' ');
  const ptsStr = points ? (status === 'pass' ? pc.green(points) : status === 'fail' ? pc.red(points) : pc.dim(points)) : '';

  console.log(`  ${pc.dim('│')}  ${icon}  ${pc.dim(stepStr)} ${pc.white(labelStr)} ${detailStr} ${ptsStr}`);
}

export function printStepTreeFooter(durationMs: number): void {
  console.log(`  ${pc.dim('└')}  ${pc.dim(`Probe sequence completed in ${durationMs}ms`)}\n`);
}

export function printScorecardHud(
  score: number,
  version = 'ars-2.0.0',
  layers?: Array<{ name: string; score: number; maxScore: number; statusText?: string; applicable?: boolean }>
): void {
  const band = scoreBandLabel(score);
  const color = scoreColor(score);
  const scoreStr = `${score} / 100`;
  const width = 78;

  console.log(pc.cyan(`╭─  ${pc.bold('AGENT READINESS SCORECARD (ARS 2.0)')}  ${'─'.repeat(width - 42)}╮`));
  console.log(pc.cyan('│') + ' '.repeat(width - 2) + pc.cyan('│'));
  console.log(
    pc.cyan('│') +
      `   ${pc.bold('OVERALL ARS SCORE :')}  ${color(pc.bold(scoreStr.padEnd(10, ' ')))}  ${pc.dim('GRADE:')} ${color(pc.bold(`Grade ${band}`))}`.padEnd(
        width + 17,
        ' '
      ) +
      pc.cyan('│')
  );
  console.log(
    pc.cyan('│') +
      `   ${pc.dim('Health Meter      :')}  ${renderProgressBar(score, 100, 28)}`.padEnd(width + 19, ' ') +
      pc.cyan('│')
  );
  console.log(pc.cyan('│') + ' '.repeat(width - 2) + pc.cyan('│'));

  if (layers && layers.length > 0) {
    console.log(pc.cyan(`├${'─'.repeat(width - 2)}┤`));
    console.log(pc.cyan('│') + ' '.repeat(width - 2) + pc.cyan('│'));
    for (const l of layers) {
      if (l.applicable === false) {
        console.log(
          pc.cyan('│') +
            `   ${l.name.padEnd(22, ' ')} ${pc.dim('[ N/A ]')}  ${pc.dim('────────────────────')}  ${pc.dim('○ Auto-scaled for Archetype')}`.padEnd(
              width + 19,
              ' '
            ) +
            pc.cyan('│')
        );
      } else {
        const bar = renderProgressBar(l.score, l.maxScore, 14);
        const pts = `[${l.score}/${l.maxScore}]`.padEnd(8, ' ');
        const status = l.statusText ? pc.dim(`· ${l.statusText}`) : '';
        console.log(
          pc.cyan('│') +
            `   ${l.name.padEnd(20, ' ')} ${pts}  ${bar}  ${status}`.padEnd(width + 19, ' ') +
            pc.cyan('│')
        );
      }
    }
    console.log(pc.cyan('│') + ' '.repeat(width - 2) + pc.cyan('│'));
  }

  console.log(pc.cyan(`╰${'─'.repeat(width - 2)}╯`));
  console.log('');
}

export function printRemediationDiffCard(
  title: string,
  targetFile: string,
  impact: string,
  proposedDiff: string[],
  command: string
): void {
  const width = 78;
  console.log(pc.yellow(`┌─ [REMEDIATION] ${title.slice(0, width - 20)} ${'─'.repeat(Math.max(2, width - title.length - 20))}┐`));
  console.log(pc.yellow('│') + `  ${pc.dim('Target File:')} ${pc.bold(pc.white(targetFile))}`.padEnd(width + 8, ' ') + pc.yellow('│'));
  console.log(pc.yellow('│') + `  ${pc.dim('Agent Impact:')} ${impact.slice(0, width - 18)}`.padEnd(width + 8, ' ') + pc.yellow('│'));
  console.log(pc.yellow('│') + ' '.repeat(width - 2) + pc.yellow('│'));

  if (proposedDiff.length > 0) {
    console.log(pc.yellow('│') + `  ${pc.dim('Proposed Content Preview:')}`.padEnd(width + 8, ' ') + pc.yellow('│'));
    for (const line of proposedDiff.slice(0, 8)) {
      const formatted = line.startsWith('+') ? pc.green(line) : line.startsWith('-') ? pc.red(line) : pc.dim(line);
      console.log(pc.yellow('│') + `    ${formatted}`.padEnd(width + 8, ' ') + pc.yellow('│'));
    }
    console.log(pc.yellow('│') + ' '.repeat(width - 2) + pc.yellow('│'));
  }

  console.log(
    pc.yellow('│') +
      `  ${pc.cyan('▶')} Run ${pc.bold(pc.cyan(command))} to autonomously generate this file.`.padEnd(width + 17, ' ') +
      pc.yellow('│')
  );
  console.log(pc.yellow(`└${'─'.repeat(width - 2)}┘`));
  console.log('');
}

// Backward compatibility helper
export function printScoreBox(score: number, version: string): void {
  printScorecardHud(score, version);
}

export function printDimensions(dimensions: { name: string; score: number; maxScore: number }[]): void {
  if (!dimensions || dimensions.length === 0) return;
  console.log(pc.dim('  Dimension Breakdown:'));
  for (const d of dimensions) {
    const bar = renderProgressBar(d.score, d.maxScore, 16);
    console.log(`    ${d.name.padEnd(26, ' ')} [${d.score}/${d.maxScore}] ${bar}`);
  }
  console.log('');
}
