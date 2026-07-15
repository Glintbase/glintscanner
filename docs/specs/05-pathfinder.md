# SPEC-05 — Agent Pathfinder (Journey Simulation)

**Status:** draft  
**Phase:** 3  
**Related tasks:** T3.01–T3.10, T0.16–T0.19, C1  

## 1. Purpose

Simulate how a **tool-using coding agent** would traverse documentation to complete onboarding tasks.

**Naming:** Product copy MUST say “deterministic pathfinder” / “agent journey simulation”.  
MUST NOT claim LLM reasoning unless LLM probe mode (Phase 7) is enabled and labeled.

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

**Bugfix:** dependency map keys MUST equal journey `id` exactly (`recover_setup_issue`).

## 3. Start node selection

Priority order for `findStartNode(def, graph)`:

1. Nodes matching `def.startTypes` ordered by:  
   - recovery mode → prefer `support_path`  
   - machine goals → prefer `machine_entrypoint`  
   - else prefer `canonical_link` over `page`  
2. Else `root:domain` if present  
3. Else first node  
4. Else fail `no_start_node`

**Forbidden:** always returning `root:domain` first without consulting `startTypes`.

## 4. Goal predicates

`isTarget(node, def)` is true only if:

1. Node matches `targetNodeId` or `targetType`, AND  
2. `node.synthetic !== true`, AND  
3. If type is `concept`, node has `evidence` OR inbound edge from a non-synthetic `page` with matching content, AND  
4. `confidence >= 0.8` (configurable)

## 5. Traversal algorithm (default: greedy)

```
visited = {start}
loop hop in 1..maxHops:
  candidates = outbound unvisited neighbors
  if none → dead_end
  score each candidate by relevance(keywords, label, id, type, pageText?)
  pick best
  if score < inferenceThreshold → mark inference
  if isTarget → success
  if unresolved_reference → missing
```

### Relevance score (v1)

- +2 per keyword in label/id  
- +1 prefix match  
- + edge type prior (docs_entrypoint +2, support_path +2 for recovery, …)  
- + min(weight, 3)  
- −5 if unresolved_reference  
- + bonus if page body contains keyword (when available)

### Optional beam search (k=3)

Keep top-k partial paths; pick first success or best partial.

## 6. Failure taxonomy

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

## 7. Aggregation

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

## 8. UI integrity (see SPEC-08)

Any checklist labeled as journeys MUST use `traces[i].success`.

## 9. Acceptance criteria

| ID | Criterion |
|----|-----------|
| AC-05.1 | startTypes honored in unit tests |
| AC-05.2 | synthetic targets never success |
| AC-05.3 | empty active journeys → 0% rate |
| AC-05.4 | recover_setup_issue respects surface deps |
| AC-05.5 | ResultsReport checklist === traces |

## 10. Non-goals

- Full browser agent (click/type)  
- Non-deterministic LLM path as default score input  
