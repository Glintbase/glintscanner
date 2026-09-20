"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Boxes,
  Zap,
  Globe,
  Copy,
  Check,
  Play,
  Terminal,
  Shield,
  Search,
  Sparkles,
  ArrowRight,
  Layers,
  Cpu,
  Lock,
  ExternalLink,
} from "lucide-react";
import { CommandBlock } from "../tools/CommandBlock";

type ClientKey = "claude" | "cursor" | "chatgpt" | "windsurf" | "local-tunnel";
type ToolCategory = "all" | "audit" | "simulation" | "sandbox" | "security" | "skills";

interface ClientSnippet {
  id: ClientKey;
  name: string;
  badge: string;
  filename: string;
  lang: "json" | "bash";
  code: string;
  notes: string;
}

const CLIENT_SNIPPETS: ClientSnippet[] = [
  {
    id: "claude",
    name: "Claude Desktop",
    badge: "Streamable HTTP",
    filename: "claude_desktop_config.json",
    lang: "json",
    code: `{
  "mcpServers": {
    "glintbase": {
      "url": "https://scan.glintbase.dev/api/mcp"
    }
  }
}`,
    notes: "Paste into %APPDATA%\\Claude\\claude_desktop_config.json (Windows) or ~/Library/Application Support/Claude/claude_desktop_config.json (macOS).",
  },
  {
    id: "cursor",
    name: "Cursor",
    badge: "Remote / Stdio",
    filename: "~/.cursor/mcp.json",
    lang: "json",
    code: `{
  "mcpServers": {
    "glintbase": {
      "url": "https://scan.glintbase.dev/api/mcp"
    }
  }
}`,
    notes: "In Cursor Settings > Features > MCP, click 'Add New MCP Server' and paste the URL https://scan.glintbase.dev/api/mcp.",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    badge: "HTTP Action / MCP",
    filename: "Developer Connector",
    lang: "json",
    code: `{
  "name": "glintbase",
  "endpoint": "https://scan.glintbase.dev/api/mcp",
  "protocol": "2024-11-05"
}`,
    notes: "In custom GPT or Developer Action configuration, point your remote tool schema to https://scan.glintbase.dev/api/mcp.",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    badge: "Remote Streamable",
    filename: "~/.codeium/windsurf/mcp_config.json",
    lang: "json",
    code: `{
  "mcpServers": {
    "glintbase": {
      "url": "https://scan.glintbase.dev/api/mcp"
    }
  }
}`,
    notes: "In Windsurf, open Cascade MCP configuration and add the Glintbase remote URL.",
  },
  {
    id: "local-tunnel",
    name: "Local Codebase Tunnel",
    badge: "Zero-Config Bridge",
    filename: "Terminal",
    lang: "bash",
    code: `npx @glintbase/cli mcp --share`,
    notes: "Spawns an ephemeral Cloudflare Quick Tunnel (https://*.trycloudflare.com/mcp) so remote Claude or ChatGPT can safely inspect your local uncommitted codebase.",
  },
];

interface ToolDefinition {
  name: string;
  category: "audit" | "simulation" | "sandbox" | "security" | "skills";
  badge: string;
  summary: string;
  description: string;
  outputFormat: string;
}

const TOOLS_CATALOG: ToolDefinition[] = [
  // Auditing
  {
    name: "glintbase_audit",
    category: "audit",
    badge: "Pillar Audit",
    summary: "Complete ARS 3.0 audit across 6 pillars",
    description: "Evaluates Discovery, Access, Usability, Semantic, Architecture, and Safety with dynamic denominator scoring.",
    outputFormat: "Structured JSON",
  },
  {
    name: "glintbase_get_score",
    category: "audit",
    badge: "< 200 Tokens",
    summary: "Ultra-compact ARS 3.0 scorecard",
    description: "Returns letter grade, score (0-100), and gate status without burning the agent's context window.",
    outputFormat: "Compact Score Card",
  },
  {
    name: "glintbase_discover_surfaces",
    category: "audit",
    badge: "Matrix Scan",
    summary: "Discovers all machine entrypoints",
    description: "Checks robots.txt, llms.txt, .well-known/ard.json, auth.md, OpenAPI, and WebMCP routes.",
    outputFormat: "Surface Array",
  },

  // Simulation
  {
    name: "glintbase_simulate_flight",
    category: "simulation",
    badge: "Multi-Modal",
    summary: "Multi-agent flight simulator with visual graph",
    description: "Simulates Claude Code, Cursor, or Perplexity navigating your API. Returns JSON telemetry, a dark-mode Journey Tree SVG image, and an instant replay link.",
    outputFormat: "JSON + SVG Image + Replay URL",
  },
  {
    name: "glintbase_counterfactual_proof",
    category: "simulation",
    badge: "What-If Delta",
    summary: "Before/after empirical proof card",
    description: "Compares baseline performance against performance with living artifacts installed, proving token savings and failure reduction.",
    outputFormat: "Comparative Proof Card",
  },
  {
    name: "glintbase_calculate_token_tax",
    category: "simulation",
    badge: "Tax Auditor",
    summary: "Quantifies context window bloat",
    description: "Calculates the token tax multiplier incurred by unstructured HTML documentation vs machine-readable specs.",
    outputFormat: "Cost & Tax Multiplier",
  },
  {
    name: "glintbase_check_schema_friction",
    category: "simulation",
    badge: "Friction Index",
    summary: "Evaluates hallucination risk on parameters",
    description: "Inspects API and MCP parameter schemas for ambiguity, excessive nesting, and type friction.",
    outputFormat: "Friction Score (0-100)",
  },

  // Sandboxing
  {
    name: "glintbase_generate_artifact",
    category: "sandbox",
    badge: "Synthesizer",
    summary: "Synthesizes living artifacts with AST validation",
    description: "Generates production-grade llms.txt, ard.json, auth.md, or streamable MCP route handlers.",
    outputFormat: "Validated Source Artifact",
  },
  {
    name: "glintbase_sandbox_validate",
    category: "sandbox",
    badge: "Virtual AST",
    summary: "In-memory AST evaluation without disk writes",
    description: "Tests proposed changes and artifact structures in an isolated in-memory sandbox before applying them.",
    outputFormat: "AST Diagnostic Report",
  },
  {
    name: "glintbase_inspect_webmcp",
    category: "sandbox",
    badge: "DOM Inspector",
    summary: "Client-side WebMCP window.modelContext audit",
    description: "Audits frontend interfaces for semantic agent forms, microdata, and client-side tool registrations.",
    outputFormat: "WebMCP DOM Audit",
  },

  // Security & Governance
  {
    name: "glintbase_ci_gate",
    category: "security",
    badge: "Zero-Drift",
    summary: "CI quality gate with PR comments",
    description: "Evaluates git drift against an ARS threshold and outputs ready-to-paste GitHub step summary markdown.",
    outputFormat: "GitHub Step Summary",
  },
  {
    name: "glintbase_compliance_report",
    category: "security",
    badge: "Enterprise",
    summary: "OWASP Top 10 for LLMs & ISO 42001 assessment",
    description: "Produces executive-level compliance mapping across prompt injection barriers, data boundary leakage, and agent auth.",
    outputFormat: "Executive Governance Doc",
  },
  {
    name: "glintbase_audit_canaries",
    category: "security",
    badge: "Anti-Trap",
    summary: "Detects soft-200 SPA leaks & 404 traps",
    description: "Probes synthetic 404 routes to ensure the API returns strict RFC 7807/9457 error bodies instead of HTML pages.",
    outputFormat: "Canary Boundary Audit",
  },
  {
    name: "glintbase_verify_agent_auth",
    category: "security",
    badge: "Machine Auth",
    summary: "Validates WorkOS auth.md & RFC 9728 credentials",
    description: "Verifies machine authentication surfaces, OAuth2 client credential discovery, and scoped permissions.",
    outputFormat: "Auth Security Report",
  },
  {
    name: "glintbase_audit_mutation_safety",
    category: "security",
    badge: "Idempotency",
    summary: "Audits Idempotency-Key & mutation hints",
    description: "Checks state-changing POST/PUT/DELETE endpoints for idempotency locks, readOnlyHint, and destructiveHint flags.",
    outputFormat: "Mutation Safety Audit",
  },

  // Skills
  {
    name: "glintbase_get_skill",
    category: "skills",
    badge: "Playbook",
    summary: "Retrieves complete markdown skill instructions",
    description: "Loads any of the 9 bundled Glintbase skills as programmatic agent context.",
    outputFormat: "Markdown Instruction Playbook",
  },
  {
    name: "glintbase_install_skill",
    category: "skills",
    badge: "Scaffolder",
    summary: "Scaffolds .agents/skills/<name>/SKILL.md to disk",
    description: "Directly writes the chosen skill playbook into the project repository for permanent agent pair-programming.",
    outputFormat: "Physical File Scaffolding",
  },
];

const BUNDLED_SKILLS = [
  {
    name: "glintbase-agent-readiness",
    title: "Glintbase Agent Readiness (ARS 3.0)",
    uri: "skill://glintbase/glintbase-agent-readiness",
    desc: "The master ARS 3.0 specification covering 6 pillars, dynamic denominator scoring, and automated drift prevention.",
  },
  {
    name: "living-artifacts-architect",
    title: "Living Artifacts Architect",
    uri: "skill://glintbase/living-artifacts-architect",
    desc: "Best practices for authoring public/llms.txt, llms-full.txt, and .well-known/ard.json.",
  },
  {
    name: "streamable-mcp-builder",
    title: "Streamable MCP Builder",
    uri: "skill://glintbase/streamable-mcp-builder",
    desc: "Guide to building Model Context Protocol servers with dual Stdio & Streamable HTTP transports.",
  },
  {
    name: "agent-auth-handbook",
    title: "Agent Authentication Handbook",
    uri: "skill://glintbase/agent-auth-handbook",
    desc: "Machine-to-machine authentication with RFC 9728, WorkOS auth.md, and scoped API key handshakes.",
  },
  {
    name: "webmcp-browser-integration",
    title: "WebMCP Browser Integration",
    uri: "skill://glintbase/webmcp-browser-integration",
    desc: "Registering client-side tool capabilities on window.modelContext for browser-based agents.",
  },
  {
    name: "token-tax-and-schema-optimizer",
    title: "Token Tax & Schema Optimizer",
    uri: "skill://glintbase/token-tax-and-schema-optimizer",
    desc: "Techniques to eliminate context window bloat, reduce parameter cognitive friction, and avoid hallucinations.",
  },
  {
    name: "flight-simulator-replay",
    title: "Flight Simulator Replay",
    uri: "skill://glintbase/flight-simulator-replay",
    desc: "Debug agent navigation trajectories, analyze breadcrumb traces, and prove counterfactual fixes.",
  },
  {
    name: "zero-drift-ci-gate",
    title: "Zero-Drift CI Gate",
    uri: "skill://glintbase/zero-drift-ci-gate",
    desc: "Automating ARS regression prevention in GitHub Actions with step summaries and PR comments.",
  },
  {
    name: "enterprise-agent-governance",
    title: "Enterprise Agent Governance",
    uri: "skill://glintbase/enterprise-agent-governance",
    desc: "Mapping agent readiness to OWASP Top 10 for LLMs, ISO/IEC 42001, and SOC2 audit compliance.",
  },
];

export function McpGateway() {
  const [activeClient, setActiveClient] = useState<ClientKey>("claude");
  const [activeCategory, setActiveCategory] = useState<ToolCategory>("all");
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  const selectedSnippet = CLIENT_SNIPPETS.find((c) => c.id === activeClient) ?? CLIENT_SNIPPETS[0];

  const filteredTools =
    activeCategory === "all"
      ? TOOLS_CATALOG
      : TOOLS_CATALOG.filter((t) => t.category === activeCategory);

  const handleCopyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText("https://scan.glintbase.dev/api/mcp");
      setCopiedEndpoint(true);
      setTimeout(() => setCopiedEndpoint(false), 1600);
    } catch {}
  };

  return (
    <main className="flex-1 flex flex-col items-center pt-28 pb-24 px-4 sm:px-6 w-full max-w-6xl mx-auto selection:bg-[#FF3300]/30 selection:text-white">
      {/* ── 1. Hero Header ── */}
      <div className="flex flex-col items-center text-center mb-12 max-w-3xl">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#FF3300]/30 bg-[#FF3300]/[0.08] text-[#FF3300] text-xs font-mono mb-6 shadow-[0_0_24px_rgba(255,51,0,0.2)]">
          <Boxes size={14} />
          <span>GLINTBASE MCP 3.0 • UNIFIED SPECIFICATION</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-4">
          Connect Any AI Agent to <span className="text-[#FF3300]">Glintbase ARS</span>
        </h1>
        <p className="text-base sm:text-lg text-white/60 leading-relaxed max-w-2xl">
          Zero-config agent readiness tools for Claude Desktop, Cursor, ChatGPT, and Windsurf.
          Run live audits, multi-modal flight simulations, and in-memory sandboxes directly from your AI pair programmer.
        </p>
      </div>

      {/* ── 2. Featured: Live Remote MCP Connector Cockpit ── */}
      <section className="w-full mb-16 rounded-2xl border border-white/[0.12] bg-[#121214] p-6 sm:p-8 relative overflow-hidden shadow-[0_12px_48px_rgba(0,0,0,0.6)]">
        {/* Glow ambient */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[radial-gradient(ellipse_at_top_right,rgba(255,51,0,0.15),transparent_70%)] pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#FF3300] uppercase tracking-wider mb-2">
              <Globe size={14} />
              <span>Public Live Endpoint</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">Streamable Remote MCP Connector</h2>
            <p className="text-sm text-white/55 mt-1">
              Connect directly via public HTTPS URL without installing packages or configuring API keys.
            </p>
          </div>

          {/* Quick Copy URL Bar */}
          <div className="flex items-center gap-2 bg-black/60 border border-white/[0.14] rounded-xl p-1.5 pl-4 max-w-xl w-full lg:w-auto">
            <span className="font-mono text-xs text-white/80 truncate">
              https://scan.glintbase.dev/api/mcp
            </span>
            <button
              onClick={handleCopyEndpoint}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF3300] hover:bg-[#FF4411] text-white text-xs font-mono font-medium transition-all shrink-0 active:scale-[0.97]"
            >
              {copiedEndpoint ? (
                <>
                  <Check size={13} />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span>Copy URL</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Client Config Selector Tabs */}
        <div className="mt-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <span className="text-xs font-mono uppercase tracking-wider text-white/40">Select Your Client:</span>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {CLIENT_SNIPPETS.map((client) => {
                const isActive = activeClient === client.id;
                return (
                  <button
                    key={client.id}
                    onClick={() => setActiveClient(client.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all shrink-0 border ${
                      isActive
                        ? "bg-white/[0.1] text-white border-white/20 shadow-sm"
                        : "bg-transparent text-white/45 border-transparent hover:text-white/80 hover:bg-white/[0.04]"
                    }`}
                  >
                    {client.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Config Display */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2">
              <CommandBlock
                code={selectedSnippet.code}
                label={selectedSnippet.filename}
                language={selectedSnippet.lang}
              />
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono font-semibold text-white">{selectedSnippet.name}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#FF3300]/15 text-[#FF3300] border border-[#FF3300]/30">
                    {selectedSnippet.badge}
                  </span>
                </div>
                <p className="text-xs text-white/60 leading-relaxed mt-2">
                  {selectedSnippet.notes}
                </p>
              </div>

              <div className="mt-4 pt-4 border-t border-white/[0.06] text-[11px] font-mono text-white/40 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                <span>Zero configuration required</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. 17 Composable Tools Catalog ── */}
      <section className="w-full mb-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#FF3300] uppercase tracking-wider mb-2">
              <Terminal size={14} />
              <span>Composable Engine</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">The 17 Production MCP Tools</h2>
            <p className="text-sm text-white/55 mt-1">
              Engineered for low token consumption, high signal density, and multi-modal feedback.
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar p-1 rounded-xl bg-[#121214] border border-white/[0.08]">
            {(
              [
                { id: "all", label: "All (17)" },
                { id: "audit", label: "Audit (3)" },
                { id: "simulation", label: "Simulation (4)" },
                { id: "sandbox", label: "Sandbox (3)" },
                { id: "security", label: "Security (5)" },
                { id: "skills", label: "Skills (2)" },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-all shrink-0 ${
                  activeCategory === cat.id
                    ? "bg-[#FF3300] text-white font-medium"
                    : "text-white/50 hover:text-white"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTools.map((tool) => (
            <div
              key={tool.name}
              className="rounded-xl border border-white/[0.08] bg-[#121214] p-5 hover:border-white/20 transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="font-mono text-xs font-bold text-white group-hover:text-[#FF3300] transition-colors">
                    {tool.name}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.06] text-white/60 border border-white/[0.08]">
                    {tool.badge}
                  </span>
                </div>

                <p className="text-xs font-medium text-white/80 mb-1.5">{tool.summary}</p>
                <p className="text-[11px] text-white/50 leading-relaxed">{tool.description}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-white/40">
                <span>Output:</span>
                <span className="text-[#FF3300]/90 font-medium">{tool.outputFormat}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. The 9 Bundled Skills Showcase ── */}
      <section className="w-full mb-16 rounded-2xl border border-white/[0.08] bg-[#121214] p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#8B5CF6] uppercase tracking-wider mb-2">
              <Sparkles size={14} />
              <span>Prompts & Resources</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">9 Bundled Agent Skills</h2>
            <p className="text-sm text-white/55 mt-1">
              Registered as native <code className="font-mono text-white/70">skill://glintbase/*</code> resources and optimization prompts.
            </p>
          </div>

          <div className="text-xs font-mono text-white/40">
            Install via: <code className="text-[#FF3300]">npx @glintbase/cli skill install &lt;name&gt;</code>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {BUNDLED_SKILLS.map((skill) => (
            <div
              key={skill.name}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col justify-between hover:border-white/[0.14] transition-all"
            >
              <div>
                <span className="text-[10px] font-mono text-[#8B5CF6] block mb-1">
                  {skill.uri}
                </span>
                <h3 className="text-xs font-bold text-white mb-1.5">{skill.title}</h3>
                <p className="text-[11px] text-white/50 leading-relaxed">{skill.desc}</p>
              </div>

              <div className="mt-3 pt-2 text-[10px] font-mono text-white/35 flex items-center gap-1">
                <span>Prompt:</span>
                <span className="text-white/60">optimize-{skill.name}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5. Flight Simulator Callout Banner ── */}
      <section className="w-full rounded-2xl border border-[#FF3300]/30 bg-gradient-to-r from-[#FF3300]/10 via-transparent to-transparent p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#FF3300] uppercase tracking-wider mb-1">
            <Play size={13} className="fill-[#FF3300]" />
            <span>Interactive Telemetry</span>
          </div>
          <h3 className="text-xl font-bold text-white">Watch Agents Navigate APIs Live in the Web Cockpit</h3>
          <p className="text-sm text-white/60 max-w-xl mt-1">
            Replay simulation runs generated by MCP, examine Journey Trees, and test counterfactual What-If fixes in real-time.
          </p>
        </div>

        <Link
          href="/simulate"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF3300] hover:bg-[#FF4411] text-white text-xs font-mono font-medium transition-transform active:scale-[0.97] shrink-0 uppercase tracking-wider shadow-[0_0_24px_rgba(255,51,0,0.3)]"
        >
          <span>Open Flight Cockpit</span>
          <ArrowRight size={14} />
        </Link>
      </section>
    </main>
  );
}
