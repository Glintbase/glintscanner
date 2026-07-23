export type SurfaceType =
  | 'landing'
  | 'docs'
  | 'api'
  | 'sdk'
  | 'github'
  | 'support'
  | 'blog'
  | 'changelog'
  | 'status'
  | 'auth'
  | 'dashboard'
  | 'openapi'
  | 'llms_txt'
  | 'llms_full_txt'
  | 'sitemap'
  | 'mcp';

export interface DiscoveredSurface {
  type: SurfaceType;
  url: string;
  found: boolean;
  /** invalid = HTTP ok but content failed validation (empty llms, HTML openapi, etc.) */
  status: 'verified' | 'detected' | 'missing' | 'skipped' | 'invalid';
  confidence: 'high' | 'medium' | 'low';
  description: string;
  fix: string | null;
  // V2 Classification properties
  canonical?: boolean;
  freshness?: string;
  userFacing?: boolean;
  /** Optional quality tag for machine entrypoints */
  quality?: 'empty' | 'thin' | 'good' | 'invalid';
}

export interface ExtractedPage {
  url: string;
  title: string;
  headings: string[];
  codeBlocks: { lang: string; code: string }[];
  wordCount: number;
  /** In-memory body only — never persist to DB */
  html?: string;
  /** Discriminator: markdown from Firecrawl must not be treated as HTML */
  contentKind?: 'html' | 'markdown';
  fetchStatus?: 'ok' | 'unreachable' | 'timeout' | 'empty' | 'failed';
  /** Thin SPA shell — escalate to Playwright in Phase 7 */
  needsRender?: boolean;
  /** How the content was obtained; absent implies a raw fetch. */
  extractionMethod?:
    | 'raw'
    | 'firecrawl'
    | 'next_data'
    | 'rsc_flight'
    | 'json_ld'
    | 'noscript'
    | 'dom_selector';
}

export type GraphNodeType =
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
  | 'unresolved_reference';

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  url?: string;
  isExpensive?: boolean;
  weight?: number;
  /** Auto-generated FK stubs must not satisfy journey goals */
  synthetic?: boolean;
  confidence?: number;
  evidence?: {
    source_url?: string;
    snippet?: string;
    heading?: string;
  };
}

export type GraphEdgeType =
  | 'page_references_page'
  | 'page_links_to_page'
  | 'documents'
  | 'example_of'
  | 'concept_depends_on_concept'
  | 'workflow_depends_on_prerequisite'
  | 'api_maps_to_sdk_example'
  | 'docs_entrypoint_connects_to_onboarding'
  | 'support_path_resolves_error_path'
  | 'entrypoint_lists'
  | 'exposes_operation';

export interface GraphEdge {
  source: string;
  target: string;
  type: GraphEdgeType;
}

export interface GraphMetrics {
  islands: number;
  /** Pages with out-degree 0 (true sinks for agent navigation) */
  deadEnds: number;
  missingBridges: number;
  adjacencyScore: number;
  continuityScore: number;
  /** Weakly connected component count */
  components?: number;
  /** Sample: whether path exists docs root → authentication concept */
  pathDocsToAuth?: boolean;
}

export interface ContextGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metrics: GraphMetrics;
  relationalNodes?: BaseNode[];
  relationalEdges?: BaseEdge[];
}

// ── Phase 6: Journey Simulation Types ─────────────────────────────────────

export interface JourneyStep {
  step: number;
  nodeId: string;
  nodeLabel: string;
  nodeType: GraphNode['type'];
  url?: string;
  action: string;            // What the agent did at this step
  found: string;             // What the agent found
  edgeType?: GraphEdge['type'];
  outcome: 'progress' | 'success' | 'stall' | 'dead_end' | 'missing' | 'inferred';
  inferenceRequired: boolean; // true when agent had to guess (low relevance score)
  stepConfidence: 'high' | 'medium' | 'low';
  canonical: boolean;         // node is a canonical_link type
}

export type JourneyBreakpointType =
  | 'missing_prerequisite'
  | 'dead_end'
  | 'max_hops_exceeded'
  | 'unresolved_reference'
  | 'inference_required'
  | 'no_start_node'
  | 'no_evidence';

export interface JourneyBreakpoint {
  type: JourneyBreakpointType;
  surface?: string;           // node label where the journey broke
  reason: string;             // human-readable explanation
}

export interface JourneyCost {
  pagesVisited: number;
  inferencePoints: number;            // steps where agent had to infer
  tokenWasteEstimate: 'low' | 'medium' | 'high';
  hops: number;
  retrievalBreadth: number;           // distinct node types visited
}

export interface JourneyTrace {
  journey: string;
  label: string;
  goal: string;               // natural-language task description
  mode: 'canonical' | 'recovery' | 'ambiguous';
  status: 'passed' | 'failed' | 'partial';
  success: boolean;
  confidence: 'high' | 'medium' | 'low';
  startSurface: string;       // human label of starting node
  steps: JourneyStep[];
  breakpoint: JourneyBreakpoint | null;
  cost: JourneyCost;
  recommendedFix: string | null;
  hallucinationPressure: 'low' | 'medium' | 'high';
  hopCount: number;
  retrievalBreadth: number;
  fragmentationScore: number;
}

export interface JourneySimulation {
  traces: JourneyTrace[];
  overallCompletionRate: number;
  avgHopCount: number;
  avgFragmentationScore: number;
  highRiskJourneys: string[];
}

// ── Scan Report ────────────────────────────────────────────────────────────

export interface ScanV2Report {
  url: string;
  score: number;
  surfaces: DiscoveredSurface[];
  pages?: ExtractedPage[];
  framework?: string;
  graph?: ContextGraph;
  journeys?: JourneySimulation;
  created_at?: string;
}

// ─── Playbook Strategies & Graph Schema Interfaces (Section 6 & 4) ─────────

export interface BaseNode {
  id: string; // uuid or content-hash-derived
  type: string; // Article | Concept | Product | Repository | Person | Organization | ...
  source_url: string;
  source_strategy: 'blog' | 'docs' | 'product' | 'repo' | 'generic';
  title: string;
  properties: Record<string, any>; // type-specific key/value pairs
  content_hash?: string | null;
  extracted_at: string; // ISO timestamp
  confidence: number;
}

export interface BaseEdge {
  id: string; // uuid
  from_id: string;
  to_id: string;
  relation: string;
  source_url: string;
  properties: Record<string, any>;
}

export interface SimulatedAction {
  action_type: 'click' | 'expand' | 'scroll' | 'hover' | 'paginate';
  target: string; // CSS selector or description
  result_snapshot?: string | null;
}

export interface ExtractionResult {
  entities: BaseNode[];
  relations: BaseEdge[];
}

export interface ClassificationSignal {
  strategy_type: 'blog' | 'docs' | 'product' | 'repo';
  confidence: number;
  reasons: string[];
}

export interface Strategy {
  type_name: 'blog' | 'docs' | 'product' | 'repo' | 'generic';
  matches(url: string, pageContent: string): Promise<number> | number;
  interact(url: string, pageContent: string): Promise<SimulatedAction[]> | SimulatedAction[];
  extract(url: string, pageContent: string, actions: SimulatedAction[]): Promise<ExtractionResult> | ExtractionResult;
  get_next_urls(url: string, pageContent: string): Promise<string[]> | string[];
}

