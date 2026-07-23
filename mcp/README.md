# @glintbase/mcp

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

## The 9 tools

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
