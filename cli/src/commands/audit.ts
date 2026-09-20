/**
 * CLI Command: glintbase audit <url>
 * Full ARS 2.0 audit with Claude Code / OpenCode aesthetics and CI gate support.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { runArs2Probes } from '@scanner/v2/probes/index';
import { resolveConfig } from '../config.js';
import {
  printHeader,
  printStepTreeHeader,
  printStepItem,
  printStepTreeFooter,
  printScorecardHud,
  printRemediationDiffCard,
} from '../output/terminal.js';

export const auditCommand = new Command('audit')
  .description('Run a full ARS 2.0 agent readiness audit against a domain')
  .argument('<url>', 'URL to audit (e.g. https://stripe.com or https://supabase.com)')
  .option('--profile <profile>', 'Audit depth: quick | deep', 'deep')
  .option('--fail-under <n>', 'Exit code 3 if ARS score is below threshold', parseInt)
  .option('--ci', 'CI mode: outputs GitHub Actions markdown summary', false)
  .option('--json', 'Output raw JSON scorecard', false)
  .option('-q, --quiet', 'Minimal output (only output score)', false)
  .action(async (url: string, opts: any) => {
    const config = resolveConfig(opts);
    const startTime = Date.now();

    try {
      const scorecard = await runArs2Probes(url);
      const durationMs = Date.now() - startTime;

      if (opts.json) {
        console.log(JSON.stringify(scorecard, null, 2));
        return;
      }

      if (opts.quiet) {
        console.log(scorecard.score);
        return;
      }

      // 1. Terminal Header (Claude Code style)
      printHeader(url, config, scorecard.archetype.label, scorecard.activeDenominator);

      // 2. Probe Step Tree
      printStepTreeHeader();

      // Layer 1
      const robots = scorecard.layers.discovery.data.robotsPolicy;
      printStepItem(
        robots.aiFriendly ? 'pass' : 'warn',
        1,
        'robots.txt AI Policy',
        robots.aiFriendly ? 'ClaudeBot & GPTBot permitted' : 'AI bots restricted',
        robots.aiFriendly ? '+10 pts' : '0 pts'
      );

      const ard = scorecard.layers.discovery.data.agentRegistries;
      printStepItem(
        ard.foundArd || ard.foundAiCatalog || ard.foundAgentCard ? 'pass' : 'info',
        2,
        'Agent Registry Metadata',
        ard.url ? `Found at ${ard.url}` : 'Standard ard.json absent',
        ard.url ? '+10 pts' : '0 pts'
      );

      // Layer 2
      const md = scorecard.layers.access.data.markdownNegotiation;
      printStepItem(
        md.supported ? 'pass' : 'warn',
        3,
        'Markdown Negotiation',
        md.supported ? 'Accept: text/markdown supported' : 'No markdown twin or negotiation',
        md.supported ? '+10 pts' : '0 pts'
      );

      const spa = scorecard.layers.access.data.antiSpa404;
      printStepItem(
        spa.passed ? 'pass' : 'fail',
        4,
        'Anti-SPA 404 Canary',
        spa.passed ? 'Authentic 404 returned' : 'Returns soft 200 OK (SPA leak)',
        spa.passed ? '+8 pts' : '-10 pts'
      );

      // Layer 3
      const auth = scorecard.layers.usability.data.authHandbook;
      printStepItem(
        auth.found ? 'pass' : 'warn',
        5,
        'WorkOS auth.md Spec',
        auth.found ? 'Auth guide verified' : 'No auth handbook for agents',
        auth.found ? '+15 pts' : '0 pts'
      );

      const mcp = scorecard.layers.usability.data.mcpServer;
      printStepItem(
        mcp.live ? 'pass' : 'info',
        6,
        'Streamable HTTP MCP',
        mcp.live ? `Live at ${mcp.endpoint}` : 'No MCP endpoint detected',
        mcp.live ? '+15 pts' : '0 pts'
      );

      // Layer 4
      const pay = scorecard.layers.payments;
      printStepItem(
        pay.applicable ? (pay.score > 0 ? 'pass' : 'warn') : 'skip',
        7,
        'Machine Payments (x402)',
        pay.applicable ? `${pay.score}/${pay.maxScore} points earned` : 'Skipped for DevTool/SaaS archetype',
        pay.applicable ? `+${pay.score} pts` : 'N/A'
      );

      printStepTreeFooter(durationMs);

      // 3. HUD Scorecard
      const layers = [
        {
          name: 'LAYER 1: Discovery',
          score: scorecard.layers.discovery.score,
          maxScore: scorecard.layers.discovery.maxScore,
          statusText: `${scorecard.layers.discovery.score >= 20 ? 'Optimal' : 'Needs attention'}`,
        },
        {
          name: 'LAYER 2: Access',
          score: scorecard.layers.access.score,
          maxScore: scorecard.layers.access.maxScore,
          statusText: `${scorecard.layers.access.score >= 20 ? 'Optimal' : 'Needs attention'}`,
        },
        {
          name: 'LAYER 3: Usability',
          score: scorecard.layers.usability.score,
          maxScore: scorecard.layers.usability.maxScore,
          statusText: `${scorecard.layers.usability.score >= 25 ? 'Optimal' : 'Remediate'}`,
        },
        {
          name: 'LAYER 4: Payments',
          score: scorecard.layers.payments.score,
          maxScore: scorecard.layers.payments.maxScore,
          applicable: scorecard.layers.payments.applicable,
        },
      ];

      printScorecardHud(scorecard.score, scorecard.version, layers);

      // 4. Actionable Remediations
      if (scorecard.remediations.length > 0) {
        console.log(pc.bold(`  Actionable Remediations (${scorecard.remediations.length} Detected):\n`));
        for (const rem of scorecard.remediations) {
          let diffLines: string[] = [];
          if (rem.id === 'missing-auth-md') {
            diffLines = [
              '+ ---',
              '+ title: Agent Authentication Handbook',
              '+ auth_schemes: [api_key, oauth2_client_credentials]',
              '+ endpoints:',
              '+   token: https://api.example.com/oauth/v2/token',
            ];
          } else if (rem.id === 'robots-ai-blocked') {
            diffLines = [
              '+ User-agent: ClaudeBot',
              '+ Allow: /',
              '+ User-agent: GPTBot',
              '+ Allow: /',
            ];
          }

          printRemediationDiffCard(rem.title, rem.targetFile, rem.description, diffLines, rem.fixCommand);
        }
      }

      // 5. CI Mode GitHub Actions Output
      if (opts.ci) {
        console.log(`\n::set-output name=ars_score::${scorecard.score}`);
        console.log(`::set-output name=archetype::${scorecard.archetype.archetype}`);
        if (process.env.GITHUB_STEP_SUMMARY) {
          const fs = await import('fs');
          const summaryMarkdown = `
## Glintbase Agent Readiness Report (ARS 2.0)
| Target | ARS Score | Archetype | Denominator |
| :--- | :--- | :--- | :--- |
| **${url}** | **${scorecard.score} / 100** | ${scorecard.archetype.label} | ${scorecard.activeDenominator} pts |

### Operational Layer Health
- **Discovery**: ${scorecard.layers.discovery.score} / ${scorecard.layers.discovery.maxScore}
- **Access**: ${scorecard.layers.access.score} / ${scorecard.layers.access.maxScore}
- **Usability**: ${scorecard.layers.usability.score} / ${scorecard.layers.usability.maxScore}
- **Payments**: ${scorecard.layers.payments.applicable ? `${scorecard.layers.payments.score} / ${scorecard.layers.payments.maxScore}` : 'N/A'}
`;
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown, 'utf8');
        }
      }

      // 6. Fail-under Gate
      const threshold = opts.failUnder ?? config.failUnder;
      if (threshold !== null && threshold !== undefined && scorecard.score < threshold) {
        console.error(pc.red(`\n  Gate Failure: Score ${scorecard.score} is below --fail-under threshold (${threshold})\n`));
        process.exit(3);
      }

      process.exit(0);
    } catch (err: any) {
      console.error(pc.red(`\n  Audit error: ${err.message}\n`));
      process.exit(1);
    }
  });
