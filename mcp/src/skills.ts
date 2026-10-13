/**
 * Glintbase Bundled MCP Skills (ARS 3.2) for @glintbase/mcp
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface BundledSkill {
  name: string;
  title: string;
  description: string;
  uri: string;
  tags: string[];
  content: string;
}

export const BUNDLED_SKILLS: Record<string, BundledSkill> = {
  'glintbase-agent-readiness': {
    name: 'glintbase-agent-readiness',
    title: 'Glintbase Agent Readiness Master Playbook (ARS 3.2)',
    description: 'Master framework for auditing, scoring, and optimizing web applications and APIs across the 4 ARS 3.2 layers.',
    uri: 'skill://glintbase/agent-readiness',
    tags: ['ars-3.2', 'audit', 'playbook', 'standards'],
    content: `---
name: glintbase-agent-readiness
title: Glintbase Agent Readiness Master Playbook (ARS 3.2)
version: 3.2.0
layers: [discovery, access, usability, payments]
---

# Glintbase Agent Readiness Master Playbook (ARS 3.2)

Glintbase evaluates websites, developer portals, and APIs on the **Agent Readiness Score (ARS 3.2)**: a 0-100 score of which agent-readiness signals a product exposes and whether they work when probed. A check earns points only when the scanner observed the evidence; checks it could not verify are reported as skipped and excluded from the score. ARS 3.2 is not yet validated as a predictor of agent task success. Full methodology: https://glintbase.dev/methodology

## The 4 Layers of ARS 3.2 (129 registered checks)

Layer weights depend on the site's archetype (API/devtool and docs: Discovery 20, Access 30, Usability 35; e-commerce adds Payments 10).

1. **Discovery** (17 checks):
   - robots.txt with an explicit AI-crawler policy (ClaudeBot, GPTBot, PerplexityBot, OAI-SearchBot).
   - /.well-known/ard.json and AI catalog files; an MCP manifest with name, description, icon and endpoint.
   - An npm package under your brand that links back to your domain; Wikidata official-website claim (bonus).

2. **Access & Understanding** (45 checks):
   - Content readable without JavaScript; genuine HTTP 404 for missing routes (no SPA soft-200 shells).
   - /llms.txt with a heading, real links (the scanner fetches up to 8; at least 80% must resolve) and /llms-full.txt.
   - Accept: text/markdown content negotiation (with Vary: Accept), an OpenAPI spec at a standard path, sitemap.xml, meta description, canonical URL, JSON-LD, security headers.

3. **Usability & Interoperability** (61 checks):
   - A live MCP server: the scanner runs initialize, tools/list and an unknown-tool canary. Tools need object input schemas with typed properties and readOnlyHint / destructiveHint annotations; errors must be signalled in-channel (JSON-RPC error or isError: true). The scanner only ever calls tools annotated readOnlyHint: true with no required arguments.
   - OpenAPI quality read from the spec: unique operationIds, JSON request schemas, typed error responses, Idempotency-Key, rate-limit headers, problem+json, cursor pagination, OpenAPI 3.1.
   - Auth discoverability: RFC 9728 protected-resource metadata, RFC 8414 server metadata, WWW-Authenticate with resource_metadata; /auth.md stages are bonus-only.
   - WebMCP: navigator.modelContext tools or declarative form attributes (bonus).

4. **Payments** (6 checks, e-commerce only): ACP, UCP, AP2, x402, MPP agent-commerce protocols.

## How to raise a score honestly

- Fix what the scan reports as warn/fail; skipped checks mean the scanner could not verify something, not that you failed it.
- Check the evidence coverage line: layers flagged "low evidence" rest on few verifiable checks.
- Don't publish surfaces you don't support (fake OAuth metadata, placeholder APIs): ARS 3.2 inspects content, so empty or fabricated artifacts earn nothing.
`,
  },

  'living-artifacts-architect': {
    name: 'living-artifacts-architect',
    title: 'Living Artifacts Specification (llms.txt & ard.json)',
    description: 'Guidelines and templates for designing high-density, token-budgeted llms.txt, llms-full.txt, and ARD manifests.',
    uri: 'skill://glintbase/living-artifacts',
    tags: ['llms-txt', 'ard', 'machine-entrypoints', 'token-budget'],
    content: `---
name: living-artifacts-architect
title: Living Artifacts Specification (llms.txt & ard.json)
version: 3.0.0
---

# Living Artifacts Specification (llms.txt & ard.json)

Living artifacts are self-updating, machine-readable specifications placed at root HTTP paths to guide autonomous AI agents directly to the most critical information while avoiding context-window bloat.

## 1. /llms.txt Standard
Location: /public/llms.txt or root llms.txt
Maximum Token Budget: 25,000 tokens (Recommended: 2,000 - 8,000 tokens).

## 2. /.well-known/ard.json Standard
Agentic Resource Discovery (ARD v0.91) defines machine-verifiable discovery metadata.
`,
  },

  'agent-auth-handbook': {
    name: 'agent-auth-handbook',
    title: 'Agent Authentication Handbook (WorkOS auth.md)',
    description: 'Autonomous machine authentication standards, WorkOS auth.md schema, OAuth2 client credentials, and HTTP headers.',
    uri: 'skill://glintbase/agent-auth',
    tags: ['auth-md', 'workos', 'oauth2', 'machine-identity'],
    content: `---
name: agent-auth-handbook
title: Agent Authentication Handbook (WorkOS auth.md)
version: 3.0.0
---

# Agent Authentication Handbook (WorkOS auth.md)

Autonomous coding agents cannot navigate interactive CAPTCHAs, SMS 2FA prompts, or human SSO dashboards. Platform maintainers must expose machine-readable onboarding protocols via /auth.md.
`,
  },

  'streamable-mcp-builder': {
    name: 'streamable-mcp-builder',
    title: 'Streamable HTTP MCP Server Builder',
    description: 'Production architecture for deploying streamable HTTP MCP routes in Next.js and Express under Anthropic MCP 2024-11-05.',
    uri: 'skill://glintbase/streamable-mcp',
    tags: ['mcp', 'streamable-http', 'json-rpc', 'nextjs', 'express'],
    content: `---
name: streamable-mcp-builder
title: Streamable HTTP MCP Server Builder
version: 3.0.0
---

# Streamable HTTP MCP Server Builder

Model Context Protocol (MCP 2024-11-05) supports Streamable HTTP transport over /api/mcp (or /sse), enabling coding agents to discover and invoke tools with low latency and streaming progress.
`,
  },

  'webmcp-browser-integration': {
    name: 'webmcp-browser-integration',
    title: 'WebMCP Browser & Client Interoperability',
    description: 'Client-side agent tool registration via W3C draft window.modelContext and HTML form tool tags.',
    uri: 'skill://glintbase/webmcp',
    tags: ['webmcp', 'browser-agents', 'window.modelContext', 'dom-tools'],
    content: `---
name: webmcp-browser-integration
title: WebMCP Browser & Client Interoperability
version: 3.0.0
---

# WebMCP Browser & Client Interoperability

WebMCP enables web applications to expose tools and actions directly to browser-operating AI agents (e.g. ChatGPT Agent, Claude Computer Use, Antigravity) through window.modelContext.
`,
  },

  'token-tax-and-schema-optimizer': {
    name: 'token-tax-and-schema-optimizer',
    title: 'Token Tax & Schema Friction Elimination',
    description: 'Techniques for minimizing prompt bloat and eliminating ambiguous OpenAPI / MCP schemas that trigger hallucinations.',
    uri: 'skill://glintbase/token-tax-schema',
    tags: ['token-tax', 'prompt-bloat', 'schema-friction', 'hallucination'],
    content: `---
name: token-tax-and-schema-optimizer
title: Token Tax & Schema Friction Elimination
version: 3.0.0
---

# Token Tax & Schema Friction Elimination

The Token Tax measures the ratio of non-executable tokens an agent must ingest before reaching actionable API parameters.
`,
  },

  'flight-simulator-replay': {
    name: 'flight-simulator-replay',
    title: 'Agent Flight Simulator Diagnostic & Replay',
    description: 'Interpreting synthetic coding agent runs across Claude Code, Cursor, Perplexity, and Swarm personas.',
    uri: 'skill://glintbase/flight-simulator',
    tags: ['flight-simulator', 'personas', 'claude-code', 'cursor', 'perplexity'],
    content: `---
name: flight-simulator-replay
title: Agent Flight Simulator Diagnostic & Replay
version: 3.0.0
---

# Agent Flight Simulator Diagnostic & Replay

The Glintbase Flight Simulator executes synthetic agent personas against documentation and API endpoints to identify failure states before real users encounter them.
`,
  },

  'zero-drift-ci-gate': {
    name: 'zero-drift-ci-gate',
    title: 'Zero-Drift CI Quality Gate & PR Shield',
    description: 'Setting up automated GitHub Actions to block score regressions and post interactive PR comments.',
    uri: 'skill://glintbase/ci-gate',
    tags: ['ci-cd', 'github-actions', 'pr-shield', 'drift-detection'],
    content: `---
name: zero-drift-ci-gate
title: Zero-Drift CI Quality Gate & PR Shield
version: 3.0.0
---

# Zero-Drift CI Quality Gate & PR Shield

Prevent regressions in your developer documentation and machine interfaces by adding the Glintbase Quality Gate to your GitHub Actions workflow.
`,
  },
  'enterprise-agent-governance': {
    name: 'enterprise-agent-governance',
    title: 'Enterprise Agent Security & Zero-Trust Governance',
    description: 'Zero-Trust machine identity, soft-404 anti-hallucination barriers, mutation idempotency locks, and OWASP/ISO 42001 compliance standards.',
    uri: 'skill://glintbase/agent-governance',
    tags: ['enterprise', 'security', 'zero-trust', 'owasp', 'iso42001', 'idempotency'],
    content: `---
name: enterprise-agent-governance
title: Enterprise Agent Security & Zero-Trust Governance
version: 3.0.0
standards: [OWASP-LLM-Top10, ISO-42001, RFC-7807, RFC-9728]
---

# Enterprise Agent Security & Zero-Trust Governance

Autonomous AI coding agents (Claude Code, Cursor, Windsurf, Devin, Antigravity) pose new architectural attack surfaces for enterprise APIs and documentation portals.

## 1. Threat Vectors Addressed

1. **Soft-404 SPA Hallucination Traps (OWASP LLM07)**:
   - When non-existent routes return HTTP 200 Single-Page App HTML shells, agents attempt to parse HTML markup as API contracts and hallucinate fake parameter schemas.
   - **Remediation**: Implement strict 404 boundaries returning RFC 7807 Problem Details JSON (\`app/not-found.tsx\` or Express 404 middleware).

2. **Un-Idempotent Machine Mutations (OWASP LLM08)**:
   - Autonomous agent retries on state-changing endpoints (POST/PUT/DELETE) risk duplicate transactions or irreversible database updates.
   - **Remediation**: Require \`Idempotency-Key\` / \`X-Idempotency-Key\` headers and declare \`destructiveHint: true\` on MCP tools.

3. **Machine Identity & Ephemeral Credential Rotation (ISO 42001 A.6.2)**:
   - Eliminates static API keys in agent configurations in favor of RFC 9728 machine token exchange and granular Bearer token scopes.
   - Standardizes machine discovery via \`/auth.md\`.

4. **Agent Telemetry & Audit Logging (ISO 42001 A.9.1)**:
   - Log \`X-Agent-ID\`, TLS JA4 fingerprints, and time-to-first-tool-call (TTFTC) to trace autonomous sessions across SIEM pipelines.
`,
  },
};

/**
 * Registers all 8 bundled skills on an MCP Server as:
 * 1. MCP Resources (skill://glintbase/<name>)
 * 2. MCP Prompts (optimize_<name>)
 */
export function registerSkillPromptsAndResources(server: McpServer): void {
  for (const skill of Object.values(BUNDLED_SKILLS)) {
    // 1. Register Resource
    server.resource(
      `skill-${skill.name}`,
      skill.uri,
      async () => ({
        contents: [
          {
            uri: skill.uri,
            mimeType: 'text/markdown',
            text: skill.content,
          },
        ],
      })
    );

    // 2. Register Prompt
    server.prompt(
      `optimize-${skill.name}`,
      skill.description,
      {
        target: z.string().optional().describe('Target codebase directory or URL to optimize'),
      },
      async ({ target }) => ({
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Please use the "${skill.title}" skill guidelines below to optimize ${target || 'this project'}:\n\n${skill.content}`,
            },
          },
        ],
      })
    );
  }
}
