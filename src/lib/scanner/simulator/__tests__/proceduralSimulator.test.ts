import { describe, it, expect, vi } from 'vitest';
import { E2BRunner } from '../e2bRunner';
import type { ProceduralStreamEvent, HarnessType } from '../types';

describe('Procedural Agent Flight Simulator & 3D Mascot Coordination', () => {
  it('streams procedural events step-by-step with authentic coordinates and telemetry', async () => {
    const events: any[] = [];
    const onProgress = (event: any) => {
      events.push(event);
    };

    const result = await E2BRunner.runMission(
      {
        target: 'https://stripe.com',
        harness: 'claude-code',
        intent: 'Find API docs and authentication specifications for stripe.com',
        mode: 'deterministic',
      },
      onProgress
    );

    // Verify initial lifecycle events
    expect(events.length).toBeGreaterThan(10);
    const spawnEvent = events.find((e) => e.type === 'agent_spawn');
    expect(spawnEvent).toBeDefined();
    expect(spawnEvent.harness).toBe('claude-code');
    expect(spawnEvent.startCoord).toHaveProperty('x');
    expect(spawnEvent.startCoord).toHaveProperty('y');

    // Verify navigation and reaction steps
    const navEvents = events.filter((e) => e.type === 'agent_navigate');
    expect(navEvents.length).toBeGreaterThanOrEqual(4);
    expect(navEvents.length).toBe(result.nodes.length);
    expect(navEvents[0].toCoord.x).toBeGreaterThan(0);
    expect(navEvents[0].toCoord.y).toBeGreaterThan(0);

    const reactionEvents = events.filter((e) => e.type === 'agent_reaction');
    expect(reactionEvents.length).toBeGreaterThanOrEqual(4);
    expect(['scanning', 'success', 'friction', 'idle', 'nod', 'nope', 'backtrack']).toContain(reactionEvents[0].reaction);

    // Verify materialized nodes
    const nodeEvents = events.filter((e) => e.type === 'node_materialized');
    expect(nodeEvents.length).toBe(result.nodes.length);
    nodeEvents.forEach((ne) => {
      expect(ne.node).toHaveProperty('id');
      expect(ne.node).toHaveProperty('label');
      expect(ne.node.coord.x).toBeGreaterThan(0);
      expect(ne.node.coord.y).toBeGreaterThan(0);
    });

    // Verify connected lines
    const lineEvents = events.filter((e) => e.type === 'line_connected');
    expect(lineEvents.length).toBeGreaterThan(0);
    lineEvents.forEach((le) => {
      expect(le.line.fromCoord).toBeDefined();
      expect(le.line.toCoord).toBeDefined();
      expect(le.line.status).toMatch(/pass|warn|fail/);
    });

    // Verify telemetry ticks
    const tickEvents = events.filter((e) => e.type === 'telemetry_tick');
    expect(tickEvents.length).toBeGreaterThan(5);
    const lastTick = tickEvents[tickEvents.length - 1];
    expect(lastTick.stepsCount).toBe(result.nodes.length);
    expect(lastTick.tokensBurned).toBeGreaterThan(0);
    expect(lastTick.durationSeconds).toBeGreaterThan(0);

    // Verify final result structure
    expect(result.status).toBe('success');
    expect(result.kpis.answerFromSite).toBe(100);
    expect(result.kpis.answerEfficiency).toBeGreaterThanOrEqual(50);
    expect(result.insight.summary).toBeTruthy();
    expect(result.insight.bulletPoints.length).toBeGreaterThan(0);
    expect(result.lines).toBeDefined();
    expect(result.lines!.length).toBeGreaterThan(0);
  }, 15000);

  it('supports all 4 agent harnesses for 3D mascot navigation', async () => {
    const harnesses: HarnessType[] = ['claude-code', 'openclaw', 'hermes', 'opencode'];

    for (const harness of harnesses) {
      let spawned = false;
      const result = await E2BRunner.runMission(
        {
          target: 'https://example.com',
          harness,
          intent: 'Quick test',
          mode: 'deterministic',
        },
        (e) => {
          if (e.type === 'agent_spawn' && e.harness === harness) spawned = true;
        }
      );

      expect(spawned).toBe(true);
      expect(result.harness).toBe(harness);
      expect(result.nodes.length).toBeGreaterThan(0);
    }
  }, 35000);

  it('correctly resolves target URLs generically without hardcoded domain overrides', async () => {
    // Exact domains must be preserved directly
    expect(await E2BRunner.resolveTargetUrl('tastelabs.com')).toBe('https://tastelabs.com');
    expect(await E2BRunner.resolveTargetUrl('https://tastelabs.com')).toBe('https://tastelabs.com');
    expect(await E2BRunner.resolveTargetUrl('tastelabs')).toBe('https://tastelabs.com');
    expect(await E2BRunner.resolveTargetUrl('stripe.com')).toBe('https://stripe.com');
    expect(await E2BRunner.resolveTargetUrl('stripe')).toBe('https://stripe.com');
    expect(await E2BRunner.resolveTargetUrl('docs.github.com')).toBe('https://docs.github.com');
    expect(await E2BRunner.resolveTargetUrl('')).toBe('https://stripe.com');
  });

  it('sanitizes nextPath to prevent localhost or domain leaks in simulator steps', () => {
    expect(E2BRunner.sanitizeNextPath('tastelabs.com/docs', 'tastelabs.com')).toBe('/docs');
    expect(E2BRunner.sanitizeNextPath('https://tastelabs.com/api/v1', 'tastelabs.com')).toBe('/api/v1');
    expect(E2BRunner.sanitizeNextPath('localhost:3000/pricing', 'tastelabs.com')).toBe('/pricing');
    expect(E2BRunner.sanitizeNextPath('/settings', 'tastelabs.com')).toBe('/settings');
    expect(E2BRunner.sanitizeNextPath('example.com/llms.txt', 'example.com')).toBe('/llms.txt');
  });
});

