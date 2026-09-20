# @glintbase/mcp

[![npm version](https://img.shields.io/npm/v/@glintbase/mcp.svg?color=cb3837)](https://www.npmjs.com/package/@glintbase/mcp)
[![Smithery Badge](https://smithery.ai/badge/@glintbase/mcp)](https://smithery.ai/server/@glintbase/mcp)
[![Glama](https://glama.ai/mcp/servers/Glintbase/glintscanner/badges/score.svg)](https://glama.ai/mcp/servers/Glintbase/glintscanner)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**Zero-config agent-readiness tools for AI coding agents** — an [MCP](https://modelcontextprotocol.io) server that lets Claude Code, Cursor, Windsurf, OpenCode (and any MCP client) discover, crawl, and score how well a developer site works for AI agents.

No API keys. No `.env`. Your agent calls the tools and reasons over the results with its own subscription.

## Install

Add to your client's MCP config (e.g. `.mcp.json` for Claude Code):

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

Cursor (`~/.cursor/mcp.json`), Windsurf (`~/.codeium/windsurf/mcp_config.json`) use the same `mcpServers` shape. For OpenCode use the `mcp` block with `"type": "local"`.

## Tools

| Tool | What it does |
|------|--------------|
| `discover_surfaces` | Find machine-readable entrypoints (llms.txt, OpenAPI, MCP, docs, …) |
| `check_reachability` | Quick single-URL reachability + soft-404 detection |
| `parse_spec` | Parse OpenAPI / llms.txt / MCP configs without crawling |
| `crawl_pages` | Budgeted crawl with a priority queue (`quick`/`deep`) |
| `deep_crawl` | Recover JS-rendered content with **no API key** |
| `build_knowledge_graph` | Build a semantic graph from crawled pages |
| `run_journeys` | Deterministic agent journey simulations (no LLM) |
| `score_readiness` | Full pipeline → composite ARS score (auto-runs missing stages) |
| `get_remediation` | Prioritized fixes with templates and expected score impact |
| `recheck_issues` | Re-evaluate specific issues to verify fixes without full crawl |
| `discover_products` | Detect multi-product architectures and documentation sub-trees |
| `get_skill` | Fetch full step-by-step markdown optimization playbooks |

## 9 Bundled Skills (Prompts & Resources)

Available natively in your agent client as MCP Prompts (`optimize-<skill>`) and MCP Resources (`skill://glintbase/<name>`):

1. **`glintbase-agent-readiness`**: Master ARS 3.0 framework across all 6 pillars (Discovery, Access, Usability, Semantic, Architecture, Safety).
2. **`living-artifacts-architect`**: Specifications and recipes for high-density `/llms.txt` and `/.well-known/ard.json`.
3. **`agent-auth-handbook`**: Machine-to-machine authentication standards (WorkOS `auth.md`, OAuth 2.1, Bearer scopes).
4. **`streamable-mcp-builder`**: Streamable HTTP MCP server architecture for Next.js and Express.
5. **`webmcp-browser-integration`**: Client-side browser agent tools via `window.modelContext` and DOM tool tags.
6. **`token-tax-and-schema-optimizer`**: Schema friction reduction and context-window token bloat elimination.
7. **`flight-simulator-replay`**: Synthetic agent persona diagnostics (Claude Code, Cursor, Perplexity, Swarm).
8. **`zero-drift-ci-gate`**: GitHub Actions quality gate configuration and PR comments.
9. **`enterprise-agent-governance`**: Zero-Trust security, soft-404 barriers, mutation idempotency, and OWASP/ISO 42001 mapping.

## Golden path

```
discover_surfaces  ->  deep_crawl  ->  score_readiness  ->  get_remediation
```

Run `deep_crawl` before `score_readiness` on JS-heavy sites (Next.js, Docusaurus, SPAs) — it recovers the real content from embedded framework payloads (`__NEXT_DATA__`, RSC flight, JSON-LD, `<noscript>`) and populates the session, so scoring reuses those pages instead of re-crawling a thin shell.

## Optional: Firecrawl

For the hardest SPAs, set `FIRECRAWL_API_KEY` in the server `env` and pass `profile: "deep"`. Not required — the zero-dep extractor handles the common cases.

## Links

- Gateway & docs: [scan.glintbase.dev/mcp](https://scan.glintbase.dev/mcp)
- Source & methodology: [github.com/glintbase/glintscanner](https://github.com/glintbase/glintscanner)

## License

Apache-2.0
