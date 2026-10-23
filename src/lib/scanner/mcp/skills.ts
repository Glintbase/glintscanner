/**
 * Glintbase Bundled MCP Skills (ARS 3.3)
 *
 * Comprehensive suite of 8 production-grade playbooks delivered tri-modally:
 * 1. MCP Resources (skill://glintbase/<name>)
 * 2. MCP Prompts (optimize_<name>)
 * 3. MCP Tools (glintbase_get_skill / glintbase_install_skill)
 */

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
    title: 'Glintbase Agent Readiness Master Playbook (ARS 3.3)',
    description: 'Master framework for auditing, scoring, and optimizing web applications and APIs across the 4 ARS 3.3 layers.',
    uri: 'skill://glintbase/agent-readiness',
    tags: ['ars-3.3', 'audit', 'playbook', 'standards'],
    content: `---
name: glintbase-agent-readiness
title: Glintbase Agent Readiness Master Playbook (ARS 3.3)
version: 3.3.0
layers: [discovery, access, usability, payments]
---

# Glintbase Agent Readiness Master Playbook (ARS 3.3)

Glintbase evaluates websites, developer portals, and APIs on the **Agent Readiness Score (ARS 3.3)**: a 0-100 score of which agent-readiness signals a product exposes and whether they work when probed. A check earns points only when the scanner observed the evidence; checks it could not verify are reported as skipped and excluded from the score. ARS 3.3 is not yet validated as a predictor of agent task success. Full methodology: https://glintbase.dev/methodology

## The 4 Layers of ARS 3.3 (137 registered checks)

Layer weights depend on the site's archetype (API/devtool and docs: Discovery 20, Access 30, Usability 35; e-commerce adds Payments 10).

1. **Discovery** (18 checks):
   - robots.txt with an explicit AI-crawler policy (ClaudeBot, GPTBot, PerplexityBot, OAI-SearchBot).
   - /.well-known/ard.json and AI catalog files; an MCP manifest with name, description, icon and endpoint.
   - An npm package under your brand that links back to your domain; Wikidata official-website claim (bonus).

2. **Access & Understanding** (47 checks):
   - Content readable without JavaScript and no bot challenge or HTTP 403 for the scanner's request. These two are gates: failing either caps the score at 47.
   - Genuine HTTP 404 for missing routes (no SPA soft-200 shells).
   - /llms.txt is optional and never costs points when absent. When present it must be a real text index (not a soft-404), its links must resolve (the scanner fetches up to 8; at least 80% must), and linking it from your pages earns a bonus.
   - Accept: text/markdown content negotiation (with Vary: Accept) and a <link rel="alternate" type="text/markdown"> (bonus); an OpenAPI spec found via Link rel="service-desc", an RFC 9727 /.well-known/api-catalog, a page link or a standard path; sitemap.xml, meta description, canonical URL, JSON-LD, security headers.

3. **Usability & Interoperability** (66 checks):
   - A live MCP server: the scanner sends server/discover (MCP 2026-07-28), falls back to initialize for older servers, then runs tools/list and an unknown-tool canary. A Server Card listed in /.well-known/ai-catalog.json or served at <endpoint>/server-card earns a bonus. Tools need object input schemas with typed properties and readOnlyHint / destructiveHint annotations; errors must be signalled in-channel (JSON-RPC error or isError: true). The scanner only ever calls tools annotated readOnlyHint: true with no required arguments.
   - OpenAPI quality read from the spec: unique operationIds, JSON request schemas, typed error responses, Idempotency-Key, rate-limit headers, problem+json, cursor pagination, OpenAPI 3.1.
   - Auth discoverability: RFC 9728 protected-resource metadata, RFC 8414 server metadata, WWW-Authenticate with resource_metadata; /auth.md stages are bonus-only.
   - WebMCP: navigator.modelContext tools or declarative form attributes (bonus).

4. **Payments** (6 checks, e-commerce only): ACP, UCP, AP2, x402, MPP agent-commerce protocols.

## How to raise a score honestly

- Fix what the scan reports as warn/fail; skipped checks mean the scanner could not verify something, not that you failed it.
- Check the evidence coverage line: layers flagged "low evidence" rest on few verifiable checks.
- Don't publish surfaces you don't support (fake OAuth metadata, placeholder APIs): ARS 3.3 inspects content, so empty or fabricated artifacts earn nothing.
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

Location: \`/public/llms.txt\` or root \`llms.txt\`
Maximum Token Budget: 25,000 tokens (Recommended: 2,000 - 8,000 tokens).

### Standard Template:
\`\`\`markdown
# Product Name Documentation

> Concise one-sentence summary of what this platform does and its primary capabilities.

## Core API & Quickstart
- [Quickstart Guide](https://docs.example.com/quickstart.md): 5-minute guide to initial authentication and first API call.
- [Authentication Protocol](https://docs.example.com/auth.md): API keys, Bearer tokens, and WorkOS machine flows.
- [API Reference](https://api.example.com/openapi.json): Full OpenAPI 3.1 specification.

## Core Workflows
- [Manage Resources](https://docs.example.com/resources.md): CRUD operations for core domain entities.
- [Webhook Subscriptions](https://docs.example.com/webhooks.md): Event payload schemas and signature verification.

## MCP & Agent Entrypoints
- [Model Context Protocol](https://api.example.com/api/mcp): Streamable HTTP MCP server endpoint.
\`\`\`

## 2. /.well-known/ard.json Standard

Agentic Resource Discovery (ARD v0.91) defines machine-verifiable discovery metadata:
\`\`\`json
{
  "ardVersion": "0.91",
  "urn": "urn:air:example.com:core",
  "name": "Example API",
  "description": "Autonomous developer platform for cloud services.",
  "endpoints": {
    "llms": "/llms.txt",
    "auth": "/auth.md",
    "mcp": "/api/mcp",
    "openapi": "/openapi.json"
  },
  "trustManifest": {
    "signedBy": "security@example.com",
    "algorithm": "Ed25519"
  }
}
\`\`\`
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

Autonomous coding agents cannot navigate interactive CAPTCHAs, SMS 2FA prompts, or human SSO dashboards. Platform maintainers must expose machine-readable onboarding protocols via \`/auth.md\`.

## 1. WorkOS auth.md Frontmatter Standard

Location: \`/public/auth.md\` or \`/.well-known/auth.md\`

\`\`\`markdown
---
title: Machine & Agent Authentication Protocol
auth_schemes:
  - api_key
  - oauth2_client_credentials
endpoints:
  token: https://api.example.com/oauth/token
  revoke: https://api.example.com/oauth/revoke
headers:
  authorization: "Bearer <token>"
  agent_id: "X-Agent-ID"
  idempotency: "X-Idempotency-Key"
rate_limits:
  header_limit: "RateLimit-Limit"
  header_remaining: "RateLimit-Remaining"
  header_reset: "RateLimit-Reset"
---

# Agent Authentication Guide

## 1. Using API Keys
Autonomous callers provide their provisioned API key in the standard Authorization header:
\`\`\`http
GET /v1/account HTTP/1.1
Host: api.example.com
Authorization: Bearer sec_live_948f293b
X-Agent-ID: claude-code-workspace-1
\`\`\`

## 2. Machine-to-Machine OAuth2
Request temporary tokens using client credentials:
\`\`\`bash
curl -X POST https://api.example.com/oauth/token \\
  -d "grant_type=client_credentials" \\
  -d "client_id=$CLIENT_ID" \\
  -d "client_secret=$CLIENT_SECRET"
\`\`\`
\`\`\`
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

Model Context Protocol (MCP 2024-11-05) supports **Streamable HTTP transport** over \`/api/mcp\` (or \`/sse\`), enabling coding agents to discover and invoke tools with low latency and streaming progress.

## Next.js App Router Route Handler (\`app/api/mcp/route.ts\`)

\`\`\`typescript
import { NextRequest, NextResponse } from 'next/server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-MCP-Version, Accept',
  'X-MCP-Version': '2024-11-05',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { jsonrpc, method, params, id } = body;

  if (jsonrpc !== '2.0') {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: id ?? null },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (method === 'initialize') {
    return NextResponse.json({
      jsonrpc: '2.0',
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'api-mcp-server', version: '3.0.0' }
      },
      id
    }, { headers: CORS_HEADERS });
  }

  if (method === 'tools/list') {
    return NextResponse.json({
      jsonrpc: '2.0',
      result: {
        tools: [
          {
            name: 'get_status',
            description: 'Fetch system health and active services status.',
            inputSchema: { type: 'object', properties: {} },
            readOnlyHint: true
          }
        ]
      },
      id
    }, { headers: CORS_HEADERS });
  }

  return NextResponse.json(
    { jsonrpc: '2.0', error: { code: -32601, message: \`Method not found: \${method}\` }, id },
    { status: 404, headers: CORS_HEADERS }
  );
}
\`\`\`
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

WebMCP enables web applications to expose tools and actions directly to browser-operating AI agents (e.g. ChatGPT Agent, Claude Computer Use, Antigravity) through \`window.modelContext\`.

## 1. window.modelContext Standard

\`\`\`typescript
interface WebMcpTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

declare global {
  interface Window {
    modelContext?: {
      registerTool: (tool: WebMcpTool) => void;
      getTools: () => WebMcpTool[];
    };
  }
}
\`\`\`

## 2. React WebMcpProvider Component (\`WebMcpProvider.tsx\`)

\`\`\`tsx
'use client';

import React, { createContext, useEffect, useState } from 'react';

export const WebMcpContext = createContext<{ ready: boolean }>({ ready: false });

export function WebMcpProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const tools: Record<string, any> = {};

    window.modelContext = {
      registerTool: (tool) => {
        tools[tool.name] = tool;
      },
      getTools: () => Object.values(tools),
    };

    window.dispatchEvent(new CustomEvent('modelContextReady'));
    setReady(true);
  }, []);

  return (
    <WebMcpContext.Provider value={{ ready }}>
      {children}
    </WebMcpContext.Provider>
  );
}
\`\`\`
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

## 1. The Token Tax Formula
The **Token Tax** measures the ratio of non-executable tokens (navbars, tracking scripts, CSS, repetitive marketing copy) an agent must ingest before reaching actionable API parameters:

$$\\text{Prompt Bloat Multiplier} = \\frac{\\text{Raw Page Tokens}}{\\text{Semantic Markdown Tokens}}$$

Target: Bloat Multiplier $\\le 1.8\\times$. Unoptimized sites regularly exceed $12.5\\times$, wasting millions of tokens.

## 2. Eliminating Schema Friction
LLMs hallucinate parameters when schemas lack explicit descriptions or use loose types:
- **Never use \`type: "object"\` without \`properties\`**: Define explicit nested types.
- **Always specify \`required: [...]**\`: Explicitly enumerate mandatory fields.
- **Provide semantic descriptions**: Every property should explain its format, unit, and example.
- **Use String Enums instead of arbitrary text**: Restrict valid inputs using \`enum: ["USD", "EUR"]\`.
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

## The 4 Personas
1. **Claude Code**: Rigorous command-line agent. Relies on \`llms.txt\` and fast grep/curl exploration. Fails when SPA 404 routes return HTTP 200.
2. **Cursor Agent**: IDE context-driven agent. Reads local rule files (\`.cursor/\`) and prefers concise API signatures. Fails on undocumented auth headers.
3. **Perplexity Agent**: Answer-engine retrieval persona. Scans documentation headers and searches for quickstart code blocks. Fails on JavaScript-rendered text shells.
4. **Autonomous Swarm**: Parallel multi-agent swarm. Executes multiple sub-tasks simultaneously. Fails when rate-limit headers are missing or endpoints lack idempotency.

## How to Run
Use the MCP tool \`glintbase_simulate_flight\`:
\`\`\`json
{
  "target": ".",
  "persona": "claude-code",
  "intent": "Authenticate with API and query resource"
}
\`\`\`
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

## GitHub Actions Configuration (\`.github/workflows/ci.yml\`)

\`\`\`yaml
name: Glintbase Agent Readiness Gate
on: [push, pull_request]

jobs:
  agent-readiness:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Codebase
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run Glintbase CI Gate
        run: npx -y @glintbase/cli@latest ci . --fail-under 75 --comment
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
\`\`\`
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
