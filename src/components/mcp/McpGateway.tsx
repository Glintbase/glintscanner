"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Boxes, Search, Zap, KeyRound, Cloud, ArrowUpRight } from "lucide-react";
import { CommandBlock } from "../tools/CommandBlock";

interface ClientConfig {
  id: string;
  label: string;
  filename: string;
  code: string;
}

const CLIENTS: ClientConfig[] = [
  {
    id: "claude",
    label: "Claude Code",
    filename: ".mcp.json",
    code: `{
  "mcpServers": {
    "glintbase": {
      "command": "npx",
      "args": ["-y", "@glintbase/mcp"]
    }
  }
}`,
  },
  {
    id: "cursor",
    label: "Cursor",
    filename: "~/.cursor/mcp.json",
    code: `{
  "mcpServers": {
    "glintbase": {
      "command": "npx",
      "args": ["-y", "@glintbase/mcp"]
    }
  }
}`,
  },
  {
    id: "windsurf",
    label: "Windsurf",
    filename: "~/.codeium/windsurf/mcp_config.json",
    code: `{
  "mcpServers": {
    "glintbase": {
      "command": "npx",
      "args": ["-y", "@glintbase/mcp"]
    }
  }
}`,
  },
  {
    id: "opencode",
    label: "OpenCode",
    filename: "opencode.json",
    code: `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "glintbase": {
      "type": "local",
      "command": ["npx", "-y", "@glintbase/mcp"],
      "enabled": true
    }
  }
}`,
  },
];

const TOOLS: { name: string; desc: string }[] = [
  { name: "discover_surfaces", desc: "Find all machine-readable entrypoints (llms.txt, OpenAPI, MCP, docs, ...)" },
  { name: "check_reachability", desc: "Quick single-URL reachability + soft-404 detection" },
  { name: "parse_spec", desc: "Parse OpenAPI / llms.txt / MCP configs without crawling" },
  { name: "crawl_pages", desc: "Budgeted crawl with priority queue (quick/deep profiles)" },
  { name: "deep_crawl", desc: "In-depth crawl that recovers JS-rendered content — no API key" },
  { name: "build_knowledge_graph", desc: "Semantic graph from crawled pages" },
  { name: "run_journeys", desc: "Deterministic agent journey simulations (no LLM)" },
  { name: "score_readiness", desc: "Full pipeline → composite ARS score (auto-runs missing stages)" },
  { name: "get_remediation", desc: "Prioritized fixes with templates and expected score impact" },
];

const fade = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
};

export function McpGateway() {
  const [active, setActive] = useState(CLIENTS[0].id);
  const activeClient = CLIENTS.find((c) => c.id === active) ?? CLIENTS[0];

  return (
    <main className="flex-1 flex flex-col items-center pt-32 pb-20 px-4 w-full">
      {/* Hero */}
      <motion.div {...fade} transition={{ duration: 0.6 }} className="flex flex-col items-center text-center mb-14 max-w-2xl">
        <div className="h-14 w-14 rounded-2xl bg-[#FF3300]/10 text-[#FF3300] flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(255,51,0,0.25)]">
          <Boxes size={26} />
        </div>
        <div className="text-[10px] font-mono text-[#FF3300] uppercase tracking-[0.4em] mb-4">
          @glintbase/mcp
        </div>
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4 text-white">
          The Glintbase MCP
        </h1>
        <p className="text-sm md:text-base text-white/40 leading-relaxed">
          Zero-config agent-readiness tools for AI coding agents. No API keys, no <code className="font-mono text-white/60">.env</code> —
          your agent calls the tools and reasons over the results with its own subscription.
        </p>
      </motion.div>

      {/* Config tabs */}
      <motion.div {...fade} transition={{ duration: 0.5, delay: 0.1 }} className="w-full max-w-2xl">
        <div className="flex items-center gap-2 mb-4 flex-wrap justify-center">
          {CLIENTS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActive(c.id)}
              className={`text-[10px] font-black uppercase tracking-widest px-3.5 py-2 rounded-lg border transition-all ${
                active === c.id
                  ? "border-[#FF3300]/50 text-white bg-[#FF3300]/10"
                  : "border-white/10 text-white/40 hover:text-white hover:border-white/25"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <CommandBlock code={activeClient.code} label={activeClient.filename} language="json" />
        {activeClient.id === "opencode" && (
          <p className="mt-3 text-[11px] text-white/35 leading-relaxed">
            Connection closing? If the package is not yet published to npm, point <code className="font-mono text-white/55">command</code>{" "}
            at an absolute path to the built server instead, e.g.{" "}
            <code className="font-mono text-white/55">[&quot;node&quot;, &quot;/abs/path/glintscanner/mcp/dist/index.js&quot;]</code>.
          </p>
        )}
      </motion.div>

      {/* Zero-key deep_crawl story */}
      <motion.div {...fade} transition={{ duration: 0.5, delay: 0.15 }} className="w-full max-w-2xl mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glint-card rounded-2xl bg-white/[0.01] p-5">
          <div className="flex items-center gap-2 text-[#FF3300] mb-2">
            <Zap size={16} />
            <span className="text-[11px] font-black uppercase tracking-widest">Zero-key deep_crawl</span>
          </div>
          <p className="text-xs text-white/45 leading-relaxed">
            JS-rendered docs (Next.js, Docusaurus, SPAs) return an empty shell over raw HTTP. The{" "}
            <code className="font-mono text-white/60">deep_crawl</code> tool recovers the real content from embedded
            framework payloads (<code className="font-mono text-white/60">__NEXT_DATA__</code>, RSC flight chunks, JSON-LD,{" "}
            <code className="font-mono text-white/60">&lt;noscript&gt;</code>) — no API key.
          </p>
        </div>
        <div className="glint-card rounded-2xl bg-white/[0.01] p-5">
          <div className="flex items-center gap-2 text-[#22D3EE] mb-2">
            <KeyRound size={16} />
            <span className="text-[11px] font-black uppercase tracking-widest">Optional Firecrawl</span>
          </div>
          <p className="text-xs text-white/45 leading-relaxed">
            For the hardest SPAs, add{" "}
            <code className="font-mono text-white/60">&quot;env&quot;: &#123; &quot;FIRECRAWL_API_KEY&quot;: &quot;fc-...&quot; &#125;</code>{" "}
            to the config and pass <code className="font-mono text-white/60">profile: &quot;deep&quot;</code> for premium extraction.
            Not required.
          </p>
        </div>
      </motion.div>

      {/* Golden path */}
      <motion.div {...fade} transition={{ duration: 0.5, delay: 0.2 }} className="w-full max-w-2xl mt-6">
        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white/40 mb-3">The golden path</h3>
        <CommandBlock
          label="Agent tool sequence"
          language="text"
          code={`discover_surfaces  ->  deep_crawl  ->  score_readiness  ->  get_remediation`}
        />
        <p className="mt-3 text-[11px] text-white/35 leading-relaxed">
          Run <code className="font-mono text-white/55">deep_crawl</code> before{" "}
          <code className="font-mono text-white/55">score_readiness</code> for JS-heavy sites — it populates the session so
          scoring reuses the recovered pages instead of re-crawling a thin shell.
        </p>
      </motion.div>

      {/* Tool catalog */}
      <motion.div {...fade} transition={{ duration: 0.5, delay: 0.25 }} className="w-full max-w-3xl mt-16">
        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white/40 mb-4 text-center">
          9 composable tools
        </h3>
        <div className="rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden">
          {TOOLS.map((t) => (
            <div key={t.name} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 p-4 hover:bg-white/[0.02] transition-colors">
              <code className="text-[12px] font-mono font-bold text-[#FF3300] sm:w-52 shrink-0">{t.name}</code>
              <span className="text-xs text-white/50 leading-relaxed">{t.desc}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Phase 2 teaser */}
      <motion.div {...fade} transition={{ duration: 0.5, delay: 0.3 }} className="w-full max-w-3xl mt-8">
        <div className="relative rounded-2xl overflow-hidden border border-[#8B5CF6]/25 bg-gradient-to-br from-[#8B5CF6]/10 via-black to-black p-6">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,0.12),transparent_60%)] pointer-events-none" />
          <div className="relative flex items-start gap-4">
            <div className="h-11 w-11 rounded-xl bg-[#8B5CF6]/15 text-[#8B5CF6] flex items-center justify-center shrink-0">
              <Cloud size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <h4 className="text-sm font-black uppercase tracking-wide text-white">Hosted remote MCP</h4>
                <span className="text-[9px] font-mono uppercase tracking-widest text-[#8B5CF6] border border-[#8B5CF6]/30 rounded-full px-2 py-0.5">
                  Coming soon
                </span>
              </div>
              <p className="text-xs text-white/45 leading-relaxed">
                Connect your agent to Glintbase in one line — no install. A hosted Streamable-HTTP endpoint at{" "}
                <code className="font-mono text-white/60">scan.glintbase.dev/mcp</code>, gated behind an API key and rate limits.
                Until then, the <code className="font-mono text-white/60">npx</code> setup above is the way in.
              </p>
            </div>
          </div>
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
          href="/tools"
          className="inline-flex items-center gap-2 border border-white/10 text-white/70 font-black text-xs uppercase tracking-[0.25em] px-8 py-4 rounded-xl hover:border-white/25 hover:text-white transition-all"
        >
          All tools <ArrowUpRight size={14} />
        </Link>
      </div>
    </main>
  );
}

export default McpGateway;
