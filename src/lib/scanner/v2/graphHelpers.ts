/**
 * Pure graph utilities (SPEC-04) — unit-testable without I/O.
 */

import type { GraphEdge, GraphNode, GraphMetrics } from './types';
import { createHash } from 'crypto';

export function contentHash(text: string): string {
  return createHash('sha256').update(text || '').digest('hex').slice(0, 16);
}

export function urlId(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname)
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 80);
  } catch {
    return url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60);
  }
}

export function sameHost(a: string, b: string): boolean {
  try {
    const ha = new URL(a).hostname.replace(/^www\./, '');
    const hb = new URL(b).hostname.replace(/^www\./, '');
    return ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`);
  } catch {
    return false;
  }
}

/** Extract same-site absolute hrefs from HTML or Markdown body. */
export function extractSameSiteLinks(body: string, pageUrl: string): string[] {
  const links: string[] = [];
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }

  const htmlHref = /href=["'](https?:\/\/[^"'#\s]+|\/[^"'#\s]*)["']/gi;
  let m;
  while ((m = htmlHref.exec(body)) !== null) {
    let href = m[1];
    if (href.startsWith('/')) href = origin + href;
    if (sameHost(href, pageUrl)) links.push(href.split('#')[0]);
  }

  const mdLink = /\[([^\]]*)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/gi;
  while ((m = mdLink.exec(body)) !== null) {
    let href = m[2];
    if (href.startsWith('/')) href = origin + href;
    if (sameHost(href, pageUrl)) links.push(href.split('#')[0]);
  }

  return Array.from(new Set(links)).filter((u) => u !== pageUrl.split('#')[0]);
}

export function computeWeights(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const degree: Record<string, number> = {};
  for (const n of nodes) degree[n.id] = 0;
  for (const e of edges) {
    if (degree[e.source] !== undefined) degree[e.source]++;
    if (degree[e.target] !== undefined) degree[e.target]++;
  }
  return nodes.map((n) => ({ ...n, weight: degree[n.id] ?? 0 }));
}

/** Out-degree only (directed). */
export function outDegreeMap(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const n of nodes) out.set(n.id, 0);
  for (const e of edges) {
    out.set(e.source, (out.get(e.source) ?? 0) + 1);
  }
  return out;
}

/** Undirected degree for WCC. */
export function undirectedDegree(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const d = new Map<string, number>();
  for (const n of nodes) d.set(n.id, 0);
  for (const e of edges) {
    d.set(e.source, (d.get(e.source) ?? 0) + 1);
    d.set(e.target, (d.get(e.target) ?? 0) + 1);
  }
  return d;
}

/** Weakly connected component count. */
export function countWeaklyConnectedComponents(nodes: GraphNode[], edges: GraphEdge[]): number {
  if (nodes.length === 0) return 0;
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }

  const seen = new Set<string>();
  let components = 0;

  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    components++;
    const stack = [n.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const neighbors = adj.get(id);
      if (neighbors) {
        Array.from(neighbors).forEach((nb) => {
          if (!seen.has(nb)) stack.push(nb);
        });
      }
    }
  }
  return components;
}

/** BFS path existence (directed). */
export function hasDirectedPath(
  edges: GraphEdge[],
  fromId: string,
  toPredicate: (id: string) => boolean,
  maxHops = 12
): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.source) || [];
    list.push(e.target);
    adj.set(e.source, list);
  }
  const visited = new Set<string>([fromId]);
  let frontier = [fromId];
  for (let hop = 0; hop < maxHops && frontier.length; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      if (toPredicate(id) && hop > 0) return true;
      if (toPredicate(id) && hop === 0 && id !== fromId) return true;
      for (const t of adj.get(id) || []) {
        if (!visited.has(t)) {
          if (toPredicate(t)) return true;
          visited.add(t);
          next.push(t);
        }
      }
    }
    frontier = next;
  }
  // start is target
  if (toPredicate(fromId)) return true;
  return false;
}

export function computeGraphMetrics(nodes: GraphNode[], edges: GraphEdge[]): GraphMetrics {
  const undirected = undirectedDegree(nodes, edges);
  const out = outDegreeMap(nodes, edges);

  const islands = nodes.filter((n) => (undirected.get(n.id) ?? 0) === 0).length;
  // True sinks: pages with no outbound edges
  const deadEnds = nodes.filter(
    (n) => (n.type === 'page' || n.type === 'canonical_link') && (out.get(n.id) ?? 0) === 0
  ).length;
  const missingBridges = nodes.filter((n) => n.type === 'unresolved_reference').length;
  const components = countWeaklyConnectedComponents(nodes, edges);

  const nc = nodes.length;
  const ec = edges.length;
  const density = nc > 1 ? ec / (nc * (nc - 1)) : 0;
  const adjacencyScore = Math.min(100, Math.round(density * 800 + (ec / Math.max(nc, 1)) * 15));

  let continuityScore = 0;
  if (nodes.some((n) => n.type === 'canonical_link')) continuityScore += 20;
  if (nodes.some((n) => n.type === 'workflow')) continuityScore += 15;
  if (nodes.some((n) => n.id === 'concept:authentication' && !n.synthetic)) continuityScore += 20;
  if (nodes.some((n) => n.type === 'api' || n.type === 'operation')) continuityScore += 20;
  if (nodes.some((n) => n.type === 'machine_entrypoint')) continuityScore += 15;
  if (ec >= nc && nc > 1) continuityScore += 10;
  continuityScore = Math.min(100, continuityScore);

  const docsRoot = nodes.find((n) => n.type === 'canonical_link' && n.id !== 'root:domain');
  const startId = docsRoot?.id || nodes.find((n) => n.id === 'root:domain')?.id;
  const pathDocsToAuth = startId
    ? hasDirectedPath(
        edges,
        startId,
        (id) => id === 'concept:authentication' || id.includes('auth')
      )
    : false;

  return {
    islands,
    deadEnds,
    missingBridges,
    adjacencyScore,
    continuityScore,
    components,
    pathDocsToAuth,
  };
}

export function operationNodeId(method: string, path: string): string {
  const safe = `${method.toUpperCase()}_${path}`.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 80);
  return `operation:${safe}`;
}
