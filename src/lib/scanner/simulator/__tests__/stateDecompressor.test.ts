import { describe, it, expect } from 'vitest';
import { decompressFlightHash, convertSessionToJourneyResult } from '../stateDecompressor';
import { generateJourneyTreeSvg, generateFlightHud, generateJourneyMermaid, svgToBase64 } from '../journeyTreeSvg';
import { deflateSync } from 'node:zlib';

const v2Session = {
  v: 2,
  timestamp: Date.now(),
  target: 'https://stripe.com',
  persona: 'claude-code',
  intent: 'Find the API docs',
  telemetry: {
    mode: 'preview',
    outcome: 'completed',
    totalDurationMs: 1234,
    totalTokensBurned: 900,
    agentFilesFound: 1,
    agentFilesChecked: 2,
    summary: 'Preview of stripe.com.',
    steps: [
      { action: 'INDEX', details: 'home', status: 'ok', httpStatus: 200, url: 'https://stripe.com', bytes: 3200, durationMs: 300, tokensConsumed: 800 },
      { action: 'LLMS.TXT', details: 'llms.txt', status: 'ok', httpStatus: 200, url: 'https://stripe.com/llms.txt', bytes: 400, durationMs: 120, tokensConsumed: 100 },
      { action: 'API SPEC', details: 'openapi.json', status: 'error', httpStatus: 404, url: 'https://stripe.com/openapi.json', bytes: 0, durationMs: 90, tokensConsumed: 0 },
    ],
  },
};

const v1Session = {
  v: 1,
  timestamp: Date.now(),
  target: 'https://stripe.com',
  persona: 'Claude Code',
  telemetry: {
    outcome: 'completed',
    totalTokensBurned: 5200,
    schemaFrictionScore: 18,
    steps: [
      { action: 'discover', details: 'Probed /robots.txt', status: 'ok', tokensConsumed: 120 },
      { action: 'docs', details: 'Found /llms.txt', status: 'error', tokensConsumed: 2200 },
    ],
  },
};

describe('Simulate replay links', () => {
  it('decompresses a base64url-deflated hash', async () => {
    const hash = `#data=${deflateSync(Buffer.from(JSON.stringify(v2Session), 'utf-8'), { level: 9 }).toString('base64url')}`;
    const decompressed = await decompressFlightHash(hash);
    expect(decompressed?.target).toBe('https://stripe.com');
    expect(decompressed?.telemetry.steps.length).toBe(3);
  });

  it('rebuilds a v2 replay from measured fields only', () => {
    const result = convertSessionToJourneyResult(v2Session);
    expect(result.mode).toBe('preview');
    expect(result.status).toBe('success');
    expect(result.nodes.map((n) => n.httpStatus)).toEqual([200, 200, 404]);
    expect(result.nodes.map((n) => n.latencyMs)).toEqual([300, 120, 90]);
    expect(result.telemetry.durationSeconds).toBe(1.2);
    expect(result.telemetry.tokensBurned).toBe(900);
    expect(result.kpis).toEqual({ pagesReachedPct: 67, deadEnds: 1, agentFilesFound: 1, agentFilesChecked: 2 });
    expect(result.lines).toHaveLength(2);
  });

  it('does not invent statuses or scores for old v1 links', () => {
    const result = convertSessionToJourneyResult(v1Session);
    expect(result.nodes.every((n) => n.httpStatus === undefined)).toBe(true);
    expect(result.insight.summary).toMatch(/Older replay link/);
    expect(JSON.stringify(result)).not.toMatch(/answerEfficiency|schemaFriction/);
  });

  it('renders SVG, Mermaid and HUD from measured statuses', () => {
    const svg = generateJourneyTreeSvg(v2Session.telemetry, 'claude-code', 'https://stripe.com');
    expect(svg).toContain('<svg');
    expect(svg).toContain('HTTP 404');
    expect(svg).toContain('AGENT FILES FOUND');
    expect(svg).not.toMatch(/FRICTION|HALLUCINATION/);
    expect(svgToBase64(svg).length).toBeGreaterThan(50);

    const mermaid = generateJourneyMermaid(v2Session.telemetry, 'claude-code', 'https://stripe.com');
    expect(mermaid).toContain('HTTP 404');
    expect(mermaid).not.toContain('200 OK');

    const hud = generateFlightHud(v2Session.telemetry, 'claude-code', 'https://stripe.com', 'https://scan.glintbase.dev/simulate#data=x');
    expect(hud).toContain('Preview (no agent run)');
    expect(hud).toContain('`/openapi.json` | HTTP 404');
    expect(hud).not.toMatch(/Friction|RISK/);
  });
});
