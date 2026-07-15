# SPEC-04 — Knowledge Graph

**Status:** draft  
**Phase:** 2  
**Related tasks:** T2.01–T2.11, T0.14, T0.15, T0.18  

## 1. Purpose

Represent the product ecosystem as a typed, evidence-backed graph for visualization and pathfinding.

## 2. Node types

```ts
type NodeType =
  | 'page'
  | 'concept'
  | 'api'
  | 'operation'
  | 'sdk'
  | 'workflow'
  | 'prerequisite'
  | 'code_example'
  | 'machine_entrypoint'
  | 'support_path'
  | 'canonical_link'
  | 'duplicate'
  | 'unresolved_reference'
  | 'organization';
```

### Mapping from surfaces

| Surface | NodeType |
|---------|----------|
| docs | canonical_link |
| llms_*, sitemap, mcp | machine_entrypoint |
| openapi, api | api |
| github, sdk | sdk |
| support | support_path |
| others | page |

**Invariant:** Mapping to UI MUST NOT coerce `machine_entrypoint` or `support_path` to `concept`.

## 3. Edge relations

```ts
type EdgeRelation =
  | 'page_links_to_page'
  | 'page_references_page' // legacy alias → prefer page_links_to_page
  | 'documents'
  | 'example_of'
  | 'concept_depends_on_concept'
  | 'workflow_depends_on_prerequisite'
  | 'api_maps_to_sdk_example'
  | 'docs_entrypoint_connects_to_onboarding'
  | 'support_path_resolves_error_path'
  | 'entrypoint_lists'
  | 'exposes_operation';
```

**Invariant:** Unknown relations MUST NOT be silently rewritten without a logged compatibility map. Prefer extending the enum.

## 4. Evidence & synthetic

```ts
interface GraphNodeV2 {
  id: string;
  type: NodeType;
  label: string;
  url?: string;
  weight?: number;
  synthetic?: boolean;
  evidence?: {
    source_url: string;
    snippet?: string;
    heading?: string;
  };
  confidence: number; // 0–1
}
```

| Rule | Detail |
|------|--------|
| Synthetic stubs | Created only to satisfy FK; `synthetic: true`, `confidence ≤ 0.5` |
| Pathfinder targets | MUST reject `synthetic === true` |
| Concepts | Require evidence snippet or heading match |

## 5. Construction algorithm

1. Root organization/domain node  
2. Surface nodes for `found` surfaces  
3. Edges root → surfaces  
4. Per-page strategy extract (entities + relations)  
5. Same-site hyperlink edges from page bodies  
6. Spec-derived nodes (OpenAPI operations, llms links)  
7. Dedupe by id  
8. Compute weights (degree) + metrics  

## 6. Metrics

| Metric | Definition |
|--------|------------|
| islands | nodes with degree 0 (excluding intentional isolates policy TBD) |
| deadEnds | pages with out-degree 0 (true sinks) |
| missingBridges | unresolved_reference count |
| components | weakly connected component count |
| adjacencyScore | bounded function of density + avg degree (document formula in code comments) |
| continuityScore | presence of docs root + auth concept + api + workflow signals |

## 7. Persistence

- `scan_nodes`: include `properties` JSON with evidence + synthetic  
- `scan_edges`: `relation` stores full EdgeRelation string  
- Bulk insert after scan row exists  

## 8. Acceptance criteria

| ID | Criterion |
|----|-----------|
| AC-04.1 | llms surface → node type machine_entrypoint in complete payload |
| AC-04.2 | documents edges survive into journeys graph.edges |
| AC-04.3 | synthetic concept cannot be journey success target |
| AC-04.4 | good fixture has ≥1 page_links_to_page edge |
| AC-04.5 | Dedupe prevents PK violations on re-extract |

## 9. Non-goals

- Full RDF/OWL ontology  
- Cross-product knowledge fusion  
