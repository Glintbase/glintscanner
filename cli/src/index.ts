#!/usr/bin/env node
/**
 * Glintbase CLI — Agent Readiness Scanner for terminal and CI.
 *
 * Usage:
 *   glintbase scan https://docs.example.com
 *   glintbase init
 *   glintbase config list
 */

import { Command } from 'commander';
import { scanCommand } from './commands/scan.js';
import { initCommand } from './commands/init.js';
import { configCommand } from './commands/config.js';
import { reportCommand } from './commands/report.js';

const program = new Command()
  .name('glintbase')
  .description('Agent Readiness Scanner — measure how AI agents experience your product')
  .version('0.1.0 (ARS 1.0.0)');

program.addCommand(scanCommand);
program.addCommand(initCommand);
program.addCommand(configCommand);
program.addCommand(reportCommand);

program.parse();
