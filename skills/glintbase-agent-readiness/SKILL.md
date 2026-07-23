---
name: glintbase-agent-readiness
description: Audit whether AI coding agents (Cursor, Claude Code, Copilot, Windsurf) can discover, parse, and complete integration journeys against a product's docs and machine surfaces, then get a versioned Agent Readiness Score (ARS). Use when the user asks "is my docs agent-ready", "audit my API docs for AI agents", "scan my docs for MCP / llms.txt readiness", "why can't agents use my docs", "check agent readiness", "score my developer ecosystem", before shipping a docs change, or when comparing how AI-friendly two developer products are. Works through the Glintbase MCP server (in-editor, zero-config) or the Glintbase CLI (CI gates).
metadata:
  version: 1.0.0
---

# Glintbase Agent Readiness

Glintbase scans a developer product's documentation ecosystem and answers one question: **can an AI coding agent actually discover, retrieve, and complete real integration journeys against it?** The output is a versioned **Agent Readiness Score (ARS 1.0)**, a 0-100 composite across eight weighted dimensions, plus prioritized, templated remediation.

This skill teaches you how to drive Glintbase through the **MCP server** (interactive, inside the editor) and the **CLI** (CI gates), how to sequence the tools correctly, and how to interpret and act on the results.

## When to use this skill

Trigger on requests like:
- "Is my documentation agent-ready?" / "Can Cursor/Claude Code use my docs?"
- "Audit my API docs for AI agents" / "Score my developer ecosystem"
- "Why can't agents complete the quickstart from my docs?"
- "Add an agent-readiness gate to CI"
- "Compare how AI-friendly Stripe's docs are vs mine"
- Before shipping a docs/OpenAPI/llms.txt change, to check for regressions.

Not for: general SEO, website performance, or security audits.

## The two surfaces

| Surface | Use when | How it reasons |
|---------|----------|----------------|
| **MCP** (`@glintbase/mcp`) | Working inside a coding agent, interactive audits, iterating on fixes | Deterministic pipeline; **you (the agent) are the reasoning layer** over the JSON it returns |
| **CLI** (`@glintbase/cli`) | CI gates, scripted runs, shareable JSON/Markdown reports | Deterministic by default; `--agent` opts into an LLM harness using the user's own provider |

There is also a hosted web app at `scan.glintbase.dev` for one-click scans and a public leaderboard. See `references/mcp-vs-cli.md` for the full comparison.

## Install

### MCP (recommended for in-editor use)

Add to the agent's MCP config (Claude Code `.mcp.json`, or Cursor/Windsurf settings):

```json
{
  "mcpServers": {
    "glintbase": {
      "command": "npx",
      "args": ["-y", "@glintbase/mcp"]
    }
  }
}
```

Zero config: no API keys, no `.env`. For JS-heavy docs sites, optionally add `"env": { "FIRECRAWL_API_KEY": "fc-..." }` for premium extraction, but it is not required (see the golden path below).

### CLI

```bash
npm install -g @glintbase/cli
glintbase scan https://docs.example.com
# CI gate:
npx @glintbase/cli scan https://docs.example.com --fail-under 70 --quiet
```

## The golden path (MCP)

Always run the tools in this order. **For JS-rendered docs sites (Next.js, Docusaurus, Nextra, most modern SPAs), use `deep_crawl`, not `crawl_pages`** — a raw crawl returns a near-empty shell and the score will be misleadingly low.

```
discover_surfaces  ->  deep_crawl  ->  score_readiness  ->  get_remediation
```

1. **`discover_surfaces`** — find llms.txt, OpenAPI, MCP configs, sitemap, docs root, GitHub, SDK.
2. **`deep_crawl`** — recover real page content, including from JS-rendered shells, with no API key (extracts `__NEXT_DATA__`, App Router RSC flight chunks, JSON-LD, `<noscript>`, main-content). This populates the session, so the next step reuses it.
3. **`score_readiness`** — computes the composite ARS. Because the session already holds the deep-crawled pages, it skips re-crawling and scores the recovered content.
4. **`get_remediation`** — prioritized fixes with templates and expected score impact.

For static/server-rendered docs, `crawl_pages` is fine. When in doubt, prefer `deep_crawl`. Full rationale and session mechanics: `references/tool-sequences.md`.

## Tool quick reference

| Tool | Purpose |
|------|---------|
| `discover_surfaces` | Find all machine-readable entrypoints |
| `check_reachability` | Quick single-URL reachability + soft-404 detection |
| `parse_spec` | Parse OpenAPI / llms.txt / MCP configs without crawling |
| `crawl_pages` | Budgeted crawl for static/server-rendered docs |
| `deep_crawl` | In-depth crawl that recovers JS-rendered content (no API key) |
| `build_knowledge_graph` | Semantic graph from crawled pages |
| `run_journeys` | Deterministic agent journey simulations |
| `score_readiness` | Full pipeline -> composite ARS (auto-runs missing stages) |
| `get_remediation` | Prioritized fixes with templates and score impact |

## How to interpret and act on results

You are the reasoning layer. Do not just report the number — **read the evidence and act**:
- Open `get_remediation` and propose or apply the concrete fixes (add an `llms.txt`, expose `paths` in OpenAPI, link orphaned pages).
- If `run_journeys` shows a low completion rate, inspect which journeys failed and why (missing quickstart, dead-end pages, unparseable spec) before recommending changes.
- If a score looks surprisingly low on a modern docs site, confirm you used `deep_crawl` rather than `crawl_pages` — thin raw HTML depresses content and journey scores.

Score bands and dimension meanings: `references/interpreting-scores.md`.

## Reference files

- `references/tool-sequences.md` — golden path, when to use each tool, session reuse.
- `references/interpreting-scores.md` — ARS dimensions, bands, reading a discrepancy.
- `references/mcp-vs-cli.md` — MCP vs CLI vs hosted web, and which to pick.
