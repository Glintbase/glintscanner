"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Terminal, Boxes, Sparkles, Play, ArrowUpRight, ArrowRight, ShieldCheck, Cpu } from "lucide-react";
import { CommandBlock } from "./CommandBlock";

interface ResourceCommand {
  label: string;
  code: string;
  language?: "bash" | "json" | "text";
}

interface Resource {
  id: string;
  name: string;
  icon: React.ReactNode;
  accent: string;
  bestFor: string;
  pitch: string;
  commands: ResourceCommand[];
  link: { href: string; label: string; external?: boolean };
}

const RESOURCES: Resource[] = [
  {
    id: "mcp",
    name: "MCP Server (ARS 3.0)",
    icon: <Boxes size={22} />,
    accent: "#FF3300",
    bestFor: "In-editor & Remote Agents",
    pitch:
      "17 composable tools and 9 skills for Claude Desktop, Cursor, and ChatGPT. Connect remotely via unified URL or run locally.",
    commands: [
      {
        label: "Remote URL Connector (Claude & Cursor)",
        language: "json",
        code: `{
  "mcpServers": {
    "glintbase": {
      "url": "https://scan.glintbase.dev/api/mcp"
    }
  }
}`,
      },
      {
        label: "Local Codebase Tunnel (CLI)",
        language: "bash",
        code: `npx @glintbase/cli mcp --share`,
      },
    ],
    link: { href: "/mcp", label: "Open the MCP gateway" },
  },
  {
    id: "cli",
    name: "Glintbase CLI (v3.0.0)",
    icon: <Terminal size={22} />,
    accent: "#22D3EE",
    bestFor: "Terminal, CI/CD & Local Repos",
    pitch:
      "Full ARS 3.0 codebase auditor, multi-agent flight simulator, and zero-drift GitHub Actions CI shields for your terminal.",
    commands: [
      {
        label: "Full Codebase / URL Audit",
        language: "bash",
        code: `npx @glintbase/cli audit https://docs.example.com`,
      },
      {
        label: "Multi-Agent Flight Simulator",
        language: "bash",
        code: `npx @glintbase/cli simulate --agent claude-code --intent "Authenticate and call API"`,
      },
      {
        label: "Zero-Drift CI Quality Gate",
        language: "bash",
        code: `npx @glintbase/cli ci --fail-under 75`,
      },
    ],
    link: {
      href: "https://www.npmjs.com/package/@glintbase/cli",
      label: "View on npm",
      external: true,
    },
  },
  {
    id: "skill",
    name: "9 Agent Skills Suite",
    icon: <Sparkles size={22} />,
    accent: "#8B5CF6",
    bestFor: "Agent Context & Playbooks",
    pitch:
      "Teach Claude Code, Cursor, and Windsurf how to build living artifacts, author WorkOS auth.md, and optimize token tax.",
    commands: [
      {
        label: "Install a skill into workspace",
        language: "bash",
        code: `# Scaffold directly to .agents/skills/
npx @glintbase/cli skill install living-artifacts-architect

# Or view all 9 playbooks
npx @glintbase/cli skill list`,
      },
    ],
    link: {
      href: "/mcp",
      label: "Browse all 9 skills",
      external: false,
    },
  },
  {
    id: "simulate",
    name: "Flight Simulator Cockpit",
    icon: <Play size={22} />,
    accent: "#10B981",
    bestFor: "Live ReAct Mission Replay",
    pitch:
      "Autonomous agent mission control: observe agent decision branches, quantify token taxes, and test What-If fixes live.",
    commands: [
      {
        label: "Test Any API in the Cockpit",
        language: "bash",
        code: `Visit https://scan.glintbase.dev/simulate`,
      },
    ],
    link: {
      href: "/simulate",
      label: "Launch flight simulator",
      external: false,
    },
  },
];

const COMPARISON: { label: string; web: string; cli: string; mcp: string }[] = [
  { label: "Best for", web: "Visual inspection & demos", cli: "Local AST & CI gates", mcp: "In-editor pair programming" },
  { label: "Setup", web: "None (zero-install)", cli: "npm install @glintbase/cli", mcp: "Paste URL or command" },
  { label: "Execution Engine", web: "Interactive D3 Flight Canvas", cli: "Deterministic & Live LLM", mcp: "Multi-Modal (JSON + SVG Image)" },
  { label: "Target Scope", web: "Public Web URLs", cli: "Local codebases & Live URLs", mcp: "Local repos (.) & Live URLs" },
  { label: "Token Efficiency", web: "Real-time SSE streaming", cli: "Exit codes & JSON/MD", mcp: "< 200 tok cards & multi-modal" },
  { label: "Drift Prevention", web: "Replay URL (#data=...)", cli: "GitHub Actions CI Gate", mcp: "In-memory AST Sandboxing" },
];

const fade = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
};

export function ResourceHub() {
  return (
    <main className="flex-1 flex flex-col items-center pt-28 pb-20 px-4 sm:px-6 w-full max-w-6xl mx-auto selection:bg-[#FF3300]/30 selection:text-white">
      {/* Hero */}
      <motion.div
        {...fade}
        transition={{ duration: 0.6 }}
        className="flex flex-col items-center text-center mb-14 max-w-3xl"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#FF3300]/30 bg-[#FF3300]/[0.08] text-[#FF3300] text-xs font-mono mb-4 shadow-[0_0_24px_rgba(255,51,0,0.2)]">
          <Terminal size={14} />
          <span>DEVELOPER TOOLS SUITE • ARS 3.0</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-4">
          Ship Agent-Ready <span className="text-[#FF3300]">APIs & Documentation</span>
        </h1>
        <p className="text-base text-white/55 leading-relaxed max-w-2xl">
          Four composable ways to run Glintbase: connect the hosted MCP server to your AI coding agents,
          run the CLI in terminal and CI/CD, scaffold the 9 skills, or test live missions in the flight cockpit.
        </p>
      </motion.div>

      {/* Resource cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mb-16">
        {RESOURCES.map((resource, idx) => (
          <motion.div
            key={resource.id}
            {...fade}
            transition={{ duration: 0.5, delay: idx * 0.1 }}
            className="rounded-2xl border border-white/[0.08] bg-[#121214] p-6 sm:p-7 flex flex-col justify-between hover:border-white/20 transition-all shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden"
          >
            <div>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center border"
                  style={{
                    backgroundColor: `${resource.accent}15`,
                    borderColor: `${resource.accent}40`,
                    color: resource.accent,
                  }}
                >
                  {resource.icon}
                </div>
                <span className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-white/[0.05] border border-white/[0.08] text-white/60 uppercase tracking-wider">
                  {resource.bestFor}
                </span>
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-white mb-2">{resource.name}</h2>
              <p className="text-xs sm:text-sm text-white/55 leading-relaxed mb-5">{resource.pitch}</p>

              <div className="space-y-3">
                {resource.commands.map((cmd) => (
                  <CommandBlock
                    key={cmd.label}
                    code={cmd.code}
                    label={cmd.label}
                    language={cmd.language ?? "bash"}
                  />
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between">
              {resource.link.external ? (
                <a
                  href={resource.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-white/70 hover:text-white transition-colors"
                >
                  <span>{resource.link.label}</span>
                  <ArrowUpRight size={13} />
                </a>
              ) : (
                <Link
                  href={resource.link.href}
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-[#FF3300] hover:text-[#FF4411] transition-colors"
                >
                  <span>{resource.link.label}</span>
                  <ArrowRight size={13} />
                </Link>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Comparison table */}
      <section className="w-full rounded-2xl border border-white/[0.08] bg-[#121214] p-6 sm:p-8">
        <div className="mb-6">
          <span className="text-xs font-mono text-[#FF3300] uppercase tracking-wider block mb-1">Architecture Matrix</span>
          <h3 className="text-xl font-bold text-white">Compare Deployment Modalities</h3>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08] text-white/40">
                <th className="py-3 px-4 font-normal">Feature</th>
                <th className="py-3 px-4 font-normal text-white">Web Cockpit</th>
                <th className="py-3 px-4 font-normal text-[#22D3EE]">CLI Runner</th>
                <th className="py-3 px-4 font-normal text-[#FF3300]">MCP Server</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr
                  key={row.label}
                  className={`border-b border-white/[0.04] ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`}
                >
                  <td className="py-3.5 px-4 font-semibold text-white/70">{row.label}</td>
                  <td className="py-3.5 px-4 text-white/50">{row.web}</td>
                  <td className="py-3.5 px-4 text-white/50">{row.cli}</td>
                  <td className="py-3.5 px-4 text-white/80">{row.mcp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
