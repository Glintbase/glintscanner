"use client";

import React, { useState } from 'react';
import { Copy, Check, Terminal, ExternalLink } from 'lucide-react';
import type { JourneyInsight } from '@/lib/scanner/simulator/types';

interface JourneyInsightSectionProps {
  insight?: JourneyInsight;
}

export default function JourneyInsightSection({ insight }: JourneyInsightSectionProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const defaultSummary =
    "Agent successfully identified all supported authentication methods (API key via X-API-Key header, OAuth via MCP, and Bearer token for MCP headless), obtained credential sources, retrieved working code examples, and documented MCP server integrations—all from site documentation. The site required targeted exploratory probing since the apex domain returned minimal guidance; once documentation pages were reached, navigation was straightforward.";

  const defaultBullets = [
    '> Main domain required exploratory hops; agent discovered documentation portal at docs subdomain containing complete authentication and code documentation.',
    '> Step [6] (quickstart) provided the three-step async pattern and code examples in Python, TypeScript, and cURL—the core of the final answer.',
    '> Step [10] (concepts/authentication) confirmed API key as the sole REST method and documented 401/403 error semantics.',
    '> Step [11] (MCP) revealed OAuth and Bearer token methods not visible in REST API docs—an additional auth path specific to AI agent integration.',
    '> Site publishes OpenAPI spec and agent skills as integration alternatives; no native language SDKs (npm/PyPI) exist. Agent correctly noted this absence.',
  ];

  const summary = insight?.summary || defaultSummary;
  const bullets = insight?.bulletPoints?.length ? insight.bulletPoints : defaultBullets;
  const remediations = insight?.remediations || [];

  const handleCopy = (id: string, text: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="w-full bg-[#121214] border border-white/[0.08] rounded-xl p-6 md:p-8 space-y-6">
      {/* Section Header */}
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">
        INSIGHT
      </div>

      {/* Narrative Synthesis Paragraph */}
      <p className="text-stone-200 font-mono text-xs md:text-sm leading-relaxed">
        {summary}
      </p>

      {/* Bulleted Intelligence Breakdown */}
      <div className="space-y-3 pt-2">
        {bullets.map((bullet, idx) => (
          <div
            key={idx}
            className="text-stone-300 font-mono text-xs leading-relaxed flex items-start gap-2"
          >
            <span className="text-stone-400 shrink-0 select-none">&gt;</span>
            <span>{bullet.replace(/^>\s*/, '')}</span>
          </div>
        ))}
      </div>

      {/* Glintbase Descriptive Remediation Section */}
      {remediations.length > 0 && (
        <div className="pt-6 border-t border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              RECOMMENDED AGENTIC REMEDIATIONS ({remediations.length})
            </span>
            <span className="text-[10px] font-mono text-stone-400">
              MANUAL FIX & OPTIONAL AUTOMATION
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {remediations.map((rem) => {
              const isCopied = copiedId === rem.id;
              const cliCmd = rem.fixCommand.startsWith('npx ') ? rem.fixCommand : `npx ${rem.fixCommand}`;
              const defaultManual = rem.id.includes('llms')
                ? 'Create a static markdown file at public/llms.txt with an H1 title, summary of your platform, and bulleted links to key documentation sections (/docs/quickstart, /docs/api). This enables agents to ingest your documentation in ~400 tokens instead of 30,000+ HTML tokens.'
                : rem.id.includes('openapi')
                ? 'Export your REST API routes to an OpenAPI 3.1 JSON schema at public/openapi.json (or add a route handler). Declare valid endpoint paths, parameters, and response schemas so AI coding agents can generate type-safe tool calls.'
                : rem.id.includes('auth')
                ? 'Create public/.well-known/auth.md specifying your API key header formats (e.g. Authorization: Bearer <KEY>), token generation URLs, and error semantics so agents can authenticate autonomously.'
                : 'Configure this declaration directly in your repository to resolve agent discovery friction.';

              const manualText = rem.manualInstruction || defaultManual;

              return (
                <div
                  key={rem.id}
                  className="bg-[#18181B] border border-white/[0.08] hover:border-white/[0.16] rounded-xl p-5 space-y-3 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-bold text-white tracking-wide">
                        {rem.title}
                      </span>
                      {rem.targetFile && (
                        <code className="text-[10px] font-mono text-[#FF3300] bg-[#FF3300]/10 border border-[#FF3300]/20 px-2 py-0.5 rounded shrink-0">
                          {rem.targetFile}
                        </code>
                      )}
                    </div>

                    <p className="text-[11px] font-sans text-stone-300 leading-relaxed">
                      {rem.description}
                    </p>

                    {/* Classic Manual Technical Instruction Fix */}
                    <div className="bg-black/40 rounded-lg p-3 border border-white/[0.05] space-y-1">
                      <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-stone-400">
                        Classic Manual Fix:
                      </div>
                      <p className="text-[11px] font-mono text-stone-200 leading-relaxed">
                        {manualText}
                      </p>
                    </div>
                  </div>

                  {/* Subtle, non-distracting CLI Automation Hint */}
                  <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[10px] font-mono text-stone-400">
                    <div className="flex items-center gap-1.5 truncate mr-2">
                      <span className="text-amber-400">💡</span>
                      <span className="text-stone-500">CLI Shortcut:</span>
                      <code className="text-stone-300 bg-white/[0.04] px-1.5 py-0.5 rounded truncate">
                        {cliCmd}
                      </code>
                    </div>
                    <button
                      onClick={() => handleCopy(rem.id, cliCmd)}
                      title="Copy CLI command"
                      className="p-1.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-stone-300 hover:text-white transition cursor-pointer shrink-0"
                    >
                      {isCopied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Discreet CLI Installation Note */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[11px] font-mono text-stone-400">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-stone-400" />
              <span>Don't have the Glintbase CLI installed? You can install it globally via:</span>
              <code className="text-white bg-black/40 px-1.5 py-0.5 rounded border border-white/[0.08]">
                npm i -g glintbase
              </code>
            </div>
            <button
              onClick={() => handleCopy('cli-install', 'npm i -g glintbase')}
              className="text-[10px] text-stone-400 hover:text-white flex items-center gap-1 transition cursor-pointer px-2 py-0.5 rounded hover:bg-white/[0.06]"
            >
              {copiedId === 'cli-install' ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
