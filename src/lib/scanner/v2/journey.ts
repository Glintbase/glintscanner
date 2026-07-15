import {
  ContextGraph,
  GraphNode,
  GraphEdge,
  JourneyStep,
  JourneyTrace,
  JourneySimulation,
  JourneyBreakpoint,
  JourneyCost,
} from './types';

// ── Journey Definitions (pack v1.1) ────────────────────────────────────────

interface JourneyDef {
  id: string;
  label: string;
  goal: string;
  mode: 'canonical' | 'recovery' | 'ambiguous';
  startTypes: Array<GraphNode['type']>;
  targetNodeId?: string;
  targetType?: GraphNode['type'];
  /** Prefer machine entrypoints as start for these journeys */
  preferMachineStart?: boolean;
  intentKeywords: string[];
  maxHops: number;
  /** Require evidence on concept targets */
  requireEvidence?: boolean;
}

const JOURNEYS: JourneyDef[] = [
  {
    id: 'find_docs_overview',
    label: 'Find Docs Overview',
    goal: 'Locate the canonical documentation starting point',
    mode: 'canonical',
    startTypes: ['canonical_link', 'page', 'machine_entrypoint'],
    targetType: 'canonical_link',
    intentKeywords: ['docs', 'overview', 'guide', 'documentation', 'reference', 'start'],
    maxHops: 8,
  },
  {
    id: 'find_llms_entrypoint',
    label: 'Find llms.txt Entrypoint',
    goal: 'Locate a machine-readable llms.txt / MCP entrypoint',
    mode: 'canonical',
    startTypes: ['machine_entrypoint', 'canonical_link', 'page'],
    targetType: 'machine_entrypoint',
    preferMachineStart: true,
    intentKeywords: ['llms', 'mcp', 'sitemap', 'machine', 'entrypoint', 'index'],
    maxHops: 6,
  },
  {
    id: 'authenticate',
    label: 'Authenticate',
    goal: 'Authenticate and create first API credentials',
    mode: 'canonical',
    startTypes: ['canonical_link', 'page', 'api'],
    targetNodeId: 'concept:authentication',
    intentKeywords: ['auth', 'api key', 'token', 'credential', 'oauth', 'bearer', 'login'],
    maxHops: 8,
    requireEvidence: true,
  },
  {
    id: 'install_sdk',
    label: 'Install SDK',
    goal: 'Install the SDK and verify the integration',
    mode: 'canonical',
    startTypes: ['canonical_link', 'page', 'sdk'],
    targetType: 'sdk',
    targetNodeId: 'concept:sdk_usage',
    intentKeywords: ['sdk', 'install', 'library', 'package', 'npm', 'pip', 'client'],
    maxHops: 8,
  },
  {
    id: 'create_api_key',
    label: 'Create API Key',
    goal: 'Generate a new API key for the integration',
    mode: 'canonical',
    startTypes: ['api', 'canonical_link', 'page'],
    targetNodeId: 'concept:authentication',
    intentKeywords: ['api key', 'create key', 'generate token', 'credential', 'secret'],
    maxHops: 8,
    requireEvidence: true,
  },
  {
    id: 'send_first_request',
    label: 'Send First Request',
    goal: 'Send the first API request and verify the response',
    mode: 'canonical',
    startTypes: ['api', 'sdk', 'page', 'operation'],
    targetNodeId: 'concept:api_endpoints',
    targetType: 'operation',
    intentKeywords: ['request', 'endpoint', 'curl', 'http', 'post', 'get', 'api call'],
    maxHops: 8,
  },
  {
    id: 'resolve_openapi_operation',
    label: 'Resolve OpenAPI Operation',
    goal: 'Reach a concrete OpenAPI operation from the API surface',
    mode: 'canonical',
    startTypes: ['api', 'machine_entrypoint', 'canonical_link'],
    targetType: 'operation',
    intentKeywords: ['operation', 'endpoint', 'openapi', 'swagger', 'path', 'get', 'post'],
    maxHops: 6,
  },
  {
    id: 'configure_webhook',
    label: 'Configure Webhook',
    goal: 'Configure a webhook and verify event delivery',
    mode: 'ambiguous',
    startTypes: ['canonical_link', 'api', 'page'],
    targetNodeId: 'concept:webhooks',
    intentKeywords: ['webhook', 'event', 'callback', 'listener', 'subscribe', 'notify'],
    maxHops: 8,
    requireEvidence: true,
  },
  {
    id: 'locate_error_handling',
    label: 'Locate Error Handling',
    goal: 'Find error handling and troubleshooting documentation',
    mode: 'recovery',
    startTypes: ['support_path', 'canonical_link', 'page'],
    targetNodeId: 'concept:error_handling',
    intentKeywords: ['error', 'exception', 'troubleshoot', 'debug', 'fail', 'status code'],
    maxHops: 8,
    requireEvidence: true,
  },
  {
    id: 'recover_setup_issue',
    label: 'Recover from Setup Issue',
    goal: 'Diagnose and recover from a setup or configuration failure',
    mode: 'recovery',
    startTypes: ['support_path', 'page', 'canonical_link'],
    targetNodeId: 'concept:error_handling',
    targetType: 'support_path',
    intentKeywords: ['setup', 'problem', 'issue', 'recover', 'fix', 'resolve', 'troubleshoot'],
    maxHops: 8,
  },
];

// ── Edge type priors (boost useful navigation edges) ───────────────────────

const EDGE_PRIORS: Partial<Record<GraphEdge['type'], number>> = {
  docs_entrypoint_connects_to_onboarding: 3,
  entrypoint_lists: 3,
  exposes_operation: 3,
  documents: 2,
  page_links_to_page: 2,
  example_of: 1,
  api_maps_to_sdk_example: 2,
  support_path_resolves_error_path: 3,
  page_references_page: 1,
  concept_depends_on_concept: 1,
  workflow_depends_on_prerequisite: 2,
};

// ── Human-Readable Step Descriptions ──────────────────────────────────────

function deriveAction(edgeType: GraphEdge['type'] | undefined, stepIndex: number): string {
  if (stepIndex === 0) return 'Started journey at entry point';
  switch (edgeType) {
    case 'page_references_page':
    case 'page_links_to_page':
      return 'Followed link to this page';
    case 'documents':
      return 'Opened documented concept';
    case 'example_of':
      return 'Located code example';
    case 'concept_depends_on_concept':
      return 'Traversed dependency to this concept';
    case 'workflow_depends_on_prerequisite':
      return 'Located prerequisite task';
    case 'api_maps_to_sdk_example':
      return 'Mapped API to SDK sample';
    case 'docs_entrypoint_connects_to_onboarding':
      return 'Followed onboarding entrypoint';
    case 'support_path_resolves_error_path':
      return 'Followed support path';
    case 'entrypoint_lists':
      return 'Followed machine entrypoint listing';
    case 'exposes_operation':
      return 'Resolved API operation';
    default:
      return 'Navigated to this surface';
  }
}

function deriveFound(node: GraphNode): string {
  switch (node.type) {
    case 'canonical_link':
      return 'Docs root surface';
    case 'api':
      return 'API reference endpoints';
    case 'operation':
      return 'OpenAPI operation';
    case 'sdk':
      return 'SDK client library';
    case 'concept':
      return 'Core concept guide';
    case 'workflow':
      return 'Step-by-step workflow guide';
    case 'prerequisite':
      return 'Prerequisite setup details';
    case 'code_example':
      return 'Interactive code snippet';
    case 'machine_entrypoint':
      return 'Machine entrypoint (llms/MCP/sitemap)';
    case 'support_path':
      return 'Troubleshooting route';
    case 'unresolved_reference':
      return 'Broken or empty link';
    default:
      return 'Documentation page';
  }
}

function deriveStepConfidence(score: number, inferenceRequired: boolean): 'high' | 'medium' | 'low' {
  if (inferenceRequired) return 'low';
  if (score >= 5) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

function deriveCost(steps: JourneyStep[], retrievalBreadth: number): JourneyCost {
  const pagesVisited = steps.filter((s) =>
    ['page', 'api', 'sdk', 'canonical_link', 'support_path', 'operation'].includes(s.nodeType)
  ).length;
  const inferencePoints = steps.filter((s) => s.inferenceRequired).length;

  let tokenWasteEstimate: 'low' | 'medium' | 'high';
  const isSuccess = steps.some((s) => s.outcome === 'success');
  if (!isSuccess || inferencePoints > 3 || pagesVisited > 6) {
    tokenWasteEstimate = 'high';
  } else if (inferencePoints > 1 || pagesVisited > 3) {
    tokenWasteEstimate = 'medium';
  } else {
    tokenWasteEstimate = 'low';
  }

  return { pagesVisited, inferencePoints, tokenWasteEstimate, hops: steps.length, retrievalBreadth };
}

function deriveRecommendedFix(breakpoint: JourneyBreakpoint, def: JourneyDef): string {
  switch (breakpoint.type) {
    case 'dead_end':
      return `Add outbound navigation from "${breakpoint.surface ?? 'this page'}" to the next logical step. Consider a "Next Steps" section or inline cross-links that guide the agent toward the goal.`;
    case 'unresolved_reference':
      return `Create or link the missing content at "${breakpoint.surface ?? 'this surface'}". This gap forces agents to infer context, increasing hallucination risk significantly.`;
    case 'max_hops_exceeded':
      return `Create a canonical shortcut path for "${def.goal}". The agent traversed ${def.maxHops} hops without reaching the target — surface a direct link from the docs root or llms.txt.`;
    case 'inference_required':
      return `Add explicit navigation signals for "${def.goal}". The agent repeatedly chose low-confidence next steps. Clearer page titles, explicit cross-links, and a canonical quickstart path would resolve this.`;
    case 'no_start_node':
      return `Ensure the docs root, landing page, or machine entrypoint is publicly discoverable. The agent could not locate a valid starting surface for this journey.`;
    case 'no_evidence':
      return `Publish real documentation content for "${def.goal}" (not just a link shell). The pathfinder found a node without evidence — add headings, code samples, or an OpenAPI operation.`;
    case 'missing_prerequisite':
      return `Document prerequisites for "${def.goal}" and link them from the onboarding path.`;
    default:
      return `Review the "${def.label}" journey and add clear, canonical navigation from the entry point to the goal surface.`;
  }
}

function deriveConfidence(success: boolean, inferencePoints: number): 'high' | 'medium' | 'low' {
  if (!success) return 'low';
  if (inferencePoints === 0) return 'high';
  if (inferencePoints <= 2) return 'medium';
  return 'low';
}

function deriveStatus(success: boolean, steps: JourneyStep[]): 'passed' | 'failed' | 'partial' {
  if (success) return 'passed';
  const progressSteps = steps.filter((s) => s.outcome === 'progress' || s.outcome === 'inferred').length;
  if (progressSteps > 1) return 'partial';
  return 'failed';
}

// ── Graph Helpers ──────────────────────────────────────────────────────────

function getOutboundEdges(nodeId: string, edges: GraphEdge[]): GraphEdge[] {
  return edges.filter((e) => e.source === nodeId);
}

function getNode(nodeId: string, nodes: GraphNode[]): GraphNode | undefined {
  return nodes.find((n) => n.id === nodeId);
}

function nodeSearchText(node: GraphNode): string {
  const parts = [
    node.label,
    node.id,
    node.type,
    node.url || '',
    node.evidence?.snippet || '',
    node.evidence?.heading || '',
  ];
  return parts.join(' ').toLowerCase();
}

function hasEvidence(node: GraphNode): boolean {
  if (node.synthetic) return false;
  if (node.type === 'operation') return true;
  if (node.type === 'machine_entrypoint' || node.type === 'api' || node.type === 'sdk') return true;
  if (node.type === 'canonical_link' && node.id !== 'root:domain') return true;
  if (node.evidence?.snippet || node.evidence?.heading) return true;
  if (node.confidence !== undefined && node.confidence >= 0.85 && !node.synthetic) {
    // High-confidence non-synthetic without explicit evidence still OK for surfaces
    if (node.type !== 'concept') return true;
  }
  // Concepts must have evidence when required
  return !!(node.evidence?.snippet || node.evidence?.heading);
}

function scoreRelevance(
  node: GraphNode,
  edge: GraphEdge | undefined,
  keywords: string[],
  mode: JourneyDef['mode']
): number {
  const text = nodeSearchText(node);
  let score = 0;

  for (const kw of keywords) {
    const k = kw.toLowerCase();
    if (text.includes(k)) score += 2;
    if (node.label.toLowerCase().startsWith(k) || node.id.toLowerCase().includes(k.replace(/\s+/g, '_'))) {
      score += 1;
    }
  }

  if (edge) {
    score += EDGE_PRIORS[edge.type] ?? 0;
  }

  if (node.type === 'unresolved_reference') score -= 5;
  if (node.synthetic) score -= 4;

  // Mode-specific boosts
  if (mode === 'recovery' && node.type === 'support_path') score += 3;
  if (mode === 'canonical' && node.type === 'canonical_link') score += 1;
  if (node.type === 'operation') score += 1;

  score += Math.min(node.weight ?? 0, 3);
  if (node.confidence !== undefined) {
    score += node.confidence >= 0.9 ? 1 : 0;
  }

  return score;
}

function findStartNode(def: JourneyDef, nodes: GraphNode[]): GraphNode | null {
  const candidates = nodes.filter((n) => !n.synthetic);

  if (def.preferMachineStart) {
    const me = candidates
      .filter((n) => n.type === 'machine_entrypoint')
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
    if (me[0]) return me[0];
  }

  // Recovery: prefer support_path first (already ordered in startTypes)
  for (const t of def.startTypes) {
    const typed = candidates.filter((n) => n.type === t && n.id !== 'root:domain');
    if (typed.length === 0) continue;
    typed.sort((a, b) => {
      const sa = scoreRelevance(a, undefined, def.intentKeywords, def.mode);
      const sb = scoreRelevance(b, undefined, def.intentKeywords, def.mode);
      return sb - sa || (b.weight ?? 0) - (a.weight ?? 0);
    });
    return typed[0];
  }

  if (def.intentKeywords.some((k) => /llms|mcp|openapi|machine/.test(k))) {
    const me = candidates.find((n) => n.type === 'machine_entrypoint');
    if (me) return me;
  }

  const root = candidates.find((n) => n.id === 'root:domain');
  if (root) return root;

  return candidates[0] ?? nodes[0] ?? null;
}

function isTarget(node: GraphNode, def: JourneyDef): boolean {
  if (node.synthetic) return false;
  if (node.id === 'root:domain' && def.targetType === 'canonical_link') {
    // Root alone is not "docs overview" success unless no better target exists —
    // prefer non-root canonical_link
    return false;
  }

  const idMatch = !!(def.targetNodeId && node.id === def.targetNodeId);
  const typeMatch = !!(
    def.targetType &&
    node.type === def.targetType &&
    node.id !== 'root:domain'
  );

  if (!idMatch && !typeMatch) return false;

  // Evidence gate for concepts / when requireEvidence
  if (def.requireEvidence || node.type === 'concept') {
    if (!hasEvidence(node)) return false;
    if (node.type === 'concept' && node.confidence !== undefined && node.confidence < 0.8) {
      return false;
    }
  }

  // For find_docs_overview: any non-root canonical_link counts
  if (def.id === 'find_docs_overview' && node.type === 'canonical_link' && node.id !== 'root:domain') {
    return true;
  }

  // For find_llms: prefer llms-labeled entrypoints
  if (def.id === 'find_llms_entrypoint' && node.type === 'machine_entrypoint') {
    const t = nodeSearchText(node);
    return t.includes('llms') || t.includes('mcp') || t.includes('sitemap') || true;
  }

  return idMatch || typeMatch;
}

function classifyHallucinationPressure(
  success: boolean,
  hopCount: number,
  deadEndsHit: number,
  inferencePoints: number
): 'low' | 'medium' | 'high' {
  if (!success) return 'high';
  if (deadEndsHit > 1 || hopCount > 7 || inferencePoints > 3) return 'high';
  if (deadEndsHit === 1 || hopCount >= 5 || inferencePoints > 1) return 'medium';
  return 'low';
}

// ── Traversal (greedy default; optional beam) ──────────────────────────────

export interface PathfinderOptions {
  /** Beam width; 1 = greedy (default) */
  beamWidth?: number;
}

function runJourney(def: JourneyDef, graph: ContextGraph, options: PathfinderOptions = {}): JourneyTrace {
  const beamWidth = Math.max(1, options.beamWidth ?? 1);
  const { nodes, edges } = graph;

  // Beam search: keep top-k partial paths
  type Partial = {
    current: GraphNode;
    visited: Set<string>;
    steps: JourneyStep[];
    deadEndsHit: number;
    fragmentCrossings: number;
    breakpoint: JourneyBreakpoint | null;
    success: boolean;
  };

  const start = findStartNode(def, nodes);
  if (!start) {
    const bp: JourneyBreakpoint = {
      type: 'no_start_node',
      reason: 'No valid starting surface found in the knowledge graph',
    };
    return {
      journey: def.id,
      label: def.label,
      goal: def.goal,
      mode: def.mode,
      status: 'failed',
      success: false,
      confidence: 'low',
      startSurface: 'Unknown',
      steps: [],
      breakpoint: bp,
      cost: {
        pagesVisited: 0,
        inferencePoints: 0,
        tokenWasteEstimate: 'high',
        hops: 0,
        retrievalBreadth: 0,
      },
      recommendedFix: deriveRecommendedFix(bp, def),
      hallucinationPressure: 'high',
      hopCount: 0,
      retrievalBreadth: 0,
      fragmentationScore: 0,
    };
  }

  const startSuccess = isTarget(start, def);
  let beam: Partial[] = [
    {
      current: start,
      visited: new Set([start.id]),
      steps: [
        {
          step: 1,
          nodeId: start.id,
          nodeLabel: start.label,
          nodeType: start.type,
          url: start.url,
          action: 'Started traversal at entry surface',
          found: deriveFound(start),
          outcome: startSuccess ? 'success' : 'progress',
          inferenceRequired: false,
          stepConfidence: 'high',
          canonical: start.type === 'canonical_link',
        },
      ],
      deadEndsHit: 0,
      fragmentCrossings: 0,
      breakpoint: null,
      success: startSuccess,
    },
  ];

  for (let hop = 0; hop < def.maxHops; hop++) {
    if (beam.every((p) => p.success || p.breakpoint)) break;

    const nextBeam: Partial[] = [];

    for (const path of beam) {
      if (path.success || path.breakpoint) {
        nextBeam.push(path);
        continue;
      }

      const outbound = getOutboundEdges(path.current.id, edges).filter(
        (e) => !path.visited.has(e.target)
      );

      if (outbound.length === 0) {
        const steps = [...path.steps];
        if (steps.length) steps[steps.length - 1] = { ...steps[steps.length - 1], outcome: 'dead_end' };
        nextBeam.push({
          ...path,
          steps,
          deadEndsHit: path.deadEndsHit + 1,
          breakpoint: {
            type: 'dead_end',
            surface: path.current.label,
            reason: `No unvisited outbound edges from "${path.current.label}" — agent reached a dead end`,
          },
        });
        continue;
      }

      const scored = outbound
        .map((e) => {
          const targetNode = getNode(e.target, nodes);
          if (!targetNode) return null;
          return {
            edge: e,
            node: targetNode,
            score: scoreRelevance(targetNode, e, def.intentKeywords, def.mode),
          };
        })
        .filter(Boolean) as { edge: GraphEdge; node: GraphNode; score: number }[];

      scored.sort((a, b) => b.score - a.score);
      const candidates = scored.slice(0, beamWidth);

      if (candidates.length === 0) {
        nextBeam.push({
          ...path,
          breakpoint: {
            type: 'dead_end',
            surface: path.current.label,
            reason: `Could not resolve any candidate node from "${path.current.label}"`,
          },
        });
        continue;
      }

      for (const best of candidates) {
        const nextNode = best.node;
        const inferenceRequired = best.score < 2;
        const visited = new Set(path.visited);
        visited.add(nextNode.id);

        let fragmentCrossings = path.fragmentCrossings;
        if (
          nextNode.type === 'concept' &&
          path.current.type !== 'page' &&
          path.current.type !== 'concept'
        ) {
          fragmentCrossings++;
        }

        let outcome: JourneyStep['outcome'] = 'progress';
        let breakpoint: JourneyBreakpoint | null = path.breakpoint;
        let success = false;
        let deadEndsHit = path.deadEndsHit;

        if (nextNode.type === 'unresolved_reference') {
          outcome = 'missing';
          deadEndsHit++;
          breakpoint = {
            type: 'unresolved_reference',
            surface: nextNode.label,
            reason: `Content referenced at "${nextNode.label}" is missing from the product surface`,
          };
        } else if (
          (def.requireEvidence || nextNode.type === 'concept') &&
          (def.targetNodeId === nextNode.id || def.targetType === nextNode.type) &&
          !hasEvidence(nextNode)
        ) {
          outcome = 'missing';
          breakpoint = {
            type: 'no_evidence',
            surface: nextNode.label,
            reason: `Reached "${nextNode.label}" but the node has no content evidence (synthetic or empty)`,
          };
        } else if (inferenceRequired) {
          outcome = 'inferred';
          const inferenceCount = path.steps.filter((s) => s.inferenceRequired).length + 1;
          if (inferenceCount >= 3 && !breakpoint) {
            breakpoint = {
              type: 'inference_required',
              surface: nextNode.label,
              reason: `Agent required inference at ${inferenceCount} steps — no confident canonical path found`,
            };
          }
        } else if (isTarget(nextNode, def)) {
          outcome = 'success';
          success = true;
        }

        const step: JourneyStep = {
          step: path.steps.length + 1,
          nodeId: nextNode.id,
          nodeLabel: nextNode.label,
          nodeType: nextNode.type,
          url: nextNode.url,
          action: deriveAction(best.edge.type, path.steps.length),
          found: deriveFound(nextNode),
          edgeType: best.edge.type,
          outcome,
          inferenceRequired,
          stepConfidence: deriveStepConfidence(best.score, inferenceRequired),
          canonical: nextNode.type === 'canonical_link',
        };

        nextBeam.push({
          current: nextNode,
          visited,
          steps: [...path.steps, step],
          deadEndsHit,
          fragmentCrossings,
          breakpoint: success ? null : breakpoint,
          success,
        });
      }
    }

    // Keep top beam paths: successes first, then by hop progress / last score
    nextBeam.sort((a, b) => {
      if (a.success !== b.success) return a.success ? -1 : 1;
      if (!!a.breakpoint !== !!b.breakpoint) return a.breakpoint ? 1 : -1;
      return b.steps.length - a.steps.length;
    });
    beam = nextBeam.slice(0, Math.max(beamWidth * 2, beamWidth));
  }

  // Pick best completed path
  beam.sort((a, b) => {
    if (a.success !== b.success) return a.success ? -1 : 1;
    return a.steps.length - b.steps.length;
  });
  const bestPath = beam[0];

  let { steps, breakpoint } = bestPath;
  const { success, deadEndsHit, fragmentCrossings } = bestPath;
  const currentNode = bestPath.current;

  if (!success && !breakpoint) {
    // Check if goal exists anywhere without evidence
    const goalExists = nodes.some(
      (n) =>
        !n.synthetic &&
        ((def.targetNodeId && n.id === def.targetNodeId) ||
          (def.targetType && n.type === def.targetType && n.id !== 'root:domain'))
    );
    const goalNoEvidence = nodes.some(
      (n) =>
        ((def.targetNodeId && n.id === def.targetNodeId) ||
          (def.targetType && n.type === def.targetType)) &&
        (n.synthetic || ((def.requireEvidence || n.type === 'concept') && !hasEvidence(n)))
    );

    if (goalNoEvidence && !goalExists) {
      breakpoint = {
        type: 'no_evidence',
        surface: def.targetNodeId || def.targetType || def.label,
        reason: `Goal for "${def.goal}" exists only as a synthetic/empty node without evidence`,
      };
    } else {
      breakpoint = {
        type: 'max_hops_exceeded',
        surface: currentNode.label,
        reason: `Agent exhausted ${def.maxHops}-hop budget without reaching the goal target`,
      };
    }
    if (steps.length > 0) {
      steps = [...steps];
      steps[steps.length - 1] = { ...steps[steps.length - 1], outcome: 'stall' };
    }
  }

  const nodeTypesVisited = new Set(steps.map((s) => s.nodeType));
  const hopCount = steps.length;
  const retrievalBreadth = nodeTypesVisited.size;
  const fragmentationScore = fragmentCrossings;
  const cost = deriveCost(steps, retrievalBreadth);
  const confidence = deriveConfidence(success, cost.inferencePoints);
  const status = deriveStatus(success, steps);
  const hallucinationPressure = classifyHallucinationPressure(
    success,
    hopCount,
    deadEndsHit,
    cost.inferencePoints
  );

  return {
    journey: def.id,
    label: def.label,
    goal: def.goal,
    mode: def.mode,
    status,
    success,
    confidence,
    startSurface: start.label,
    steps,
    breakpoint,
    cost,
    recommendedFix: breakpoint ? deriveRecommendedFix(breakpoint, def) : null,
    hallucinationPressure,
    hopCount,
    retrievalBreadth,
    fragmentationScore,
  };
}

const JOURNEY_DEPENDENCIES: Record<string, string[]> = {
  find_docs_overview: ['docs', 'landing'],
  find_llms_entrypoint: ['llms_txt', 'llms_full_txt', 'mcp', 'sitemap'],
  authenticate: ['auth', 'docs'],
  install_sdk: ['github', 'docs', 'sdk'],
  create_api_key: ['auth', 'dashboard', 'docs'],
  send_first_request: ['api', 'openapi'],
  resolve_openapi_operation: ['openapi', 'api'],
  configure_webhook: ['api', 'openapi', 'docs'],
  locate_error_handling: ['docs', 'api', 'support'],
  recover_setup_issue: ['support', 'docs'],
};

function isJourneyEnabled(journeyId: string, enabledSurfaces?: string[]): boolean {
  if (!enabledSurfaces || enabledSurfaces.length === 0) return true;
  const deps = JOURNEY_DEPENDENCIES[journeyId];
  if (!deps) return true;
  return deps.some((dep) => enabledSurfaces.includes(dep));
}

// ── Main Export ────────────────────────────────────────────────────────────

export async function simulateAgentJourneys(
  graph: ContextGraph,
  progressCallback?: (log: any) => void,
  enabledSurfaces?: string[],
  options?: PathfinderOptions
): Promise<JourneySimulation> {
  const emit = (status: string, message?: string) => {
    progressCallback?.({ type: 'progress', check: 'journey', status, message });
  };

  emit('running', 'Running deterministic agent pathfinder across the knowledge graph...');

  const traces: JourneyTrace[] = [];
  const activeJourneys = JOURNEYS.filter((def) => isJourneyEnabled(def.id, enabledSurfaces));

  if (activeJourneys.length === 0) {
    emit('done', 'Pathfinder complete: 0/0 journeys succeeded (0% completion rate)');
    return {
      traces: [],
      overallCompletionRate: 0,
      avgHopCount: 0,
      avgFragmentationScore: 0,
      highRiskJourneys: [],
    };
  }

  const beamWidth = options?.beamWidth ?? (process.env.PATHFINDER_BEAM_WIDTH
    ? Number(process.env.PATHFINDER_BEAM_WIDTH)
    : 1);

  for (const def of activeJourneys) {
    emit('running', `Pathfinding: ${def.label}...`);
    const trace = runJourney(def, graph, { beamWidth });
    traces.push(trace);

    const icon = trace.success ? '✓' : '✗';
    const inferTag =
      trace.cost.inferencePoints > 0
        ? ` · ${trace.cost.inferencePoints} inference point${trace.cost.inferencePoints > 1 ? 's' : ''}`
        : '';
    const pressureTag = trace.hallucinationPressure === 'high' ? ' ⚠ High pressure' : '';
    emit(
      trace.success ? 'done' : 'warn',
      `${icon} ${trace.label} — ${trace.hopCount} hop${trace.hopCount !== 1 ? 's' : ''}${inferTag}${pressureTag}`
    );
  }

  const successCount = traces.filter((t) => t.success).length;
  const overallCompletionRate = Math.round((successCount / traces.length) * 100);
  const avgHopCount = Math.round(traces.reduce((s, t) => s + t.hopCount, 0) / traces.length);
  const avgFragmentationScore =
    Math.round((traces.reduce((s, t) => s + t.fragmentationScore, 0) / traces.length) * 10) / 10;
  const highRiskJourneys = traces
    .filter((t) => t.hallucinationPressure === 'high')
    .map((t) => t.label);

  emit(
    'done',
    `Pathfinder complete: ${successCount}/${traces.length} journeys succeeded (${overallCompletionRate}% completion rate)`
  );

  return { traces, overallCompletionRate, avgHopCount, avgFragmentationScore, highRiskJourneys };
}

/** Exported for unit tests (SPEC-05) */
export const __test__ = {
  findStartNode,
  isTarget,
  hasEvidence,
  scoreRelevance,
  JOURNEY_DEPENDENCIES,
  JOURNEYS,
  runJourney,
};
