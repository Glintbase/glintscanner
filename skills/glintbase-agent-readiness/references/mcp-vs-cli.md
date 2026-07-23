# MCP vs CLI vs Web

All three surfaces run the **same scanner core**. They differ in who supplies the AI reasoning, how content is extracted, and how results are delivered — which is why the same URL can score differently depending on the surface and profile.

| | **Web** (`scan.glintbase.dev`) | **CLI** (`@glintbase/cli`) | **MCP** (`@glintbase/mcp`) |
|---|---|---|---|
| Best for | One-click hosted scan, sharing, leaderboard | Local runs + CI gates | Driving from inside a coding agent |
| Setup | None (hosted) | `npm i -g`, optional `init` wizard | Zero-config, no keys |
| Journey engine | Deterministic (`quick`); LLM harness auto-on for `deep` | Deterministic; `--agent` opts into the harness | Always deterministic — the calling agent is the reasoning layer |
| LLM provider / cost | Hosted (Google), paid by host | Yours (cloud key or local Ollama / LM Studio) | None — the agent already reasons over the JSON |
| Content extraction | Raw + Firecrawl (if key) | Raw + Firecrawl (if key) | Raw + zero-dep `deep_crawl`; Firecrawl optional |
| Granularity | Full pipeline, one call | Full pipeline, one call | 9 composable tools over a cached session |
| Output | Interactive UI, graph, saved report, badge | Terminal + JSON/Markdown, exit codes | Structured JSON per tool |

## Which should I pick?

- **Inside a coding agent, iterating on fixes:** MCP. You get granular tools and act on the results directly. Use `deep_crawl` for modern docs sites.
- **CI / release gate:** CLI. `npx @glintbase/cli scan <url> --fail-under 70 --quiet` exits non-zero below the threshold.

  | Exit code | Meaning |
  |-----------|---------|
  | 0 | Success |
  | 1 | Scan failed |
  | 2 | Invalid URL / SSRF blocked |
  | 3 | Score below `--fail-under` |
- **Sharing a result / leaderboard / one-click:** the hosted web app.

## Local models with the CLI

```bash
glintbase init            # select Ollama -> auto-detects models at localhost:11434
glintbase scan https://docs.example.com --agent
```

`--agent` runs the LLM multi-agent harness using your configured provider (cloud key or local model), which is the same higher-fidelity engine the hosted `deep` scan uses automatically.
