"use client";

import dynamic from "next/dynamic";
import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  weight?: number;
  metadata?: Record<string, unknown>;
  color?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  group?: string;
  val?: number;
}

export interface GraphLink {
  id?: string;
  source: string;
  target: string;
  type?: string;
  weight?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface ObsidianGraphProps {
  data: GraphData;
  isDark?: boolean;
  onNodeClick?: (nodeId: string) => void;
}

// â”€â”€â”€ Brand Colour Palette â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Hub/API nodes      â†’ Solar Neon Red-Orange  #FF3300
// Concept nodes      â†’ Hyper Violet           #8B5CF6
// Machine/Workflow   â†’ Cyan                   #22D3EE

const PALETTE: Record<string, string> = {
  canonical_link:       "#FF3300",   // hub â€” brand red-orange
  api:                  "#FF3300",   // api â€” same prominence
  operation:            "#FF5522",   // OpenAPI operation
  sdk:                  "#FF6633",   // sdk â€” warm orange
  workflow:             "#22D3EE",   // workflow â€” cyan
  machine_entrypoint:   "#22D3EE",   // machine â€” cyan
  concept:              "#8B5CF6",   // concept â€” brand violet
  prerequisite:         "#A78BFA",   // prerequisite â€” light violet
  code_example:         "#7C3AED",   // code â€” deep violet
  page:                 "#6D28D9",   // page â€” dark violet
  support_path:         "#4B5563",   // support â€” muted grey
  unresolved_reference: "#EF4444",   // broken â€” red warning
  duplicate:            "#374151",   // duplicate â€” very muted
};

// Hub types get glow rings in the canvas renderer
const HUB_TYPES = new Set(["canonical_link", "api", "sdk", "operation"]);

const LEGEND_ENTRIES = [
  { key: "canonical_link",      label: "Docs Root"   },
  { key: "api",                 label: "API"         },
  { key: "operation",           label: "Operation"   },
  { key: "sdk",                 label: "SDK"         },
  { key: "concept",             label: "Concept"     },
  { key: "workflow",            label: "Workflow"    },
  { key: "machine_entrypoint",  label: "Entrypoint" },
  { key: "code_example",        label: "Code"        },
  { key: "page",                label: "Page"        },
  { key: "support_path",        label: "Support"     },
  { key: "unresolved_reference",label: "Missing"     },
];

function typeColor(type: string): string {
  return PALETTE[type] ?? "#6D28D9";
}

// Canvas only accepts rgba(), not 8-digit hex — convert safely
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(109,40,217,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Radius hierarchy: hubs big, leaves small & consistent
function nodeRadius(node: GraphNode): number {
  const TYPE_R: Record<string, number> = {
    canonical_link: 10, api: 9, operation: 7, sdk: 8,
    workflow: 7, machine_entrypoint: 7,
    concept: 6, prerequisite: 5, code_example: 5,
    page: 4.5, support_path: 4,
    unresolved_reference: 5, duplicate: 3,
  };
  const base = TYPE_R[node.type ?? "page"] ?? 4.5;
  const weight = node.weight ?? node.val ?? 1;
  return base + Math.min(Math.sqrt(weight) * 0.7, 3.5);
}

// Label collision clearance: node radius + label height + padding
// Used by forceCollide so text never overlaps
function collisionRadius(node: GraphNode): number {
  return nodeRadius(node) + 18;
}

// â”€â”€â”€ Dynamic Import â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

// â”€â”€â”€ Neighbour Map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildNeighborSet(nodeId: string, links: GraphLink[]): Set<string> {
  const s = new Set<string>();
  for (const l of links) {
    const src = typeof l.source === "object" ? (l.source as any).id : l.source;
    const tgt = typeof l.target === "object" ? (l.target as any).id : l.target;
    if (src === nodeId) s.add(tgt);
    if (tgt === nodeId) s.add(src);
  }
  return s;
}

// â”€â”€â”€ Node Detail Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function NodeDetailPanel({ node, onClose, isMobile }: { node: GraphNode | null; onClose: () => void; isMobile?: boolean }) {
  if (!node) return null;
  const color = typeColor(node.type ?? "page");
  return (
    <div className={`absolute ${isMobile ? "bottom-3 left-3 right-3 w-auto max-w-full" : "top-4 right-4 w-56"} bg-black/95 border border-white/[0.12] rounded-xl shadow-2xl p-4 z-20 font-mono text-[10px] text-white/60 space-y-3 backdrop-blur-md`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-white font-bold text-xs leading-snug truncate">{node.label}</div>
          <div
            className="mt-1.5 text-[9px] px-1.5 py-0.5 rounded inline-block uppercase tracking-wider font-bold"
            style={{ background: color + "18", color, border: `1px solid ${color}30` }}
          >
            {node.type ?? node.group}
          </div>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white transition-colors text-sm shrink-0 p-1">✕</button>
      </div>
      <div className="border-t border-white/[0.06] pt-2 space-y-1.5">
        <div className="flex justify-between">
          <span className="text-white/30">Connections</span>
          <span className="text-white/70">{node.weight ?? 0}</span>
        </div>
        {node.metadata && Object.keys(node.metadata).length > 0 && (
          <div className="space-y-1 mt-1">
            {Object.entries(node.metadata).slice(0, 5).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 overflow-hidden">
                <span className="text-white/25 shrink-0">{k}</span>
                <span className="truncate text-right text-white/50">{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function ObsidianGraph3D({ data, isDark = true, onNodeClick }: ObsidianGraphProps) {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [showOrphans, setShowOrphans] = useState(true);
  const [containerWidth, setContainerWidth] = useState(800);
  const isMobile = containerWidth < 768;

  // Responsive width
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // â”€â”€ Debounce search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // â”€â”€ Normalize legacy fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const normalizedData = useMemo(() => ({
    nodes: data.nodes.map(n => ({
      ...n,
      type: n.type ?? n.group ?? "page",
      weight: n.weight ?? n.val ?? 1,
    })),
    links: data.links,
  }), [data]);

  // â”€â”€ Neighbour map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const node of normalizedData.nodes) {
      map.set(node.id, buildNeighborSet(node.id, normalizedData.links));
    }
    return map;
  }, [normalizedData]);

  // â”€â”€ Filter + search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const filteredData = useMemo(() => {
    let nodes = normalizedData.nodes;

    if (!showOrphans) {
      const connected = new Set(
        normalizedData.links.flatMap(l => {
          const s = typeof l.source === "object" ? (l.source as any).id : l.source;
          const t = typeof l.target === "object" ? (l.target as any).id : l.target;
          return [s, t];
        })
      );
      nodes = nodes.filter(n => connected.has(n.id));
    }

    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      const matchIds = new Set(
        nodes.filter(n => n.label.toLowerCase().includes(q) || n.type.toLowerCase().includes(q)).map(n => n.id)
      );
      nodes = nodes.filter(n => matchIds.has(n.id));
    }

    const nodeIdSet = new Set(nodes.map(n => n.id));
    const links = normalizedData.links.filter(l => {
      const s = typeof l.source === "object" ? (l.source as any).id : l.source;
      const t = typeof l.target === "object" ? (l.target as any).id : l.target;
      return nodeIdSet.has(s) && nodeIdSet.has(t);
    });

    return { nodes, links };
  }, [normalizedData, debouncedQuery, showOrphans]);

  const configureForces = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const charge = fg.d3Force("charge");
    if (charge) charge.strength(-280).distanceMin(10).distanceMax(400);

    const link = fg.d3Force("link");
    if (link) link.distance(85).strength(0.7).iterations(3);

    // Inject a custom label-aware collision force.
    // This avoids needing to import or require d3-force, which solves build & eslint errors.
    let nodesList: GraphNode[] = [];
    const customCollisionForce = (alpha: number) => {
      for (let i = 0; i < nodesList.length; i++) {
        const nodeA = nodesList[i];
        if (nodeA.x === undefined || nodeA.y === undefined) continue;
        for (let j = i + 1; j < nodesList.length; j++) {
          const nodeB = nodesList[j];
          if (nodeB.x === undefined || nodeB.y === undefined) continue;
          
          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDistance = collisionRadius(nodeA) + collisionRadius(nodeB);
          
          if (dist < minDistance) {
            const overlap = minDistance - dist;
            // Pushes nodes apart based on overlap
            const pushX = (dx / dist) * overlap * 0.5 * alpha;
            const pushY = (dy / dist) * overlap * 0.5 * alpha;
            
            if (nodeA.fx === undefined || nodeA.fx === null) {
              nodeA.x -= pushX;
              if (nodeA.vx !== undefined) nodeA.vx -= pushX * 0.2;
            }
            if (nodeB.fx === undefined || nodeB.fx === null) {
              nodeB.x += pushX;
              if (nodeB.vx !== undefined) nodeB.vx += pushX * 0.2;
            }
            if (nodeA.fy === undefined || nodeA.fy === null) {
              nodeA.y -= pushY;
              if (nodeA.vy !== undefined) nodeA.vy -= pushY * 0.2;
            }
            if (nodeB.fy === undefined || nodeB.fy === null) {
              nodeB.y += pushY;
              if (nodeB.vy !== undefined) nodeB.vy += pushY * 0.2;
            }
          }
        }
      }
    };
    
    // D3 expects initialize method on custom forces
    customCollisionForce.initialize = (newNodes: GraphNode[]) => {
      nodesList = newNodes;
    };

    fg.d3Force("collision", customCollisionForce);

    const center = fg.d3Force("center");
    if (center) center.strength(0.05);

    fg.d3ReheatSimulation();
  }, []);

  useEffect(() => {
    const t = setTimeout(configureForces, 50);
    return () => clearTimeout(t);
  }, [configureForces, filteredData]);

  const handleEngineStop = useCallback(() => {
    fgRef.current?.zoomToFit(600, 52);
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    fgRef.current?.centerAt(node.x, node.y, 500);
    fgRef.current?.zoom(4.5, 500);
    setSelectedNode(node);
    onNodeClick?.(node.id);
  }, [onNodeClick]);

  const handleNodeDragEnd = useCallback((node: GraphNode) => {
    node.fx = node.x;
    node.fy = node.y;
  }, []);

  // ——————————————————————————————————————————————————————————————————————————————
  const nodeColor = useCallback((node: GraphNode) => {
    const base = typeColor(node.type ?? "page");
    if (!hoverNode) return base;
    if (node.id === hoverNode.id) return "#ffffff";
    if (neighborMap.get(hoverNode.id)?.has(node.id)) return base;
    return hexToRgba(base, 0.15); // dim non-neighbours — valid rgba, not 8-digit hex
  }, [hoverNode, neighborMap]);

  const linkColor = useCallback((link: GraphLink) => {
    const activeLink = isDark ? 'rgba(255,255,255,0.50)' : 'rgba(60,40,10,0.55)';
    const idleLink   = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(80,55,20,0.18)';
    const dimLink    = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(80,55,20,0.05)';
    if (!hoverNode) return idleLink;
    const s = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const t = typeof link.target === 'object' ? (link.target as any).id : link.target;
    if (s === hoverNode.id || t === hoverNode.id) return activeLink;
    return dimLink;
  }, [hoverNode, isDark]);

  // force-graph uses nodeVal for internal collision approx (area-based)
  const nodeVal = useCallback((node: GraphNode) => {
    const r = nodeRadius(node);
    return r * r;
  }, []);

  // ── Full canvas renderer: circle + gloss + label ────────────────────────────
  const nodeCanvasObject = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const r = nodeRadius(node);
    const color = nodeColor(node);
    const isHovered = hoverNode?.id === node.id;
    const isSelected = selectedNode?.id === node.id;
    const isHub = HUB_TYPES.has(node.type ?? "");

    // 1. Outer glow ring (hubs + hovered + selected) using safe rgba conversion
    // Skip heavy radial gradients on mobile for 60fps scrolling
    if ((isHub || isHovered || isSelected) && !isMobile) {
      const baseHex = typeColor(node.type ?? "page");
      const glowR = r + (isHovered ? 6 : 4);
      const gradient = ctx.createRadialGradient(x, y, r * 0.5, x, y, glowR + 5);
      gradient.addColorStop(0, hexToRgba(baseHex, 0.28));
      gradient.addColorStop(1, hexToRgba(baseHex, 0));
      ctx.beginPath();
      ctx.arc(x, y, glowR + 5, 0, 2 * Math.PI);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // 2. Main circle
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    // 3. Inner gloss highlight (top-left sphere gloss)
    ctx.beginPath();
    ctx.arc(x - r * 0.28, y - r * 0.28, r * 0.42, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fill();

    // 4. Selected outline ring
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, r + 2.5, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 1 / globalScale;
      ctx.stroke();
    }

    // 5. Label Rendering - beautiful pill-badge container (matches user screenshot exactly)
    const weight = node.weight ?? 1;
    const minScale = isHub ? 0.2 : 0.55;
    if (globalScale >= minScale) {
      const fontSize = Math.max(3.2, Math.min(10.5 / globalScale, 10.5));
      ctx.font = `${Math.round(fontSize * 10) / 10}px Inter, system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const raw = node.label ?? "";
      const label = raw.length > 24 ? raw.slice(0, 22) + "…" : raw;
      
      // Measure label text width for precise pill sizing
      const textWidth = ctx.measureText(label).width;
      const pillH = fontSize + 6.5;
      const pillW = textWidth + 12;

      // Draw pill background
      ctx.beginPath();
      const px = x - pillW / 2;
      const py = y + r + 5;
      const pw = pillW;
      const ph = pillH;
      const pr = 4.5; // border radius
      
      ctx.moveTo(px + pr, py);
      ctx.lineTo(px + pw - pr, py);
      ctx.quadraticCurveTo(px + pw, py, px + pw, py + pr);
      ctx.lineTo(px + pw, py + ph - pr);
      ctx.quadraticCurveTo(px + pw, py + ph, px + pw - pr, py + ph);
      ctx.lineTo(px + pr, py + ph - pr);
      ctx.quadraticCurveTo(px, py + ph, px, py + ph - pr);
      ctx.lineTo(px, py + pr);
      ctx.quadraticCurveTo(px, py, px + pr, py);
      ctx.closePath();

      // Semitransparent background for maximum readability — cream-aware
      ctx.fillStyle = isDark ? 'rgba(10, 10, 12, 0.88)' : 'rgba(240, 232, 218, 0.92)';
      ctx.fill();

      // Fine border around the pill to stand out
      const baseHex = typeColor(node.type ?? "page");
      ctx.strokeStyle = isHovered || isSelected 
        ? "rgba(255, 255, 255, 0.4)" 
        : hexToRgba(baseHex, 0.22);
      ctx.lineWidth = 0.75;
      ctx.stroke();

      // Text color — readable on both dark and cream canvas
      const alpha = (!hoverNode || node.id === hoverNode.id || neighborMap.get(hoverNode.id)?.has(node.id))
        ? (isHovered || isSelected ? 1.0 : 0.85)
        : 0.18;
      ctx.fillStyle = isDark
        ? `rgba(255, 255, 255, ${alpha})`
        : `rgba(35, 18, 5, ${alpha})`;
      
      // Draw text
      ctx.fillText(label, x, py + ph / 2);
    }
  }, [nodeColor, hoverNode, selectedNode, neighborMap, isDark]);

  const hasData = filteredData.nodes.length > 0;

  return (
    <div className="w-full flex flex-col bg-black rounded-xl border border-white/[0.06] overflow-hidden glint-card">

      {/* â”€â”€ Control bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-white/[0.05] font-mono">

        {/* Search */}
        <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-1.5 min-w-0 w-full max-w-[200px]">
          <span className="text-white/20 text-[11px] flex-shrink-0">âŒ•</span>
          <input
            type="text"
            placeholder="Search nodesâ€¦"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-transparent text-white/60 text-[11px] outline-none w-full placeholder-white/15"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-white/20 hover:text-white/60 text-[10px] flex-shrink-0">âœ•</button>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2 text-[9px] font-mono text-white/20 uppercase tracking-wider ml-1">
          <span>{filteredData.nodes.length} nodes</span>
          <span className="text-white/10">Â·</span>
          <span>{filteredData.links.length} edges</span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Orphan toggle */}
          <button
            onClick={() => setShowOrphans(s => !s)}
            className={`text-[9px] uppercase tracking-wider font-bold px-2.5 py-1 rounded border transition-colors ${
              showOrphans
                ? "bg-white/[0.03] border-white/[0.07] text-white/25 hover:text-white/50"
                : "bg-[#8B5CF6]/12 border-[#8B5CF6]/25 text-[#8B5CF6]"
            }`}
          >
            {showOrphans ? "Hide isolated" : "Show isolated"}
          </button>

          {/* Fit button */}
          <button
            onClick={() => fgRef.current?.zoomToFit(400, 48)}
            className="text-[9px] uppercase tracking-wider font-bold px-2.5 py-1 rounded border border-white/[0.07] bg-white/[0.03] text-white/25 hover:text-white/60 transition-colors"
          >
            Fit view
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="relative w-full touch-pan-y" style={{ height: isMobile ? 340 : 520 }}>
        {hasData ? (
          <ForceGraph2D
            ref={fgRef}
            width={containerWidth}
            height={isMobile ? 340 : 520}
            graphData={filteredData as any}
            nodeId="id"
            nodeLabel={() => ""}
            nodeVal={nodeVal as any}
            nodeColor={nodeColor as any}
            nodeCanvasObjectMode={() => "replace"}
            nodeCanvasObject={nodeCanvasObject as any}
            linkColor={linkColor as any}
            linkWidth={() => 0.65}
            linkDirectionalArrowLength={0}
            onNodeClick={handleNodeClick as any}
            onNodeHover={(n: any) => setHoverNode(n)}
            onNodeDragEnd={handleNodeDragEnd as any}
            onEngineStop={handleEngineStop}
            cooldownTicks={isMobile ? 60 : 220}
            d3AlphaDecay={isMobile ? 0.04 : 0.016}
            d3VelocityDecay={0.42}
            backgroundColor={isDark ? '#000000' : '#F0E8DA'}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/35 font-mono text-[11px]">
            {debouncedQuery ? `No nodes matching "${debouncedQuery}"` : "No graph data available for this scan"}
          </div>
        )}

        <NodeDetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} isMobile={isMobile} />
      </div>

      {/* â”€â”€ Legend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 border-t border-white/[0.05] text-[8.5px] font-mono text-white/25 uppercase tracking-wider">
        {LEGEND_ENTRIES.map(({ key, label }) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PALETTE[key] }} />
            {label}
          </span>
        ))}
      </div>
    </div>

  );
}

