/**
 * CLI Command: glintbase remediate [artifact]
 * Autonomously generates and updates agent-ready artifacts (auth.md, llms.txt, robots.txt, mcp.json)
 */

import { Command } from 'commander';
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import pc from 'picocolors';

export const remediateCommand = new Command('remediate')
  .description('Autonomously generate or patch agent-ready artifacts in your repository')
  .argument('[artifact]', 'Artifact to generate: auth.md | llms.txt | robots.txt | mcp.json | all', 'all')
  .option('--output-dir <path>', 'Destination directory (defaults to ./public or ./)')
  .option('--force', 'Overwrite existing files without prompting', false)
  .action(async (artifact: string, opts: any) => {
    console.log('');
    console.log(pc.cyan(`╭─  ${pc.bold('GLINTBASE AUTONOMOUS REMEDIATION')}  ──────────────────────────────────────────╮`));
    console.log(pc.cyan('│') + pc.dim('  Inspecting local workspace and generating agent-ready specifications...'.padEnd(76, ' ')) + pc.cyan('│'));
    console.log(pc.cyan(`╰─────────────────────────────────────────────────────────────────────────────╯\n`));

    const cwd = process.cwd();
    let pkgName = 'My Project';
    let pkgDesc = 'API & Developer Platform';

    if (existsSync(join(cwd, 'package.json'))) {
      try {
        const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
        pkgName = pkg.name || pkgName;
        pkgDesc = pkg.description || pkgDesc;
      } catch {
        /* ignore */
      }
    }

    // Determine target directory (prefer ./public if Next.js/Vite/Astro, else root)
    const hasPublicDir = existsSync(join(cwd, 'public'));
    const targetDir = opts.outputDir ? resolve(cwd, opts.outputDir) : hasPublicDir ? join(cwd, 'public') : cwd;

    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    const tasks = [];
    const normalized = artifact.toLowerCase();

    if (normalized === 'all' || normalized === 'auth.md' || normalized === 'auth') {
      tasks.push({
        file: 'auth.md',
        path: join(targetDir, 'auth.md'),
        content: generateAuthMd(pkgName),
        label: 'WorkOS Agent Auth Handbook (/auth.md)',
      });
    }

    if (normalized === 'all' || normalized === 'llms.txt' || normalized === 'llms') {
      tasks.push({
        file: 'llms.txt',
        path: join(targetDir, 'llms.txt'),
        content: generateLlmsTxt(pkgName, pkgDesc),
        label: 'Agent Content Index (/llms.txt)',
      });
    }

    if (normalized === 'all' || normalized === 'robots.txt' || normalized === 'robots') {
      tasks.push({
        file: 'robots.txt',
        path: join(targetDir, 'robots.txt'),
        content: generateRobotsTxt(),
        label: 'AI Bot Policy (/robots.txt)',
      });
    }

    if (normalized === 'all' || normalized === 'mcp.json' || normalized === 'mcp') {
      tasks.push({
        file: 'mcp.json',
        path: join(targetDir, 'mcp.json'),
        content: generateMcpJson(pkgName),
        label: 'Model Context Protocol Config (/mcp.json)',
      });
    }

    let createdCount = 0;

    for (const t of tasks) {
      const fileExists = existsSync(t.path);
      if (fileExists && !opts.force) {
        console.log(`  ${pc.yellow('▲')}  ${pc.bold(t.file)} already exists at ${pc.dim(t.path)}. Use ${pc.cyan('--force')} to overwrite.`);
        continue;
      }

      writeFileSync(t.path, t.content, 'utf8');
      console.log(`  ${pc.green('✓')}  ${pc.bold(pc.white(t.file))} generated → ${pc.dim(t.path)}`);
      createdCount++;
    }

    console.log('');
    if (createdCount > 0) {
      console.log(pc.green(`  ✦ Successfully remediated ${createdCount} artifact(s)!`));
      console.log(pc.dim(`  Run \`glintbase audit\` or push your branch to trigger the CI gate.\n`));
    } else {
      console.log(pc.dim(`  No files modified. Use \`glintbase remediate --force\` to overwrite.\n`));
    }
  });

function generateAuthMd(name: string): string {
  return `---
title: Agent Authentication Handbook
version: 1.0.0
target: ${name}
auth_schemes:
  - api_key
  - oauth2_client_credentials
endpoints:
  token: https://api.example.com/oauth/v2/token
  keys: https://dashboard.example.com/api-keys
---

# Agent Authentication Protocol

This handbook instructs autonomous AI agents on authenticating requests to **${name}**.

## 1. API Key Authentication (Recommended for Agents)
Pass your API secret key in the \`Authorization\` HTTP header:

\`\`\`http
GET /api/v1/resource HTTP/1.1
Host: api.example.com
Authorization: Bearer YOUR_API_KEY
\`\`\`

## 2. OAuth2 Client Credentials
Autonomous agents with service accounts may obtain machine tokens via client credentials:

\`\`\`http
POST /oauth/v2/token HTTP/1.1
Host: api.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET
\`\`\`

## 3. Rate Limits & Headers
- Standard IETF RateLimit headers are returned on all endpoints:
  - \`RateLimit-Limit\`: Requests allowed in current window
  - \`RateLimit-Remaining\`: Requests remaining
  - \`RateLimit-Reset\`: Seconds until window reset
`;
}

function generateLlmsTxt(name: string, desc: string): string {
  return `# ${name}

> ${desc}

## Overview
- [Documentation](https://docs.example.com): Complete API and guides reference
- [Quickstart Guide](https://docs.example.com/quickstart): 5-minute setup
- [OpenAPI Specification](https://api.example.com/openapi.json): Full machine-readable API catalog
- [Authentication](https://example.com/auth.md): Machine authentication handbook

## Key APIs & Resources
- [Authentication Guide](https://example.com/auth.md): Token generation and key provisioning
- [Models & Endpoints](https://docs.example.com/api): REST and streaming operations
- [Error Codes](https://docs.example.com/errors): Typed HTTP problem responses
`;
}

function generateRobotsTxt(): string {
  return `# Glintbase Agent-Ready robots.txt
# Permits AI search and answer engines while preserving intellectual property

User-agent: ClaudeBot
Allow: /

User-agent: GPTBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

# Prevent disruptive scraper bots
User-agent: CCBot
Disallow: /

# Content Signals
# https://contentsignals.org
Content-Signals: search=yes, ai-train=no
`;
}

function generateMcpJson(name: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [name.toLowerCase().replace(/[^a-z0-9]/g, '-')]: {
          url: 'https://api.example.com/sse',
          transport: 'sse',
        },
      },
    },
    null,
    2
  );
}
