# Contributing to Glintscanner

Thanks for helping make agent-ready docs infrastructure better.

## Development setup

```bash
git clone <repo-url>
cd glintscanner
npm install
cp .env.local.example .env.local   # fill keys as needed
npm run dev                        # http://localhost:3000
```

### Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js web app |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run glintscan -- <url>` | CLI scan |
| `npm run build` | Production build |

Firecrawl, Supabase, and Redis are **optional** for core unit tests. Live scans need network access.

## Spec-driven changes

This project is driven by specs under `docs/specs/`:

1. Update or add the relevant **SPEC** when behavior changes
2. Implement code + tests in the same PR
3. Reference task IDs from `docs/TASKS.md` when applicable (`Closes T0.10`)

See [docs/IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md) for the full roadmap.

## Code layout

```
src/lib/scanner/
  core/          # Pure runScan + CLI-facing API (no Next/Supabase)
  shared/        # URL helpers, score bands
  v2/            # Pipeline: discovery, crawl, graph, pathfinder, ARS
src/app/         # Next.js host (UI + /api/scan)
scripts/         # CLI entry (glintscan.ts)
fixtures/        # Offline HTML/OpenAPI/llms samples
```

**Do not** import Next.js, React, or Supabase from `core/` or pure `v2/` modules used by the CLI.

## Pull requests

- Keep PRs focused and reviewable
- Include tests for scoring, pathfinder, URL policy, and parsers when touched
- Ensure `npm test && npm run typecheck` pass
- Prefer complete sentences in commit messages

## Score / methodology changes

Changing ARS weights or bands is a **breaking** product change:

1. Bump `score_version` in `src/lib/scanner/v2/ars.ts`
2. Update `docs/methodology/ars-1.0.md` (or add a new version doc)
3. Update golden/unit expectations

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
