"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Terminal, Boxes, Sparkles, Search, ArrowUpRight, Check } from "lucide-react";
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
    name: "MCP Server",
    icon: <Boxes size={22} />,
    accent: "#FF3300",
    bestFor: "In-editor, interactive",
    pitch:
      "Zero-config scanner tools your coding agent drives directly. No API keys, no .env — the agent reasons over the results.",
    commands: [
      {
        label: ".mcp.json",
        language: "json",
        code: `{
  "mcpServers": {
    "glintbase": {
      "command": "npx",
      "args": ["-y", "@glintbase/mcp"]
    }
  }
}`,
      },
    ],
    link: { href: "/mcp", label: "Open the MCP gateway" },
  },
  {
    id: "cli",
    name: "CLI",
    icon: <Terminal size={22} />,
    accent: "#22D3EE",
    bestFor: "CI gates & scripts",
    pitch:
      "Beautiful terminal output, JSON/Markdown reports, and exit codes for CI. Bring your own model (cloud or local).",
    commands: [
      {
        label: "Install & scan",
        language: "bash",
        code: `npm install -g @glintbase/cli
glintbase scan https://docs.example.com`,
      },
      {
        label: "CI gate",
        language: "bash",
        code: `npx @glintbase/cli scan https://docs.example.com --fail-under 70 --quiet`,
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
    name: "Agent Skill",
    icon: <Sparkles size={22} />,
    accent: "#8B5CF6",
    bestFor: "Agent playbook",
    pitch:
      "Teach any coding agent when and how to use Glintbase — the golden tool sequence, score interpretation, and MCP-vs-CLI guidance.",
    commands: [
      {
        label: "Install the skill",
        language: "bash",
        code: `# Claude Code
cp -r skills/glintbase-agent-readiness ~/.claude/skills/

# Qoder / .agents
cp -r skills/glintbase-agent-readiness .agents/skills/`,
      },
    ],
    link: {
      href: "https://github.com/glintbase/glintscanner/tree/main/skills",
      label: "Browse the skill",
      external: true,
    },
  },
];

const COMPARISON: { label: string; web: string; cli: string; mcp: string }[] = [
  { label: "Best for", web: "Hosted one-click, sharing", cli: "Local runs + CI gates", mcp: "Driving from a coding agent" },
  { label: "Setup", web: "None (hosted)", cli: "npm i -g, optional wizard", mcp: "Zero-config, no keys" },
  { label: "Journey engine", web: "Deterministic; LLM harness on deep", cli: "Deterministic; --agent opts in", mcp: "Always deterministic (agent reasons)" },
  { label: "LLM provider", web: "Hosted (Google)", cli: "Yours (cloud or local)", mcp: "None — the agent's own" },
  { label: "Extraction", web: "Raw + Firecrawl", cli: "Raw + Firecrawl", mcp: "Raw + zero-dep deep_crawl" },
  { label: "Output", web: "Interactive UI, badge", cli: "Terminal, JSON/MD, exit codes", mcp: "Structured JSON per tool" },
];

const fade = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
};

export function ResourceHub() {
  return (
    <main className="flex-1 flex flex-col items-center pt-32 pb-20 px-4 w-full">
      {/* Hero */}
      <motion.div
        {...fade}
        transition={{ duration: 0.6 }}
        className="flex flex-col items-center text-center mb-14 max-w-2xl"
      >
        <div className="text-[10px] font-mono text-[#FF3300] uppercase tracking-[0.4em] mb-4">
          Developer Tools
        </div>
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4 text-white">
          Ship agent-ready docs
        </h1>
        <p className="text-sm md:text-base text-white/40 leading-relaxed">
          The same Glintbase scanner core, three ways to run it. Install the MCP server for
          in-editor audits, the CLI for CI gates, or the agent skill to teach your coding agent
          the whole workflow.
        </p>
      </motion.div>

      {/* Resource cards */}
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-6">
        {RESOURCES.map((r, i) => (
          <motion.div
            key={r.id}
            {...fade}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.08 }}
            className="glint-card rounded-2xl bg-white/[0.01] p-6 flex flex-col gap-5"
          >
            <div className="flex items-center justify-between">
              <div
                className="h-11 w-11 rounded-xl flex items-center justify-center"
                style={{ color: r.accent, backgroundColor: `${r.accent}1A` }}
              >
                {r.icon}
              </div>
              <span className="text-[9px] font-mono uppercase tracking-widest text-white/30 border border-white/10 rounded-full px-2.5 py-1">
                {r.bestFor}
              </span>
            </div>

            <div>
              <h2 className="text-lg font-black uppercase tracking-wide text-white">{r.name}</h2>
              <p className="mt-2 text-xs text-white/45 leading-relaxed">{r.pitch}</p>
            </div>

            <div className="flex flex-col gap-3 mt-auto">
              {r.commands.map((c) => (
                <CommandBlock key={c.label} code={c.code} label={c.label} language={c.language} />
              ))}
            </div>

            {r.link.external ? (
              <a
                href={r.link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest transition-colors hover:text-white"
                style={{ color: r.accent }}
              >
                {r.link.label} <ArrowUpRight size={13} />
              </a>
            ) : (
              <Link
                href={r.link.href}
                className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest transition-colors hover:text-white"
                style={{ color: r.accent }}
              >
                {r.link.label} <ArrowUpRight size={13} />
              </Link>
            )}
          </motion.div>
        ))}
      </div>

      {/* Comparison table */}
      <motion.div
        {...fade}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="w-full max-w-5xl mt-16"
      >
        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white/40 mb-4 text-center">
          Which should I use?
        </h3>
        <div className="overflow-x-auto no-scrollbar rounded-2xl border border-white/5">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="bg-white/[0.02]">
                <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-white/30"></th>
                <th className="p-4 text-[11px] font-black uppercase tracking-wider text-white">Web</th>
                <th className="p-4 text-[11px] font-black uppercase tracking-wider text-[#22D3EE]">CLI</th>
                <th className="p-4 text-[11px] font-black uppercase tracking-wider text-[#FF3300]">MCP</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label} className="border-t border-white/5">
                  <td className="p-4 text-[10px] font-mono uppercase tracking-widest text-white/30 whitespace-nowrap">
                    {row.label}
                  </td>
                  <td className="p-4 text-xs text-white/55">{row.web}</td>
                  <td className="p-4 text-xs text-white/55">{row.cli}</td>
                  <td className="p-4 text-xs text-white/55">{row.mcp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* CTA */}
      <div className="mt-16 flex flex-col sm:flex-row items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-[#FF3300] text-white font-black text-xs uppercase tracking-[0.25em] px-8 py-4 rounded-xl shadow-[0_0_30px_rgba(255,51,0,0.3)] hover:shadow-[0_0_40px_rgba(255,51,0,0.5)] hover:bg-[#FF3300]/90 transition-all"
        >
          <Search size={14} />
          Scan Your Ecosystem
        </Link>
        <Link
          href="/mcp"
          className="inline-flex items-center gap-2 border border-white/10 text-white/70 font-black text-xs uppercase tracking-[0.25em] px-8 py-4 rounded-xl hover:border-white/25 hover:text-white transition-all"
        >
          <Check size={14} />
          MCP Gateway
        </Link>
      </div>
    </main>
  );
}

export default ResourceHub;
