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
  it('registers all 12 tools', async () => {
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const { registerTools } = await import('../src/tools/index.js');

    const server = new McpServer({ name: 'test', version: '3.0.0' });
    const session = createSession();
    registerTools(server, session);

    const tools = (server as any)._registeredTools;
    expect(tools).toBeDefined();
    const toolNames = Object.keys(tools);
    const expected = [
      'discover_surfaces',
      'check_reachability',
      'parse_spec',
      'crawl_pages',
      'deep_crawl',
      'build_knowledge_graph',
      'run_journeys',
      'score_readiness',
      'get_remediation',
      'recheck_issues',
      'discover_products',
      'get_skill',
    ];
    expect(toolNames).toHaveLength(12);
    for (const name of expected) {
      expect(toolNames).toContain(name);
    }
  });
});

describe('bundled skills (prompts and resources)', () => {
  it('registers all 9 skills as MCP Prompts and Resources', async () => {
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const { registerSkillPromptsAndResources, BUNDLED_SKILLS } = await import('../src/skills.js');

    const server = new McpServer({ name: 'test', version: '3.0.0' });
    registerSkillPromptsAndResources(server);

    const prompts = (server as any)._registeredPrompts;
    const resources = (server as any)._registeredResources;

    expect(prompts).toBeDefined();
    expect(resources).toBeDefined();

    const promptNames = Object.keys(prompts);
    const resourceKeys = Object.keys(resources);

    expect(promptNames).toHaveLength(9);
    expect(resourceKeys).toHaveLength(9);

    for (const skill of Object.values(BUNDLED_SKILLS)) {
      expect(promptNames).toContain(`optimize-${skill.name}`);
      expect(resourceKeys).toContain(skill.uri);
    }
  });
});

describe('MCP Client & Server E2E Verification', () => {
  it('supports full tool calling, prompt retrieval, and resource reading over standard protocol', async () => {
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const { registerTools } = await import('../src/tools/index.js');
    const { registerSkillPromptsAndResources, BUNDLED_SKILLS } = await import('../src/skills.js');

    const server = new McpServer(
      { name: 'glintbase', version: '3.0.0' },
      { capabilities: { prompts: {}, resources: {}, tools: {} } }
    );

    registerSkillPromptsAndResources(server);
    const session = createSession();
    registerTools(server, session);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client(
      { name: 'agent-client', version: '1.0.0' },
      { capabilities: { prompts: {}, resources: {}, tools: {} } }
    );

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    try {
      // 1. Verify tools list
      const toolList = await client.listTools();
      expect(toolList.tools).toHaveLength(12);

      // 2. Call get_skill for enterprise-agent-governance
      const govSkillResult = await client.callTool({
        name: 'get_skill',
        arguments: { skill_name: 'enterprise-agent-governance' },
      });
      expect(govSkillResult.isError).toBeFalsy();
      const govText = (govSkillResult.content[0] as { text: string }).text;
      expect(govText).toContain('Enterprise Agent Security & Zero-Trust Governance');
      expect(govText).toContain('OWASP');
      expect(govText).toContain('Idempotency');

      // 3. Call get_skill for glintbase-agent-readiness
      const arResult = await client.callTool({
        name: 'get_skill',
        arguments: { skill_name: 'glintbase-agent-readiness' },
      });
      expect(arResult.isError).toBeFalsy();
      const arText = (arResult.content[0] as { text: string }).text;
      expect(arText).toContain('ARS 3.0');

      // 4. Call get_skill with unknown name -> structured helpful error
      const unknownResult = await client.callTool({
        name: 'get_skill',
        arguments: { skill_name: 'non-existent-skill' },
      });
      expect(unknownResult.isError).toBe(true);
      const unknownText = (unknownResult.content[0] as { text: string }).text;
      expect(unknownText).toContain('Skill "non-existent-skill" not found');
      expect(unknownText).toContain('enterprise-agent-governance');

      // 5. Verify prompts list
      const promptList = await client.listPrompts();
      expect(promptList.prompts).toHaveLength(9);

      // 6. Retrieve a prompt
      const promptMsg = await client.getPrompt({
        name: 'optimize-flight-simulator-replay',
        arguments: { target: 'https://demo.glintbase.xyz' },
      });
      expect(promptMsg.messages).toHaveLength(1);
      const pText = (promptMsg.messages[0].content as { text: string }).text;
      expect(pText).toContain('https://demo.glintbase.xyz');
      expect(pText).toContain('Agent Flight Simulator Diagnostic & Replay');

      // 7. Verify resources list
      const resourceList = await client.listResources();
      expect(resourceList.resources).toHaveLength(9);

      // 8. Read a resource
      const resourceData = await client.readResource({
        uri: 'skill://glintbase/agent-governance',
      });
      expect(resourceData.contents).toHaveLength(1);
      expect(resourceData.contents[0].mimeType).toBe('text/markdown');
      const rText = (resourceData.contents[0] as { text: string }).text;
      expect(rText).toContain('Enterprise Agent Security & Zero-Trust Governance');
    } finally {
      await client.close();
      await server.close();
    }
  });
});

