# Glintbase Agent Skills

Distributable [Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills) that teach any coding agent how to use Glintbase's tools. These skills are versioned in the same repo as the tools they document, so they stay in sync.

## Available skills

- **`glintbase-agent-readiness/`** — when and how to use the Glintbase MCP server and CLI to audit whether AI coding agents can discover, parse, and complete integration journeys against a docs ecosystem. Includes the golden tool sequence, score interpretation, and MCP-vs-CLI guidance.

## Install

Copy the skill folder into your agent's skills directory:

```bash
# Claude Code
cp -r skills/glintbase-agent-readiness ~/.claude/skills/

# Qoder / other agents that read .agents/skills
cp -r skills/glintbase-agent-readiness .agents/skills/
```

Or clone the repo and symlink the folder. The agent picks up the skill from its `SKILL.md` frontmatter automatically.

## Pair it with the tools

The skill documents these packages, install them too:

```bash
# MCP server (in-editor, zero-config)
npx -y @glintbase/mcp

# CLI (CI gates, scripted runs)
npm install -g @glintbase/cli
```

See the hosted resources hub at [scan.glintbase.dev/tools](https://scan.glintbase.dev/tools) and the MCP gateway at [scan.glintbase.dev/mcp](https://scan.glintbase.dev/mcp).
