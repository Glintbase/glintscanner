/**
 * MCP tool tests — session management, tool registration, error handling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSession, resetSession, getSessionStatus, getNextSteps } from '../src/session.js';

describe('session', () => {
  it('creates an empty session', () => {
    const session = createSession();
    expect(session.url).toBeNull();
    expect(session.surfaces).toBeNull();
    expect(session.pages).toBeNull();
    expect(session.graph).toBeNull();
    expect(session.journeys).toBeNull();
    expect(session.score).toBeNull();
    expect(session.startedAt).toBeNull();
  });

  it('resets session with new URL', () => {
    const session = createSession();
    resetSession(session, 'https://example.com');
    expect(session.url).toBe('https://example.com');
    expect(session.startedAt).toBeTypeOf('number');
  });

  it('tracks session status', () => {
    const session = createSession();
    const status = getSessionStatus(session);
    expect(status.discovery).toBe(false);
    expect(status.crawl).toBe(false);
    expect(status.graph).toBe(false);
    expect(status.journeys).toBe(false);
    expect(status.score).toBe(false);
  });

  it('reflects populated stages in status', () => {
    const session = createSession();
    session.surfaces = [] as any;
    const status = getSessionStatus(session);
    expect(status.discovery).toBe(true);
    expect(status.crawl).toBe(false);
  });

  it('suggests next steps based on state', () => {
    const session = createSession();
    const steps = getNextSteps(session);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]).toContain('discover_surfaces');
  });

  it('suggests crawl after discovery', () => {
    const session = createSession();
    session.surfaces = [] as any;
    const steps = getNextSteps(session);
    expect(steps.some((s) => s.includes('crawl_pages'))).toBe(true);
    expect(steps.some((s) => s.includes('discover_surfaces'))).toBe(false);
  });
});

describe('tool registration', () => {
  it('registers all 9 tools', async () => {
    // Dynamic import to avoid starting the server
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const { registerTools } = await import('../src/tools/index.js');

    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const session = createSession();
    registerTools(server, session);

    // The server should have tools registered - verify by checking internal state
    // MCP SDK stores tools in a map
    const tools = (server as any)._registeredTools;
    expect(tools).toBeDefined();
    const toolNames = Object.keys(tools);
    expect(toolNames).toContain('discover_surfaces');
    expect(toolNames).toContain('check_reachability');
    expect(toolNames).toContain('parse_spec');
    expect(toolNames).toContain('crawl_pages');
    expect(toolNames).toContain('deep_crawl');
    expect(toolNames).toContain('build_knowledge_graph');
    expect(toolNames).toContain('run_journeys');
    expect(toolNames).toContain('score_readiness');
    expect(toolNames).toContain('get_remediation');
    expect(toolNames.length).toBe(9);
  });
});
