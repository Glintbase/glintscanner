import {
  DiscoveredSurface,
  ExtractedPage,
  GraphNode,
  GraphEdge,
  ContextGraph,
  BaseNode,
  BaseEdge,
  Strategy,
} from './types';
import { Classifier } from './classifier';
import { GenericStrategy } from './strategies/generic';
import { DocsStrategy } from './strategies/docs';
import { BlogStrategy } from './strategies/blog';
import { ProductStrategy } from './strategies/product';
import { RepoStrategy } from './strategies/repo';
import {
  urlId,
  contentHash,
  extractSameSiteLinks,
  computeWeights,
  computeGraphMetrics,
  operationNodeId,
  sameHost,
} from './graphHelpers';
import { parseLlmsTxt } from './parseLlmsTxt';
import { parseOpenAPI } from './parseOpenAPI';
import { fetchResource } from './fetchResource';

function surfaceEntityType(type: string): string {
  switch (type) {
    case 'sitemap':
    case 'llms_txt':
    case 'llms_full_txt':
    case 'mcp':
      return 'machine_entrypoint';
    case 'openapi':
    case 'api':
      return 'api';
    case 'sdk':
    case 'github':
      return 'sdk';
    case 'support':
      return 'support_path';
    case 'docs':
      return 'canonical_link';
    default:
      return 'page';
  }
}

function surfaceLabel(type: string): string {
  switch (type) {
    case 'sitemap':
      return 'Sitemap';
    case 'llms_txt':
      return 'llms.txt';
    case 'llms_full_txt':
      return 'llms-full.txt';
    case 'mcp':
      return 'MCP Config';
    case 'openapi':
      return 'OpenAPI Spec';
    case 'api':
      return 'API Reference';
    case 'sdk':
      return 'SDK / Library';
    case 'github':
      return 'GitHub Repo';
    case 'support':
      return 'Support Portal';
    case 'docs':
      return 'Docs Root';
    case 'auth':
      return 'Auth / Login';
    case 'dashboard':
      return 'Dashboard';
    case 'changelog':
      return 'Changelog';
    case 'blog':
      return 'Blog';
    case 'status':
      return 'Status Page';
    case 'landing':
      return 'Landing';
    default:
      return type.toUpperCase();
  }
}

const ALLOWED_NODE_TYPES = new Set<GraphNode['type']>([
  'page',
  'concept',
  'api',
  'operation',
  'sdk',
  'workflow',
  'prerequisite',
  'code_example',
  'machine_entrypoint',
  'support_path',
  'canonical_link',
  'duplicate',
  'unresolved_reference',
]);

const ALLOWED_EDGE_TYPES = new Set<GraphEdge['type']>([
  'page_references_page',
  'page_links_to_page',
  'documents',
  'example_of',
  'concept_depends_on_concept',
  'workflow_depends_on_prerequisite',
  'api_maps_to_sdk_example',
  'docs_entrypoint_connects_to_onboarding',
  'support_path_resolves_error_path',
  'entrypoint_lists',
  'exposes_operation',
]);

function mapNodeType(raw: string): GraphNode['type'] {
  if (ALLOWED_NODE_TYPES.has(raw as GraphNode['type'])) return raw as GraphNode['type'];
  if (raw === 'Article' || raw === 'organization') return 'page';
  return 'concept';
}

function mapEdgeType(raw: string): GraphEdge['type'] {
  if (ALLOWED_EDGE_TYPES.has(raw as GraphEdge['type'])) return raw as GraphEdge['type'];
  if (raw === 'links_to' || raw === 'references') return 'page_links_to_page';
  return 'page_references_page';
}

/** Page id stable by URL for hyperlink joining */
function pageNodeIdFromUrl(url: string): string {
  return `page:${urlId(url)}`;
}

export async function buildContextGraph(
  surfaces: DiscoveredSurface[],
  pages: ExtractedPage[],
  progressCallback?: (log: any) => void
): Promise<ContextGraph> {
  const emit = (check: string, status: string, message?: string) => {
    progressCallback?.({ type: 'progress', check, status, message });
  };

  emit('graph', 'running', 'Synthesizing ecosystem knowledge graph...');

  const classifier = new Classifier();
  const strategies: Record<string, Strategy> = {
    generic: new GenericStrategy(),
    docs: new DocsStrategy(),
    blog: new BlogStrategy(),
    product: new ProductStrategy(),
    repo: new RepoStrategy(),
  };

  const relationalNodes: BaseNode[] = [];
  const relationalEdges: BaseEdge[] = [];
  const pageUrlToNodeId = new Map<string, string>();

  // ── 0. Root Domain Node ───────────────────────────────────────────────────
  const rootUrl =
    surfaces.find((s) => s.type === 'landing' || s.type === 'docs')?.url ??
    surfaces.find((s) => s.found)?.url ??
    pages[0]?.url ??
    '';

  let rootDomain = 'Product';
  try {
    rootDomain = new URL(rootUrl).hostname.replace(/^www\./, '');
  } catch {
    /* keep default */
  }

  const ROOT_ID = 'root:domain';
  relationalNodes.push({
    id: ROOT_ID,
    type: 'canonical_link',
    source_url: rootUrl,
    source_strategy: 'generic',
    title: rootDomain,
    properties: { synthetic: false },
    extracted_at: new Date().toISOString(),
    confidence: 1.0,
  });

  // ── 1. Discovered Surface Nodes ──────────────────────────────────────────
  const surfaceNodeIds = new Map<string, string>();

  for (const s of surfaces) {
    if (!s.found) continue;

    const nodeId = `surface:${urlId(s.url)}`;
    surfaceNodeIds.set(s.url, nodeId);

    relationalNodes.push({
      id: nodeId,
      type: surfaceEntityType(s.type),
      source_url: s.url,
      source_strategy: 'generic',
      title: surfaceLabel(s.type),
      properties: {
        surfaceType: s.type,
        quality: s.quality,
        evidence: { source_url: s.url, snippet: s.description },
      },
      content_hash: contentHash(s.url + s.type),
      extracted_at: new Date().toISOString(),
      confidence: 1.0,
    });

    const edgeType =
      s.type === 'docs' || s.type === 'sitemap' || s.type === 'llms_txt' || s.type === 'mcp'
        ? 'docs_entrypoint_connects_to_onboarding'
        : 'page_references_page';

    relationalEdges.push({
      id: `edge:root:${nodeId}`,
      from_id: ROOT_ID,
      to_id: nodeId,
      relation: edgeType,
      source_url: s.url,
      properties: {},
    });
  }

  // ── 1b. OpenAPI → operation nodes ────────────────────────────────────────
  const openapiSurface = surfaces.find((s) => s.type === 'openapi' && s.found);
  if (openapiSurface) {
    emit('graph', 'running', 'Expanding OpenAPI operations into graph nodes...');
    try {
      // Prefer already-crawled page body if present
      const crawled = pages.find(
        (p) => p.url === openapiSurface.url || p.url.includes('openapi') || p.url.includes('swagger')
      );
      let body = crawled?.html;
      if (!body) {
        const hit = await fetchResource(openapiSurface.url, { timeoutMs: 6000, maxBytes: 2_000_000 });
        if (hit.ok) body = hit.body;
      }
      if (body) {
        const parsed = parseOpenAPI(body);
        if (parsed.valid) {
          const apiNodeId = surfaceNodeIds.get(openapiSurface.url) || `surface:${urlId(openapiSurface.url)}`;
          for (const op of parsed.operations.slice(0, 80)) {
            const opId = operationNodeId(op.method, op.path);
            relationalNodes.push({
              id: opId,
              type: 'operation',
              source_url: openapiSurface.url,
              source_strategy: 'docs',
              title: `${op.method} ${op.path}`,
              properties: {
                method: op.method,
                path: op.path,
                operationId: op.operationId,
                summary: op.summary,
                evidence: {
                  source_url: openapiSurface.url,
                  snippet: op.summary || `${op.method} ${op.path}`,
                },
                synthetic: false,
              },
              content_hash: contentHash(opId),
              extracted_at: new Date().toISOString(),
              confidence: 1.0,
            });
            relationalEdges.push({
              id: `edge:exposes:${apiNodeId}:${opId}`,
              from_id: apiNodeId,
              to_id: opId,
              relation: 'exposes_operation',
              source_url: openapiSurface.url,
              properties: {},
            });
          }
          // Link api endpoints concept if we have operations
          if (parsed.operations.length > 0) {
            relationalNodes.push({
              id: 'concept:api_endpoints',
              type: 'concept',
              source_url: openapiSurface.url,
              source_strategy: 'docs',
              title: 'API Endpoints',
              properties: {
                evidence: {
                  source_url: openapiSurface.url,
                  snippet: `${parsed.pathCount} paths in OpenAPI`,
                },
                synthetic: false,
              },
              extracted_at: new Date().toISOString(),
              confidence: 0.95,
            });
            relationalEdges.push({
              id: `edge:api:concept:endpoints`,
              from_id: apiNodeId,
              to_id: 'concept:api_endpoints',
              relation: 'documents',
              source_url: openapiSurface.url,
              properties: {},
            });
          }
        }
      }
    } catch (err: any) {
      console.error('OpenAPI graph expansion failed:', err?.message);
    }
  }

  // ── 1c. llms.txt → entrypoint_lists edges ───────────────────────────────
  const llmsSurface = surfaces.find(
    (s) => (s.type === 'llms_txt' || s.type === 'llms_full_txt') && s.found
  );
  if (llmsSurface) {
    emit('graph', 'running', 'Linking llms.txt entrypoints...');
    try {
      const hit = await fetchResource(llmsSurface.url, { timeoutMs: 5000, maxBytes: 500_000 });
      if (hit.ok && hit.body) {
        const parsed = parseLlmsTxt(hit.body, llmsSurface.url);
        const fromId = surfaceNodeIds.get(llmsSurface.url) || `surface:${urlId(llmsSurface.url)}`;
        for (const link of parsed.links.slice(0, 30)) {
          if (!sameHost(link, llmsSurface.url) && !link.includes('github')) {
            // still allow external docs hosts from llms
          }
          const targetId = `page:${urlId(link)}`;
          if (!relationalNodes.some((n) => n.id === targetId)) {
            relationalNodes.push({
              id: targetId,
              type: 'page',
              source_url: link,
              source_strategy: 'docs',
              title: link.replace(/^https?:\/\//, '').slice(0, 80),
              properties: {
                fromLlms: true,
                evidence: { source_url: llmsSurface.url, snippet: link },
                synthetic: false,
              },
              content_hash: contentHash(link),
              extracted_at: new Date().toISOString(),
              confidence: 0.85,
            });
          }
          pageUrlToNodeId.set(link.split('#')[0], targetId);
          relationalEdges.push({
            id: `edge:llms:${fromId}:${targetId}`,
            from_id: fromId,
            to_id: targetId,
            relation: 'entrypoint_lists',
            source_url: llmsSurface.url,
            properties: {},
          });
        }
      }
    } catch (err: any) {
      console.error('llms graph expansion failed:', err?.message);
    }
  }

  // ── 2. Run Playbooks & Extract per Page ──────────────────────────────────
  for (let idx = 0; idx < pages.length; idx++) {
    const page = pages[idx];
    if (!page.url || page.title === 'Failed to Crawl') continue;
    if (page.fetchStatus && page.fetchStatus !== 'ok') continue;

    emit('graph', 'running', `Classifying & parsing: ${page.url}...`);

    const signals = await classifier.classify(page.url, page.html || '');
    let bestStrategy: Strategy = strategies.generic;
    let highestConf = 0.0;

    for (const sig of signals) {
      if (sig.confidence > highestConf && sig.confidence >= 0.6) {
        highestConf = sig.confidence;
        bestStrategy = strategies[sig.strategy_type] || strategies.generic;
      }
    }

    try {
      const actions = await bestStrategy.interact(page.url, page.html || '');
      const result = await bestStrategy.extract(page.url, page.html || '', actions);

      // Normalize page node id for hyperlink joining
      let pageEntity = result.entities.find((e) => e.type === 'page');
      const stablePageId = pageNodeIdFromUrl(page.url);
      if (pageEntity) {
        const oldId = pageEntity.id;
        pageEntity = {
          ...pageEntity,
          id: stablePageId,
          properties: {
            ...pageEntity.properties,
            contentKind: page.contentKind,
            needsRender: page.needsRender,
            wordCount: page.wordCount,
            evidence: {
              source_url: page.url,
              snippet: page.headings.slice(0, 3).join(' · ') || page.title,
            },
            synthetic: false,
          },
          content_hash: contentHash(page.html || page.url),
          confidence: 1.0,
        };
        // Rewrite relations from old page id
        for (const rel of result.relations) {
          if (rel.from_id === oldId) rel.from_id = stablePageId;
          if (rel.to_id === oldId) rel.to_id = stablePageId;
        }
      } else {
        pageEntity = {
          id: stablePageId,
          type: 'page',
          source_url: page.url,
          source_strategy: 'generic',
          title: page.title,
          properties: {
            wordCount: page.wordCount,
            contentKind: page.contentKind,
            evidence: { source_url: page.url, snippet: page.title },
            synthetic: false,
          },
          content_hash: contentHash(page.html || page.url),
          extracted_at: new Date().toISOString(),
          confidence: 1.0,
        };
      }

      pageUrlToNodeId.set(page.url.split('#')[0], stablePageId);
      relationalNodes.push(pageEntity);

      // Concepts: require evidence (already set by DocsStrategy when keywords match)
      for (const ent of result.entities) {
        if (ent.id === pageEntity.id) continue;
        if (ent.type === 'page') continue;
        if (ent.type === 'concept') {
          const hasEvidence =
            ent.properties?.evidence?.snippet ||
            ent.properties?.evidence?.heading ||
            ent.properties?.detectedFrom;
          if (!hasEvidence) {
            // Skip concept without evidence (SPEC-04)
            continue;
          }
          ent.properties = {
            ...ent.properties,
            synthetic: false,
            evidence: ent.properties?.evidence || {
              source_url: page.url,
              heading: ent.properties?.detectedFrom,
              snippet: ent.properties?.detectedFrom,
            },
          };
          ent.confidence = Math.max(ent.confidence ?? 0.9, 0.85);
        }
        relationalNodes.push(ent);
      }
      relationalEdges.push(...result.relations);

      // Parent surface link
      let parentSurfaceId: string | null = null;
      let bestMatchLen = 0;
      surfaceNodeIds.forEach((surfId, surfUrl) => {
        if (page.url.startsWith(surfUrl) && surfUrl.length > bestMatchLen) {
          bestMatchLen = surfUrl.length;
          parentSurfaceId = surfId;
        }
      });
      if (!parentSurfaceId) {
        const docsSurface = relationalNodes.find(
          (n) => n.type === 'canonical_link' && n.id !== ROOT_ID
        );
        parentSurfaceId = docsSurface?.id ?? ROOT_ID;
      }
      relationalEdges.push({
        id: `edge:parent:${parentSurfaceId}:${stablePageId}`,
        from_id: parentSurfaceId,
        to_id: stablePageId,
        relation: 'page_references_page',
        source_url: page.url,
        properties: {},
      });

      // ── Same-site hyperlinks → page_links_to_page ──────────────────────
      if (page.html) {
        const links = extractSameSiteLinks(page.html, page.url);
        for (const href of links.slice(0, 25)) {
          const targetKey = href.split('#')[0];
          let targetId = pageUrlToNodeId.get(targetKey);
          if (!targetId) {
            // Placeholder page node for linked-but-not-crawled URLs
            targetId = pageNodeIdFromUrl(targetKey);
            if (!relationalNodes.some((n) => n.id === targetId)) {
              relationalNodes.push({
                id: targetId,
                type: 'page',
                source_url: targetKey,
                source_strategy: 'generic',
                title: targetKey.replace(/^https?:\/\//, '').slice(0, 80),
                properties: {
                  linkedOnly: true,
                  evidence: { source_url: page.url, snippet: `Linked from ${page.title}` },
                  synthetic: false,
                },
                content_hash: contentHash(targetKey),
                extracted_at: new Date().toISOString(),
                confidence: 0.7,
              });
            }
            pageUrlToNodeId.set(targetKey, targetId);
          }
          relationalEdges.push({
            id: `edge:link:${stablePageId}:${targetId}`,
            from_id: stablePageId,
            to_id: targetId,
            relation: 'page_links_to_page',
            source_url: page.url,
            properties: {},
          });
        }
      }
    } catch (err: any) {
      console.error(`Strategy extraction failed for ${page.url}:`, err.message);
    }
  }

  // ── 2.5 Synthetic stubs for dangling edge endpoints only ─────────────────
  const existingNodeIds = new Set(relationalNodes.map((n) => n.id));
  const conceptLabels: Record<string, string> = {
    'concept:authentication': 'Authentication',
    'concept:onboarding': 'Onboarding',
    'concept:webhooks': 'Webhooks',
    'concept:error_handling': 'Error Handling',
    'concept:rate_limiting': 'Rate Limiting',
    'concept:pagination': 'Pagination',
    'concept:sdk_usage': 'SDK Usage',
    'concept:api_endpoints': 'API Endpoints',
  };

  for (const re of relationalEdges) {
    for (const nodeId of [re.from_id, re.to_id]) {
      if (!existingNodeIds.has(nodeId)) {
        let title = nodeId;
        let type = 'concept';
        if (nodeId.startsWith('concept:')) {
          title =
            conceptLabels[nodeId] ||
            nodeId
              .slice(8)
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase());
        } else if (nodeId.startsWith('code:')) {
          title = 'Code Sample';
          type = 'code_example';
        } else if (nodeId.startsWith('operation:')) {
          title = nodeId.slice(10);
          type = 'operation';
        } else if (nodeId.startsWith('page:')) {
          title = 'Linked Page';
          type = 'page';
        }

        relationalNodes.push({
          id: nodeId,
          type,
          source_url: re.source_url,
          source_strategy: 'generic',
          title,
          properties: { autoGenerated: true, synthetic: true },
          extracted_at: new Date().toISOString(),
          confidence: 0.5,
        });
        existingNodeIds.add(nodeId);
      }
    }
  }

  // ── 3. Map to GraphNode / GraphEdge (1:1 type preservation) ───────────────
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const addedNodeIds = new Set<string>();

  for (const rn of relationalNodes) {
    if (addedNodeIds.has(rn.id)) continue;
    addedNodeIds.add(rn.id);

    const isSynthetic =
      rn.properties?.autoGenerated === true || rn.properties?.synthetic === true;

    nodes.push({
      id: rn.id,
      label: rn.title || rn.id,
      type: mapNodeType(rn.type),
      url: rn.source_url,
      isExpensive: (rn.properties?.wordCount ?? 0) > 1500,
      weight: 0,
      synthetic: isSynthetic,
      confidence: rn.confidence,
      evidence: rn.properties?.evidence,
    });
  }

  for (const re of relationalEdges) {
    if (!addedNodeIds.has(re.from_id) || !addedNodeIds.has(re.to_id)) continue;
    if (re.from_id === re.to_id) continue;

    edges.push({
      source: re.from_id,
      target: re.to_id,
      type: mapEdgeType(re.relation),
    });
  }

  // ── 4. Weights & metrics ─────────────────────────────────────────────────
  const edgeSet = new Set<string>();
  const dedupedEdges = edges.filter((e) => {
    const key = `${e.source}->${e.target}:${e.type}`;
    if (edgeSet.has(key)) return false;
    edgeSet.add(key);
    return true;
  });

  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const validEdges = dedupedEdges.filter(
    (e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target)
  );
  const weightedNodes = computeWeights(nodes, validEdges);
  const metrics = computeGraphMetrics(weightedNodes, validEdges);

  emit(
    'graph',
    'done',
    `Knowledge graph: ${weightedNodes.length} nodes, ${validEdges.length} edges, ${metrics.components ?? '?'} components.`
  );

  const seenNodeIds = new Set<string>();
  const dedupedRelationalNodes = relationalNodes.filter((n) => {
    if (!n.id || seenNodeIds.has(n.id)) return false;
    seenNodeIds.add(n.id);
    return true;
  });

  const seenEdgeKeys = new Set<string>();
  const dedupedRelationalEdges = relationalEdges.filter((e) => {
    const key = `${e.from_id}->${e.to_id}:${e.relation}`;
    if (seenEdgeKeys.has(key)) return false;
    seenEdgeKeys.add(key);
    return true;
  });

  return {
    nodes: weightedNodes,
    edges: validEdges,
    metrics,
    relationalNodes: dedupedRelationalNodes,
    relationalEdges: dedupedRelationalEdges,
  };
}
