/**
 * CLI Command: glintbase scan <url>
 * Run a full agent-readiness scan with beautiful terminal output.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import ora from 'ora';
import { resolveConfig, configExists } from '../config.js';
import { runScan, formatScanMarkdown, ARS_VERSION } from '@scanner/core';
import { scoreBandLabel } from '@scanner/shared/scoreBand';
import { printScoreBox, printDimensions, printHeader } from '../output/terminal.js';
import { formatJson } from '../output/json.js';
import { saveResult } from '../commands/report.js';
import { resolveProvider } from '../providers.js';

export const scanCommand = new Command('scan')
  .description('Run an agent-readiness scan against a URL')
  .argument('<url>', 'URL to scan (landing page, docs root, or API base)')
  .option('--profile <profile>', 'Scan depth: quick | deep', 'quick')
  .option('--agent', 'Use LLM agent harness (requires provider config)')
  .option('--provider <name>', 'LLM provider: openai | anthropic | google | groq | ollama | openrouter')
  .option('--model <name>', 'Model name override')
  .option('--base-url <url>', 'Custom endpoint (Ollama, vLLM, LM Studio)')
  .option('--json', 'Output full JSON report')
  .option('--markdown', 'Output Markdown report')
  .option('--fail-under <n>', 'Exit 3 if score below threshold', parseInt)
  .option('--surfaces <csv>', 'Comma-separated surface types to check')
  .option('--max-pages <n>', 'Crawl budget override', parseInt)
  .option('--save', 'Save result to .glintbase/results/')
  .option('--no-color', 'Disable colored output')
  .option('-q, --quiet', 'Minimal output')
  .action(async (url: string, opts: any) => {
    const config = resolveConfig(opts);

    // First-run hint
    if (!configExists() && !opts.provider) {
      if (!opts.quiet) {
        console.log(pc.dim('  No config found. Run `glintbase init` to set up (30 seconds), or use --provider flag directly.'));
        console.log(pc.dim('  Scanning in deterministic mode (no LLM agent harness).\n'));
      }
    }

    // Header
    if (!opts.quiet && !opts.json) {
      printHeader(url, config);
    }

    // Verify provider availability when --agent is requested
    if (config.useAgentHarness && config.provider) {
      const providerCheck = await resolveProvider(config);
      if (!providerCheck.available) {
        console.error(pc.red(`\n  Provider error: ${providerCheck.error}\n`));
        console.error(pc.dim('  Falling back to deterministic mode. Fix with `glintbase init` or check provider.\n'));
        config.useAgentHarness = false;
      }
    }

    // Build scan options
    const enabledSurfaces = opts.surfaces ? opts.surfaces.split(',').map((s: string) => s.trim()) : undefined;
    const scanOptions: any = {
      profile: config.profile,
      useAgentHarness: config.useAgentHarness,
      provider: config.provider || undefined,
      enabledSurfaces,
      maxPages: opts.maxPages || undefined,
    };

    // Progress tracking
    const steps = [
      { id: 'validation', label: 'Validating URL policy' },
      { id: 'discovery', label: 'Discovering surfaces' },
      { id: 'classification', label: 'Classifying surfaces' },
      { id: 'framework', label: 'Detecting framework' },
      { id: 'crawl', label: 'Crawling ecosystem' },
      { id: 'graph', label: 'Building knowledge graph' },
      { id: 'journeys', label: 'Running agent journeys' },
      { id: 'scoring', label: 'Computing ARS' },
    ];

    // Use a ref object so TypeScript tracks mutations inside the callback
    const spinner: { current: ReturnType<typeof ora> | null } = { current: null };
    let stepIdx = 0;

    const onProgress = (ev: any) => {
      if (opts.quiet || opts.json) return;
      if (ev?.type !== 'progress') return;

      const check = ev.check || '';
      const status = ev.status || '';
      const message = ev.message || '';

      // Find matching step
      const matchIdx = steps.findIndex((s) => check.includes(s.id) || s.id.includes(check));
      if (matchIdx >= 0 && matchIdx !== stepIdx) {
        if (spinner.current) spinner.current.succeed();
        stepIdx = matchIdx;
        spinner.current = ora({ text: pc.dim(`  [${stepIdx + 1}/${steps.length}] `) + steps[stepIdx].label, indent: 2 }).start();
      } else if (!spinner.current && stepIdx === 0) {
        spinner.current = ora({ text: pc.dim(`  [1/${steps.length}] `) + steps[0].label, indent: 2 }).start();
      }

      if (status === 'done' && spinner.current) {
        const suffix = message ? pc.dim(` — ${message}`) : '';
        spinner.current.succeed(pc.dim(`  [${stepIdx + 1}/${steps.length}] `) + steps[stepIdx].label + suffix);
        spinner.current = null;
        stepIdx++;
      }
    };

    try {
      const result = await runScan({ url, options: scanOptions }, { onProgress });

      if (spinner.current) spinner.current.succeed();

      // Output
      if (opts.json) {
        console.log(formatJson(result));
      } else if (opts.markdown) {
        console.log(formatScanMarkdown(result));
      } else if (!opts.quiet) {
        console.log('');
        printScoreBox(result.score, result.score_version);
        printDimensions(result.dimensions);

        // Journey summary
        const passed = result.journeys.traces.filter((t) => t.success).length;
        const total = result.journeys.traces.length;
        console.log(pc.dim(`\n  Journeys: ${passed}/${total} passed · Avg hops: ${result.journeys.avgHopCount}`));
        console.log(pc.dim(`  Duration: ${result.duration_ms}ms · Framework: ${result.framework}`));
        console.log(pc.dim(`\n  Run \`glintbase scan ${url} --markdown\` for full report.\n`));
      } else {
        // Quiet mode: just score
        console.log(result.score);
      }

      // Save
      if (opts.save) {
        const path = saveResult(result);
        if (!opts.quiet) console.log(pc.dim(`  Saved to ${path}\n`));
      }

      // Fail-under gate
      const threshold = opts.failUnder ?? config.failUnder;
      if (threshold !== null && result.score < threshold) {
        console.error(pc.red(`\n  Score ${result.score} is below --fail-under ${threshold}\n`));
        process.exit(3);
      }

      process.exit(0);
    } catch (err: any) {
      if (spinner.current) spinner.current.fail();
      const code = err?.code === 'SSRF_BLOCKED' || err?.code === 'INVALID_URL' ? 2 : 1;
      console.error(pc.red(`\n  Error: ${err.message}\n`));
      process.exit(code);
    }
  });
