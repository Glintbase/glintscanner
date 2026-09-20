/**
 * CLI Command: glintbase check <ids>
 * Targeted re-verification of specific check IDs (Ora-parity fast feedback loop).
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { runArs2Probes } from '@scanner/v2/probes/index';

export const checkCommand = new Command('check')
  .description('Fast re-verification of specific check IDs against a URL')
  .argument('<url>', 'Target URL to inspect')
  .argument('[checkIds]', 'Comma-separated check IDs to verify (e.g. auth.md,robots.txt,anti-spa-404)', 'all')
  .action(async (url: string, checkIds: string) => {
    console.log('');
    console.log(pc.cyan(`╭─  ${pc.bold('GLINTBASE TARGETED CHECK')}  ────────────────────────────────────────────╮`));
    console.log(pc.cyan('│') + `  ${pc.dim('Target  :')} ${pc.bold(pc.white(url))}`.padEnd(76, ' ') + pc.cyan('│'));
    console.log(pc.cyan('│') + `  ${pc.dim('Checks  :')} ${pc.yellow(checkIds)}`.padEnd(76, ' ') + pc.cyan('│'));
    console.log(pc.cyan(`╰─────────────────────────────────────────────────────────────────────────────╯\n`));

    const startTime = Date.now();
    try {
      const scorecard = await runArs2Probes(url);
      const durationMs = Date.now() - startTime;

      const requested = checkIds.split(',').map((s) => s.trim().toLowerCase());
      const checkAll = requested.includes('all');

      let passedCount = 0;
      let totalChecked = 0;

      // 1. Robots check
      if (checkAll || requested.some((r) => r.includes('robot'))) {
        totalChecked++;
        const passed = scorecard.layers.discovery.data.robotsPolicy.aiFriendly;
        if (passed) {
          passedCount++;
          console.log(`  ${pc.green('✓')}  ${pc.bold('robots.txt AI Policy')}  ${pc.dim('ClaudeBot/GPTBot permitted')}`);
        } else {
          console.log(`  ${pc.red('✕')}  ${pc.bold('robots.txt AI Policy')}  ${pc.red('AI crawlers restricted or blocked')}`);
        }
      }

      // 2. Auth check
      if (checkAll || requested.some((r) => r.includes('auth'))) {
        totalChecked++;
        const passed = scorecard.layers.usability.data.authHandbook.found;
        if (passed) {
          passedCount++;
          console.log(`  ${pc.green('✓')}  ${pc.bold('WorkOS auth.md')}       ${pc.dim(`Verified at ${scorecard.layers.usability.data.authHandbook.url}`)}`);
        } else {
          console.log(`  ${pc.red('✕')}  ${pc.bold('WorkOS auth.md')}       ${pc.red('auth.md / RFC 9728 not found')}`);
        }
      }

      // 3. Anti-SPA 404 check
      if (checkAll || requested.some((r) => r.includes('404') || r.includes('spa'))) {
        totalChecked++;
        const passed = scorecard.layers.access.data.antiSpa404.passed;
        if (passed) {
          passedCount++;
          console.log(`  ${pc.green('✓')}  ${pc.bold('Anti-SPA 404')}         ${pc.dim('Authentic HTTP 404 returned on nonexistent routes')}`);
        } else {
          console.log(`  ${pc.red('✕')}  ${pc.bold('Anti-SPA 404')}         ${pc.red('Returns soft 200 OK — agents may hallucinate')}`);
        }
      }

      // 4. Markdown negotiation check
      if (checkAll || requested.some((r) => r.includes('markdown') || r.includes('llms'))) {
        totalChecked++;
        const passed = scorecard.layers.access.data.markdownNegotiation.supported;
        if (passed) {
          passedCount++;
          console.log(`  ${pc.green('✓')}  ${pc.bold('Markdown Negotiation')} ${pc.dim('Accept: text/markdown or .md twin supported')}`);
        } else {
          console.log(`  ${pc.red('✕')}  ${pc.bold('Markdown Negotiation')} ${pc.red('No markdown content negotiation')}`);
        }
      }

      // 5. MCP server check
      if (checkAll || requested.some((r) => r.includes('mcp'))) {
        totalChecked++;
        const passed = scorecard.layers.usability.data.mcpServer.live;
        if (passed) {
          passedCount++;
          console.log(`  ${pc.green('✓')}  ${pc.bold('MCP Server')}          ${pc.dim(`Live endpoint at ${scorecard.layers.usability.data.mcpServer.endpoint}`)}`);
        } else {
          console.log(`  ${pc.red('✕')}  ${pc.bold('MCP Server')}          ${pc.dim('No live streamable MCP endpoint detected')}`);
        }
      }

      console.log(`\n  ${pc.dim(`Checked ${totalChecked} items in ${durationMs}ms: ${passedCount}/${totalChecked} passed.`)}\n`);
      if (passedCount < totalChecked) {
        process.exit(1);
      }
    } catch (err: any) {
      console.error(pc.red(`\n  Check failed: ${err.message}\n`));
      process.exit(2);
    }
  });
