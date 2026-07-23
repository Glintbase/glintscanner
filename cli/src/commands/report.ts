/**
 * CLI Command: glintbase report <file>
 * Re-format a saved JSON scan result.
 */

import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import { formatScanMarkdown } from '@scanner/core';
import { printScoreBox, printDimensions } from '../output/terminal.js';

const RESULTS_DIR = '.glintbase/results';

export function saveResult(result: any): string {
  const dir = join(process.cwd(), RESULTS_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let domain = 'scan';
  try {
    domain = new URL(result.url).hostname.replace(/\./g, '-');
  } catch { /* keep default */ }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${domain}-${timestamp}.json`;
  const filepath = join(dir, filename);

  writeFileSync(filepath, JSON.stringify(result, null, 2));
  return filepath;
}

export const reportCommand = new Command('report')
  .description('Re-format a saved JSON scan result')
  .argument('<file>', 'Path to saved JSON result file')
  .option('--markdown', 'Output as Markdown')
  .option('--json', 'Output raw JSON (pretty-printed)')
  .action((file: string, opts: any) => {
    try {
      const raw = readFileSync(file, 'utf-8');
      const result = JSON.parse(raw);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (opts.markdown) {
        console.log(formatScanMarkdown(result));
      } else {
        // Terminal output
        console.log(pc.bold(`\n  Report: ${file}\n`));
        printScoreBox(result.score, result.score_version);
        if (result.dimensions) {
          printDimensions(result.dimensions);
        }
        console.log('');
      }
    } catch (err: any) {
      console.error(pc.red(`  Error reading file: ${err.message}`));
      process.exit(1);
    }
  });
