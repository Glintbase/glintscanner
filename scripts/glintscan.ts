#!/usr/bin/env npx tsx
/**
 * Glintscan CLI — run agent-readiness scans from the terminal.
 *
 * Usage:
 *   npx tsx scripts/glintscan.ts https://docs.example.com
 *   npm run glintscan -- https://docs.example.com --json
 *   npm run glintscan -- https://docs.example.com --markdown
 *   npm run glintscan -- https://docs.example.com --fail-under 70
 */

import { runScan, formatScanMarkdown, ARS_VERSION } from '../src/lib/scanner/core';

function printHelp(): void {
  console.log(`
glintscan — Agent Readiness Scanner (ARS ${ARS_VERSION})

Usage:
  glintscan <url> [options]

Options:
  --json              Full JSON report to stdout
  --markdown          Markdown report (default for TTY)
  --quiet, -q         Progress to stderr only; result on stdout
  --profile <p>       quick | deep (default: quick)
  --fail-under <n>    Exit 3 if score < n (CI gate)
  --score-version     Print ARS version and exit
  --help, -h          Show help

Exit codes:
  0  success
  1  scan failed
  2  invalid args / SSRF blocked
  3  score below --fail-under
`);
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let url = '';
  let format: 'json' | 'markdown' | 'auto' = 'auto';
  let quiet = false;
  let profile: 'quick' | 'deep' = 'quick';
  let failUnder: number | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') return { help: true as const };
    if (a === '--score-version') return { scoreVersion: true as const };
    if (a === '--json') format = 'json';
    else if (a === '--markdown') format = 'markdown';
    else if (a === '--quiet' || a === '-q') quiet = true;
    else if (a === '--profile') {
      const p = args[++i];
      if (p !== 'quick' && p !== 'deep') throw Object.assign(new Error('profile must be quick|deep'), { code: 2 });
      profile = p;
    } else if (a === '--fail-under') {
      failUnder = Number(args[++i]);
      if (Number.isNaN(failUnder)) throw Object.assign(new Error('fail-under must be a number'), { code: 2 });
    } else if (a.startsWith('-')) {
      throw Object.assign(new Error(`Unknown option: ${a}`), { code: 2 });
    } else {
      url = a;
    }
  }

  return { help: false as const, scoreVersion: false as const, url, format, quiet, profile, failUnder };
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv);
  } catch (e: any) {
    console.error(e.message);
    process.exit(e.code || 2);
  }

  if ('help' in parsed && parsed.help) {
    printHelp();
    process.exit(0);
  }
  if ('scoreVersion' in parsed && parsed.scoreVersion) {
    console.log(ARS_VERSION);
    process.exit(0);
  }

  const { url, format, quiet, profile, failUnder } = parsed as {
    url: string;
    format: 'json' | 'markdown' | 'auto';
    quiet: boolean;
    profile: 'quick' | 'deep';
    failUnder: number | null;
  };

  if (!url) {
    console.error('Error: URL is required\n');
    printHelp();
    process.exit(2);
  }

  const progress = (ev: any) => {
    if (quiet) return;
    if (ev?.type === 'progress' && ev.message) {
      console.error(`[${ev.check || 'scan'}] ${ev.status || ''} ${ev.message}`.trim());
    }
  };

  try {
    const result = await runScan({ url, options: { profile } }, { onProgress: progress });

    const outFormat =
      format === 'auto' ? (process.stdout.isTTY ? 'markdown' : 'json') : format;

    if (outFormat === 'json') {
      // Strip large graph relational blobs for CLI JSON by default
      const payload = {
        url: result.url,
        score: result.score,
        score_version: result.score_version,
        band: undefined as string | undefined,
        duration_ms: result.duration_ms,
        framework: result.framework,
        surfaces: result.surfaces,
        dimensions: result.dimensions,
        journeys: {
          overallCompletionRate: result.journeys.overallCompletionRate,
          avgHopCount: result.journeys.avgHopCount,
          highRiskJourneys: result.journeys.highRiskJourneys,
          traces: result.journeys.traces.map((t) => ({
            journey: t.journey,
            label: t.label,
            success: t.success,
            status: t.status,
            hopCount: t.hopCount,
            hallucinationPressure: t.hallucinationPressure,
            recommendedFix: t.recommendedFix,
          })),
        },
        graph: {
          nodeCount: result.graph.nodes.length,
          edgeCount: result.graph.edges.length,
          metrics: result.graph.metrics,
        },
      };
      const { scoreBandLabel } = await import('../src/lib/scanner/shared/scoreBand');
      payload.band = scoreBandLabel(result.score);
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(formatScanMarkdown(result));
    }

    if (failUnder !== null && result.score < failUnder) {
      console.error(`\nScore ${result.score} is below --fail-under ${failUnder}`);
      process.exit(3);
    }
    process.exit(0);
  } catch (err: any) {
    const code = err?.code === 'SSRF_BLOCKED' || err?.code === 'INVALID_URL' ? 2 : 1;
    console.error(`Error: ${err.message}`);
    process.exit(code);
  }
}

main();
