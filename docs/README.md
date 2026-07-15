# Glintscanner documentation

Spec-driven program for hardening Glintscanner into an industry-grade, open-source-ready agent readiness scanner.

## Start here

| Document | Purpose |
|----------|---------|
| **[../README.md](../README.md)** | Product quickstart + CLI |
| **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** | Full program: phases, tasks, PR plan, exit gates |
| **[methodology/ars-1.0.md](./methodology/ars-1.0.md)** | Public scoring methodology (ARS 1.0) |
| **[SELF-HOST.md](./SELF-HOST.md)** | Self-host / Docker outline |
| **[../ARCHITECTURE.md](../ARCHITECTURE.md)** | Pipeline + module map |

## Specs (contracts)

Implement against these. Update the spec in the same PR when behavior changes.

| Spec | Topic | Phase |
|------|--------|-------|
| [00-scan-report-contract](./specs/00-scan-report-contract.md) | Stream + report JSON | 0 |
| [01-url-policy](./specs/01-url-policy.md) | SSRF, caps, safety | 5 |
| [02-discovery](./specs/02-discovery.md) | Surfaces + validation | 0–1 |
| [03-crawl](./specs/03-crawl.md) | Crawl engine, parsers | 1 |
| [04-graph](./specs/04-graph.md) | Knowledge graph | 2 |
| [05-pathfinder](./specs/05-pathfinder.md) | Agent journeys | 3 |
| [06-scoring-ars](./specs/06-scoring-ars.md) | ARS 1.0 formula | 4 |
| [07-api-jobs](./specs/07-api-jobs.md) | API + job model | 5 |
| [08-ui-integrity](./specs/08-ui-integrity.md) | UI honesty rules | 0 |
| [09-oss-cli](./specs/09-oss-cli.md) | OSS packages + CLI | 6 |

## Task tracker

See [TASKS.md](./TASKS.md) for a copy-paste checklist keyed to task IDs (`T0.10`, …).

## Execution order (summary)

```
Phase 0 Integrity  →  1 Crawl  →  2 Graph  →  3 Pathfinder  →  4 ARS
                              ↘           ↗
                                5 Platform → 6 OSS → 7 Enterprise
```

**Rule:** Do not start Phase 1 until Phase 0 exit gate passes (see implementation plan).

## How to work

1. Pick the next open task from `TASKS.md` / plan §6.  
2. Read the linked SPEC.  
3. Implement + tests in the same PR.  
4. Reference task IDs in the PR body (`Closes T0.10`).  
5. If behavior diverges from the spec, update the spec first.  
