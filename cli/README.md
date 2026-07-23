# @glintbase/cli

**Agent Readiness Scanner for the terminal and CI.** Analyze whether AI coding agents (Cursor, Claude Code, Copilot, …) can discover, parse, and complete integration journeys against your docs — and get a versioned **Agent Readiness Score (ARS)**.

Beautiful terminal output, JSON/Markdown reports, and exit codes built for CI gates.

## Install

```bash
npm install -g @glintbase/cli
glintbase scan https://docs.example.com
```

Or run without installing:

```bash
npx @glintbase/cli scan https://docs.example.com
```

## CI gate

Fail a pipeline when readiness drops below a threshold:

```bash
npx @glintbase/cli scan https://docs.example.com --fail-under 70 --quiet
```

Emit machine-readable reports:

```bash
glintbase scan https://docs.example.com --json    > ars.json
glintbase scan https://docs.example.com --markdown > ars.md
```

## LLM journey harness (optional)

By default journeys are **deterministic** (no LLM, fully reproducible). Opt into the
multi-agent harness with `--agent` and bring your own provider — a cloud key or a local
model (Ollama / LM Studio):

```bash
glintbase init          # interactive provider setup wizard
glintbase scan https://docs.example.com --agent
```

Supported providers: OpenAI, Anthropic, Groq, Google, OpenRouter, and local endpoints.

## Links

- Tools hub: [scan.glintbase.dev/tools](https://scan.glintbase.dev/tools)
- Source & methodology: [github.com/glintbase/glintscanner](https://github.com/glintbase/glintscanner)

## License

Apache-2.0
