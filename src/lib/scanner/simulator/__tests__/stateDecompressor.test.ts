import { describe, it, expect } from 'vitest';
import { decompressFlightHash, convertSessionToJourneyResult } from '../stateDecompressor';
import { generateJourneyTreeSvg, svgToBase64 } from '../journeyTreeSvg';
import { deflateSync } from 'node:zlib';

describe('Glintbase Web State Decompressor & Visual Journey Svg', () => {
  const mockSession = {
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
        { action: 'docs', details: 'Found /llms.txt', status: 'ok', tokensConsumed: 2200 },
        { action: 'auth', details: 'Extracted API key scopes from /auth.md', status: 'ok', tokensConsumed: 880 },
        { action: 'api', details: 'Called POST /v1/charges', status: 'ok', tokensConsumed: 2000 },
      ],
    },
  };

  it('decompresses base64url-deflated hash into complete session', async () => {
    const jsonStr = JSON.stringify(mockSession);
    const deflated = deflateSync(Buffer.from(jsonStr, 'utf-8'), { level: 9 }).toString('base64url');
    const hash = `#data=${deflated}`;

    const decompressed = await decompressFlightHash(hash);
    expect(decompressed).toBeDefined();
    expect(decompressed?.target).toBe('https://stripe.com');
    expect(decompressed?.persona).toBe('Claude Code');
    expect(decompressed?.telemetry.totalTokensBurned).toBe(5200);
    expect(decompressed?.telemetry.steps.length).toBe(4);
  });

  it('converts decompressed session to full JourneyExecutionResult', () => {
    const result = convertSessionToJourneyResult(mockSession);
    expect(result.status).toBe('success');
    expect(result.target).toBe('https://stripe.com');
    expect(result.nodes.length).toBe(4);
    expect(result.lines?.length).toBe(3);
    expect(result.kpis.answerEfficiency).toBe(82); // 100 - 18
    expect(result.nodes[0].iconType).toBeDefined();
    expect(result.nodes[0].coord).toBeDefined();
  });

  it('generates a valid SVG diagram for the session', () => {
    const svg = generateJourneyTreeSvg(mockSession.telemetry, 'Claude Code', 'https://stripe.com');
    expect(svg).toContain('<svg');
    expect(svg).toContain('Claude Code');
    expect(svg).toContain('stripe.com');
    expect(svg).toContain('5,200');
    expect(svg).toContain('ZERO-FRICTION FLIGHT');

    const base64 = svgToBase64(svg);
    expect(typeof base64).toBe('string');
    expect(base64.length).toBeGreaterThan(50);
  });
});
