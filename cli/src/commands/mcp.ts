/**
 * CLI Command: glintbase mcp lint <url>
 * 4-Step Empirical MCP Server Lint & Reliability Gate
 * Audits 2026-07-28 wire forms, hidden auth gates, schema honesty,
 * destructive tool annotations, and in-channel error envelopes.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import ora from 'ora';
import { probeMcpServer } from '@scanner/v2/mcpProbe';

export const mcpCommand = new Command('mcp')
  .description('Model Context Protocol (MCP) server inspection and quality gates');

mcpCommand
  .command('lint')
  .description('Audit an MCP server for protocol compliance, schema honesty, and reliability')
  .argument('<url>', 'MCP server endpoint URL (e.g. https://api.example.com/api/mcp)')
  .option('--fail-under <n>', 'Exit code 3 if MCP reliability score is below threshold', parseInt)
  .option('--json', 'Output raw JSON diagnostic report', false)
  .option('--ci', 'CI mode: outputs formatted markdown summary', false)
  .action(async (url: string, opts: any) => {
    const spinner = ora({
      text: pc.cyan(`Probing MCP server at ${url}...`),
      color: 'cyan',
    });

    if (!opts.json) {
      spinner.start();
    }

    try {
      const result = await probeMcpServer(url);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        if (opts.failUnder && result.reliabilityScore < opts.failUnder) {
          process.exit(3);
        }
        return;
      }

      spinner.stop();

      // Terminal Header
      console.log();
      console.log(
        pc.bold(pc.bgCyan(pc.black(' GLINTBASE MCP LINT '))) +
        pc.gray(` • Version 2026-07-28 Spec Compliance Engine`)
      );
      console.log(pc.gray(`Target: `) + pc.white(url));
      console.log(pc.gray(`Protocol Detected: `) + pc.cyan(result.protocolVersion || 'Unknown / Legacy'));
      console.log();

      // Step Diagnostic Table
      console.log(pc.bold('Execution Verification Steps:'));
      for (const step of result.steps) {
        const icon = step.passed ? pc.green('✓') : pc.red('✗');
        const title =
          step.step === 'handshake'
            ? 'Handshake & Wire Negotiation'
            : step.step === 'tools_list'
            ? 'Tools Discovery & Schema Scan'
            : step.step === 'safe_call'
            ? 'Safe Execution & Schema Honesty'
            : 'Error Channel Envelope Integrity';

        console.log(`  ${icon} ${pc.bold(title)} ${pc.gray(`(${step.latencyMs}ms)`)}`);
        if (step.message) {
          console.log(`    ${pc.gray(step.message)}`);
        }
      }
      console.log();

      // Tool Insights & Risk Flags
      console.log(pc.bold(`Tool Inventory (${result.toolCount} tools declared):`));
      if (result.tools.length === 0) {
        console.log(`  ${pc.yellow('⚠ No tools declared in tools/list')}`);
      } else {
        const destructiveWithoutHint = result.tools.filter(
          (t) => (t.name.startsWith('delete_') || t.name.startsWith('drop_') || t.name.startsWith('remove_')) && !t.destructive
        );

        for (const t of result.tools.slice(0, 10)) {
          const tags: string[] = [];
          if (t.readOnly) tags.push(pc.green('read-only'));
          if (t.destructive) tags.push(pc.red('destructive'));
          const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
          console.log(`  • ${pc.cyan(t.name)}${tagStr} ${pc.gray(`(${t.declaredRequiredCount} required args)`)}`);
        }

        if (result.tools.length > 10) {
          console.log(pc.gray(`  ... and ${result.tools.length - 10} more tools`));
        }

        if (destructiveWithoutHint.length > 0) {
          console.log();
          console.log(
            pc.yellow(`  ⚠ Risk: ${destructiveWithoutHint.length} destructive tool(s) lack destructiveHint annotations:`)
          );
          for (const dt of destructiveWithoutHint) {
            console.log(pc.yellow(`    - ${dt.name}`));
          }
        }
      }
      console.log();

      // Reliability Score HUD
      const scoreColor =
        result.reliabilityScore >= 80 ? pc.green : result.reliabilityScore >= 50 ? pc.yellow : pc.red;

      console.log(pc.bold('MCP Reliability Score:'));
      console.log(
        `  ${scoreColor(pc.bold(String(result.reliabilityScore)))} / 100  ${pc.gray(
          result.reliabilityScore >= 80 ? '(Production Ready)' : result.reliabilityScore >= 50 ? '(Needs Remediation)' : '(High Risk / Failing)'
        )}`
      );
      console.log();

      // CI Gate Enforcement
      if (opts.failUnder && result.reliabilityScore < opts.failUnder) {
        console.log(
          pc.red(
            `\n✖ CI Gate Failed: MCP reliability score ${result.reliabilityScore} is below threshold of ${opts.failUnder}\n`
          )
        );
        process.exit(3);
      }
    } catch (err: any) {
      spinner.stop();
      console.error(pc.red(`\n✖ MCP Lint Error: ${err?.message || String(err)}\n`));
      process.exit(1);
    }
  });
