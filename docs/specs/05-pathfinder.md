# SPEC-05 — Agent Pathfinder (Journey Simulation)

**Status:** active  
**Phase:** 3 + Multi-Agent Harness  
**Related tasks:** T3.01–T3.10, T0.16–T0.19, C1  
**Implementation:** `src/lib/scanner/v2/journey.ts` (Deterministic) & `src/lib/scanner/agent/` (Multi-Agent Harness)

## 1. Purpose

Simulate how a **tool-using coding agent** (Cursor, Claude Code, Antigravity, Copilot, custom LLM agents) would traverse documentation to complete integration tasks.

The system features **dual simulation engines**:
1. **⚡ Deterministic Pathfinder**: Fast, zero-LLM graph-traversal search.
2. **🤖 LLM Multi-Agent Harness**: Real LLM reasoning and tool-calling agent simulation.

**Naming:** UI copy MUST clearly distinguish between:
- `"Deterministic multi-start traversal (not LLM reasoning) across the knowledge graph"`
- `"LLM Multi-Agent Journey Simulation (Real LLM reasoning & tool calls)"`

## 2. Journey definition

```ts
interface JourneyDef {
  id: string;
  label: string;
  goal: string;
  mode: 'canonical' | 'recovery' | 'ambiguous';
  startTypes: NodeType[];
  targetNodeId?: string;
  targetType?: NodeType;
  intentKeywords: string[];
  maxHops: number;
  /** Surface types that enable this journey when customizer used */
  dependsOnSurfaces?: string[];
}
```

### Pack v1.1 (required IDs)

| id | Mode | Primary target |
|----|------|----------------|
| find_docs_overview | canonical | docs root / canonical_link |
| find_llms_entrypoint | canonical | machine_entrypoint llms |
| authenticate | canonical | concept:authentication + evidence |
| install_sdk | canonical | sdk / concept:sdk_usage |
| create_api_key | canonical | concept:authentication |
| send_first_request | canonical | concept:api_endpoints or operation |
| resolve_openapi_operation | canonical | any operation node |
| configure_webhook | ambiguous | concept:webhooks |
| locate_error_handling | recovery | concept:error_handling |
| recover_setup_issue | recovery | support_path or error_handling |

## 3. Deterministic Pathfinder Algorithm

Priority order for `findStartNode(def, graph)`:

1. Nodes matching `def.startTypes` ordered by:  
   - recovery mode → prefer `support_path`  
   - machine goals → prefer `machine_entrypoint`  
   - else prefer `canonical_link` over `page`  
2. Else `root:domain` if present  
3. Else first node  
4. Else fail `no_start_node`

Goal predicate `isTarget(node, def)` requires non-synthetic graph nodes with confidence $\ge 0.8$.

## 4. LLM Multi-Agent Harness Architecture (`src/lib/scanner/agent/`)

When `useAgentHarness: true` or `profile === 'deep'` or CLI flag `--agent` is enabled, the pipeline routes journey simulation through the multi-agent harness:

```
[Discovered Surfaces & Knowledge Graph]
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│ 1. Dynamic LLM Planner (planner.ts)                    │
│ Generates product-tailored journey tasks (or Pack v1.1)│
└────────────────────────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│ 2. Unified Provider Governor (providers/)              │
│ Anthropic / OpenAI / Google (gemma-4-31b-it) / Groq    │
│ Rate limit governor: 30 RPM throttle + token budget    │
└────────────────────────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│ 3. Parallel Dispatcher (dispatcher.ts)                 │
│ Runs journey tasks concurrently in worker pool         │
└────────────────────────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│ 4. Bounded Agent Runner (runner.ts)                    │
│ Multi-step tool loop (maxSteps: 8)                     │
│ Tool Suite: search_docs, read_surface,                 │
│ inspect_openapi_spec, verify_goal                      │
└────────────────────────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│ 5. Empirical Evaluator (evaluator.ts)                  │
│ Verifies evidence claims against scraped surfaces      │
└────────────────────────────────────────────────────────┘
```

### Agent Tool Suite

1. **`search_docs({ query })`**: Searches scraped documentation pages and knowledge graph nodes for matching terms, headings, or code snippets.
2. **`read_surface({ url })`**: Navigates to and parses page body, headings, and code samples for a given URL or surface type.
3. **`inspect_openapi_spec({ pathOrOperation })`**: Inspected OpenAPI endpoints and HTTP operation schemas.
4. **`verify_goal({ targetUrl, evidenceSnippet, explanation })`**: Asserts journey completion with empirical evidence.

### Procedural Step Formatting & UX

Every agent step is parsed into a human-readable, procedural node trace:
- **`nodeLabel`**: Destination title or URL (e.g. `Search Corpus: "auth"`, `https://docs.replit.com/auth`)
- **`action`**: Procedural action description (`Searched documentation corpus for "auth"`, `Navigated to and read surface: Authentication Guide`)
- **`found`**: Summary of discovered evidence or matching pages
- **`url`**: Clickable external link rendered in the UI Step Inspector

## 5. Failure Taxonomy

```ts
type BreakpointType =
  | 'missing_prerequisite'
  | 'dead_end'
  | 'max_hops_exceeded'
  | 'unresolved_reference'
  | 'inference_required'
  | 'no_start_node'
  | 'no_evidence';
```

## 6. Aggregation

```ts
interface JourneySimulation {
  traces: JourneyTrace[];
  overallCompletionRate: number; // 0 if traces empty
  avgHopCount: number;
  avgFragmentationScore: number;
  highRiskJourneys: string[];
}
```

**Invariant:** `traces.length === 0` ⇒ `overallCompletionRate === 0` (not 100).

## 7. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-05.1 | startTypes honored in unit tests |
| AC-05.2 | synthetic targets never marked success |
| AC-05.3 | empty active journeys → 0% rate |
| AC-05.4 | recover_setup_issue respects surface deps |
| AC-05.5 | LLM multi-agent harness passes 59 unit tests |
| AC-05.6 | Provider rate limit governor enforces 30 RPM limit for Google models |
