"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Copy, AlertTriangle, Share2, X, ExternalLink, Terminal, ShieldCheck, Trophy, Sparkles, ChevronDown, ChevronUp, FileText, Sun, Moon, ScanSearch } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { calculateScoreDimensions, ARS_VERSION, type ScoreDimension } from '@/lib/scanner/v2/scoring';
import { deriveCompany, scoreBand } from '@/lib/scanner/shared';
import dynamic from 'next/dynamic';

const ObsidianGraph3D = dynamic(() => import('./ObsidianGraph3D'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[500px] flex flex-col items-center justify-center text-[10px] font-mono text-white/30 bg-black rounded-xl border border-white/5 gap-2">
      <div className="w-4 h-4 rounded-full border border-white/20 border-t-[#FF3300] animate-spin"></div>
      Initializing WebGL Graph Engine...
    </div>
  ),
});

const JourneyPanel = dynamic(() => import('./JourneyPanel'), { ssr: false });

const CATEGORY_LABELS: Record<string, { label: string }> = {
  context: { label: 'Context Optimization' },
  code: { label: 'Code Block Execution' },
  machine: { label: 'Machine Readability' },
  agent: { label: 'Agent Tooling & MCP' },
};

const SURFACE_LABELS: Record<string, string> = {
  landing: 'Landing Page',
  docs: 'Documentation Root',
  api: 'API Reference',
  sdk: 'SDK Guidelines',
  github: 'GitHub Repository',
  support: 'Support Center',
  blog: 'Company Blog',
  changelog: 'Developer Changelog',
  status: 'Status Page',
  auth: 'Developer Auth',
  dashboard: 'App Dashboard',
  openapi: 'OpenAPI Schema',
  llms_txt: 'llms.txt Index',
  llms_full_txt: 'llms-full.txt Spec',
  sitemap: 'Sitemap Index',
  mcp: 'MCP Configuration'
};

const RECOMMENDATION_TITLES: Record<string, string> = {
  docs: 'Provide Documentation Root',
  api: 'Configure API Reference Link',
  sdk: 'Add SDK Integration Guides',
  github: 'Link GitHub Repository',
  support: 'Connect Support Center Link',
  status: 'Provide Status Page Link',
  auth: 'Bridge Developer Authentication Link',
  dashboard: 'Add Developer Dashboard Link',
  openapi: 'Publish OpenAPI Specification',
  llms_txt: 'Configure llms.txt AI Entrypoint',
  llms_full_txt: 'Consolidate llms-full.txt Spec',
  sitemap: 'Generate sitemap.xml',
  mcp: 'Expose MCP Server Tools'
};

function getScoreLabel(score: number) {
  const band = scoreBand(score);
  return {
    label: band.displayLabel,
    color: band.textClass,
    border: band.borderClass,
    glow: band.glowClass,
    key: band.key,
  };
}

const TYPE_BASE_WEIGHT: Record<string, number> = {
  canonical_link: 8, api: 7, operation: 6, sdk: 6, workflow: 6,
  machine_entrypoint: 5, concept: 4, prerequisite: 4,
  page: 3, support_path: 3, code_example: 2,
  unresolved_reference: 2, duplicate: 1,
};

export default function ResultsReport({ score, checks: rawChecks, scanId, url }: { score: number; checks: any; scanId?: string; url?: string }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(true);
  const [expandedDims, setExpandedDims] = useState<Record<number, boolean>>({});
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedFixes, setCopiedFixes] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);
  const [expandedPageUrl, setExpandedPageUrl] = useState<string | null>(null);

  const toggleDimension = (idx: number) => {
    setExpandedDims((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyMarkdownReport = () => {
    const reportText = generateMarkdownReport();
    navigator.clipboard.writeText(reportText);
    setReportCopied(true);
    setTimeout(() => setReportCopied(false), 2500);
  };

  const handleCopyProblems = () => {
    const text = `### Detected Problems Summary\n\n` + problems.map((p: any) => `- **${p.title}**: ${p.desc}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedId('problems-md');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopySolutions = () => {
    const text = `### Implementation remedies\n\n` + solutions.map((s: any) => `#### ${s.title}\n\n${s.prompt}`).join('\n\n');
    navigator.clipboard.writeText(text);
    setCopiedId('solutions-md');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyProblemSummaryPrompt = () => {
    const text = `We are missing critical developer ecosystem surfaces. Here is a summary of the problems:\n` + problems.map((p: any) => `- ${p.title}: ${p.desc}`).join('\n') + `\n\nPlease help us fix these issues.`;
    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const handleCopyFixesPrompt = () => {
    const text = `Here are the remediation instructions for making our product agent-native:\n` + solutions.map((s: any) => `### ${s.title}\n\n${s.prompt}`).join('\n\n') + `\n\nPlease implement these files and configure our repository accordingly.`;
    navigator.clipboard.writeText(text);
    setCopiedFixes(true);
    setTimeout(() => setCopiedFixes(false), 2000);
  };

  // Lift theme to <html> so the navbar, body bg, and ALL children respond
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'cream');
    return () => document.documentElement.removeAttribute('data-theme');
  }, [isDark]);

  const checks = useMemo(() => {
    return Array.isArray(rawChecks) ? rawChecks : (rawChecks?.surfaces || []);
  }, [rawChecks]);

  const pages = useMemo(() => {
    return Array.isArray(rawChecks) ? [] : (rawChecks?.pages || []);
  }, [rawChecks]);

  const framework = useMemo(() => {
    return Array.isArray(rawChecks) ? undefined : rawChecks?.framework;
  }, [rawChecks]);

  const graph = useMemo(() => {
    return Array.isArray(rawChecks) ? undefined : rawChecks?.graph;
  }, [rawChecks]);

  const journeys = useMemo(() => {
    return Array.isArray(rawChecks) ? undefined : rawChecks?.journeys;
  }, [rawChecks]);

  const forceGraphData = useMemo(() => {
    if (!graph || !graph.nodes || !graph.edges) {
      return { nodes: [], links: [] };
    }

    const formattedNodes = graph.nodes.map((n: any) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      weight: (n.weight ?? 0) + (TYPE_BASE_WEIGHT[n.type] ?? 2),
      metadata: n.url ? { url: n.url, type: n.type } : { type: n.type },
    }));

    const formattedLinks = graph.edges.map((e: any) => ({
      source: e.source,
      target: e.target,
      type: e.type,
    }));

    return { nodes: formattedNodes, links: formattedLinks };
  }, [graph]);

  const isV2 = checks.length > 0 && ('type' in checks[0] && 'found' in checks[0]);
  const { label, color, border, glow } = getScoreLabel(score);

  const companySlug = url ? deriveCompany(url).toLowerCase() : '';
  const shareUrl = companySlug
    ? `https://scan.glintbase.dev/scan/${companySlug}`
    : (scanId ? `https://scan.glintbase.dev/scan/${scanId}` : 'https://scan.glintbase.dev');

  const tweetText = isV2
    ? `Just ran an AI Agent Ecosystem Discovery via @glintbase 🤖\n\nAgent Readiness Index: ${score}/100 — ${label}\n\nCan Claude Code and Copilot operate your product?\nScan here:`
    : `Just ran an AI Agent Readiness Audit via @glintbase 🤖\n\nScore: ${score}/100 — ${label}\n\nCan Cursor, Claude Code, and Copilot understand your documentation?\nScan yours here:`;

  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`;
  const [linkCopied, setLinkCopied] = useState(false);
  
  const discoverablesList = useMemo(() => {
    if (isV2) {
      const discoverableTypes = [
        { type: 'sitemap', label: 'sitemap.xml Index' },
        { type: 'llms_txt', label: 'llms.txt Index' },
        { type: 'llms_full_txt', label: 'llms-full.txt Spec' },
        { type: 'openapi', label: 'OpenAPI Schema' },
        { type: 'mcp', label: 'MCP Configuration' },
        { type: 'github', label: 'GitHub Repository' },
        { type: 'docs', label: 'Documentation Root' },
        { type: 'api', label: 'API Reference' },
        { type: 'blog', label: 'Company Blog' },
        { type: 'auth', label: 'Developer Auth' },
        { type: 'dashboard', label: 'App Dashboard' },
        { type: 'changelog', label: 'Developer Changelog' },
        { type: 'status', label: 'Status Page' },
      ];
      return discoverableTypes.map(item => {
        const foundItem = checks.find((c: any) => c.type === item.type);
        return {
          type: item.type,
          label: item.label,
          found: foundItem ? foundItem.found : false,
          status: foundItem ? foundItem.status : 'missing',
        };
      });
    } else {
      return checks.map((c: any) => ({
        type: c.category,
        label: CATEGORY_LABELS[c.category]?.label || c.category,
        found: c.score === c.maxScore,
        status: c.score === c.maxScore ? 'verified' : 'missing',
      }));
    }
  }, [checks, isV2]);

  // SPEC-08 R1: journey checklist MUST use pathfinder traces, not surface presence
  const simulatedActions = useMemo(() => {
    if (journeys?.traces && Array.isArray(journeys.traces) && journeys.traces.length > 0) {
      return journeys.traces.map((t: any) => ({
        label: t.label || t.journey,
        passed: !!t.success,
        skipped: false,
        hops: t.hopCount,
        pressure: t.hallucinationPressure,
        status: t.status,
      }));
    }
    if (isV2) {
      // Legacy scans without journeys: honest empty state (no fake passes)
      return [];
    }
    return [
      { label: 'Parse docs layout', passed: checks.some((c: any) => c.category === 'context' && c.score > 0), skipped: false },
      { label: 'Extract code blocks', passed: checks.some((c: any) => c.category === 'code' && c.score > 0), skipped: false },
      { label: 'Resolve dependencies', passed: checks.some((c: any) => c.category === 'machine' && c.score > 0), skipped: false },
      { label: 'Execute tool calls', passed: checks.some((c: any) => c.category === 'agent' && c.score > 0), skipped: false },
    ];
  }, [checks, isV2, journeys]);

  const problems = useMemo(() => {
    if (isV2) {
      return checks.filter((s: any) => !s.found && s.status !== 'skipped').map((s: any) => ({
        title: SURFACE_LABELS[s.type] || s.type,
        desc: s.description,
        fix: s.fix
      }));
    } else {
      const list: any[] = [];
      checks.forEach((c: any) => {
        const failed = c.results?.filter((r: any) => !r.passed) || [];
        failed.forEach((r: any) => {
          list.push({
            title: r.label,
            desc: r.fix || 'Asset is missing, incomplete, or requires optimization.',
            fix: r.fix
          });
        });
      });
      return list;
    }
  }, [checks, isV2]);

  const solutions = useMemo(() => {
    if (isV2) {
      return checks.filter((s: any) => !s.found && s.status !== 'skipped' && s.fix).map((s: any) => ({
        title: RECOMMENDATION_TITLES[s.type] || `Implement ${s.type}`,
        prompt: s.fix
      }));
    } else {
      const list: any[] = [];
      checks.forEach((c: any) => {
        const failed = c.results?.filter((r: any) => !r.passed && r.fix) || [];
        failed.forEach((r: any) => {
          list.push({
            title: `Remedy for: ${r.label}`,
            prompt: r.fix
          });
        });
        if (c.fix && !c.results) {
          list.push({
            title: `General Remedy: ${CATEGORY_LABELS[c.category]?.label || c.category}`,
            prompt: c.fix
          });
        }
      });
      return list;
    }
  }, [checks, isV2]);

  const contextOverload = useMemo(() => {
    if (pages.length === 0) return 0;
    return pages.filter((p: any) => p.wordCount > 1500).length;
  }, [pages]);

  const locatingDifficulty = useMemo(() => {
    if (!graph || !graph.metrics) return 0;
    return (graph.metrics.islands * 10) + (graph.metrics.deadEnds * 8) + (graph.metrics.missingBridges * 12);
  }, [graph]);

  const scoreVersion =
    (!Array.isArray(rawChecks) && rawChecks?.score_version) ||
    (!Array.isArray(rawChecks) && rawChecks?.meta?.score_version) ||
    ARS_VERSION;

  const dimensionScores: ScoreDimension[] = useMemo(() => {
    // Prefer server-computed ARS dimensions from scan payload
    if (!Array.isArray(rawChecks) && Array.isArray(rawChecks?.dimensions) && rawChecks.dimensions.length > 0) {
      return rawChecks.dimensions as ScoreDimension[];
    }
    return calculateScoreDimensions(checks, pages, graph, journeys);
  }, [rawChecks, checks, pages, graph, journeys]);

  const generateMarkdownReport = () => {
    const current_date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    if (isV2) {
      let report = `# AI Agent Readiness & Ecosystem Diagnostic Report\n\n`;
      report += `**Product Landing Page URL:** ${url || 'Scanned URL'}\n`;
      report += `**Agent Readiness Index:** ${score}/100\n`;
      report += `**Ecosystem Rating:** ${tierText}\n`;
      report += `**Scan ID:** ${scanId || 'N/A'}\n`;
      report += `**Generated On:** ${current_date}\n\n`;
      report += `---\n\n`;

      report += `## 📊 Executive Summary\n\n`;
      report += `This report assesses the machine-readability, searchability, and traversal efficiency of your developer platform for autonomous AI coding agents (such as Cursor, Claude Code, and GitHub Copilot). \n\n`;
      if (score >= 90) {
        report += `**Verdict:** Your ecosystem is **Elite (Agent-Native)**. AI agents can confidently crawl, parse, authenticate, and execute integrations with minimal context window bloating and near-zero hallucination risks.\n`;
      } else if (score >= 70) {
        report += `**Verdict:** Your ecosystem is **AI-Friendly**. Most surface specifications are discoverable, but agents may encounter minor navigation stalls or require inference in complex flows. Some optimizations are required to reach the Elite tier.\n`;
      } else if (score >= 40) {
        report += `**Verdict:** Your ecosystem is **AI-Capable**. AI agents can discover some basic routes but will suffer from severe link fragmentation, high hop counts, and high hallucination risk when performing multi-step integrations.\n`;
      } else {
        report += `**Verdict:** Your ecosystem is **Legacy**. The documentation structure is effectively invisible or highly unreadable to AI agents. Core specifications, OpenAPI schemas, or machine entrypoints are missing.\n`;
      }
      report += `\n---\n\n`;

      report += `## 🧭 Diagnostic Dimension Breakdown\n\n`;
      report += `| Dimension | Score | Description | Key Observations |\n`;
      report += `| :--- | :---: | :--- | :--- |\n`;
      dimensionScores.forEach((d) => {
        report += `| **${d.name}** | ${d.score} / ${d.maxScore} | ${d.description} | ${d.observations.join('; ')} |\n`;
      });
      report += `\n---\n\n`;

      report += `## 🌐 Product Surface Inventory\n\n`;
      report += `| Surface Type | Status | Canonical URL | Surface Description |\n`;
      report += `| :--- | :--- | :--- | :--- |\n`;
      checks.forEach((s: any) => {
        const labelStr = SURFACE_LABELS[s.type] || s.type;
        const statusStr = s.status === 'skipped' ? '⚠️ Skipped' : s.found ? '✅ Active' : '❌ Missing';
        report += `| **${labelStr}** | ${statusStr} | \`${s.url || 'None'}\` | ${s.description} |\n`;
      });
      report += `\n---\n\n`;

      if (journeys && journeys.traces && journeys.traces.length > 0) {
        report += `## Agent Journey Pathfinder (Deterministic)\n\n`;
        report += `We ran a deterministic multi-start pathfinder across the knowledge graph (not LLM free-form reasoning) for common integration workflows.\n\n`;
        report += `- **Overall Journey Completion Rate:** ${journeys.overallCompletionRate}%\n`;
        report += `- **Average Traversal Depth:** ${journeys.avgHopCount.toFixed(1)} hops\n`;
        report += `- **Average Search Fragmentation:** ${journeys.avgFragmentationScore.toFixed(1)} / 5.0\n\n`;

        report += `### Journey Results Summary Table\n\n`;
        report += `| Journey Workflow | Status | Traversal Cost (Hops) | Token Waste Estimate | Hallucination Pressure |\n`;
        report += `| :--- | :---: | :---: | :---: | :---: |\n`;
        journeys.traces.forEach((t: any) => {
          const statusStr = t.success ? '✅ PASSED' : t.status === 'partial' ? '⚠️ PARTIAL' : '❌ FAILED';
          report += `| **${t.label}** | ${statusStr} | ${t.hopCount} hops | ${(t.cost?.tokenWasteEstimate || 'unknown').toUpperCase()} | ${(t.hallucinationPressure || 'unknown').toUpperCase()} |\n`;
        });
        report += `\n`;

        const issuesList = journeys.traces.filter((t: any) => !t.success || (t.cost?.inferencePoints ?? 0) > 0 || t.hallucinationPressure === 'high' || t.hallucinationPressure === 'medium');
        if (issuesList.length > 0) {
          report += `### 🔍 Detailed Failures & Hallucination Points Breakdown\n\n`;
          report += `The following journeys encountered structural bottlenecks, empty links, or high inference stress. Implement the specific fixes below to establish clear agent pathways:\n\n`;

          issuesList.forEach((t: any) => {
            const statusStr = t.success ? 'PASSED WITH INFERENCE STRESS' : t.status === 'partial' ? 'PARTIAL SUCCESS' : 'FAILED';
            report += `#### 🛑 Journey: ${t.label} (${statusStr})\n`;
            report += `- **Goal:** ${t.goal}\n`;
            report += `- **Start Surface:** \`${t.startSurface}\`\n`;
            if (t.breakpoint) {
              report += `- **Observed Breakpoint:** \`${t.breakpoint.type}\` at node **"${t.breakpoint.surface || 'Unknown Surface'}"**\n`;
              report += `- **Breakpoint Reason:** *${t.breakpoint.reason}*\n`;
            }
            report += `\n**🛠️ Actionable Remediation Plan:**\n`;
            
            if (t.breakpoint) {
              switch (t.breakpoint.type) {
                case 'dead_end':
                  report += `1. **Configure Reciprocal Navigation:** The agent reached a dead-end on **"${t.breakpoint.surface}"** with no further links. Add a "Next Steps" or "Related Tasks" section on this page's bottom linking to the next logical concept (e.g., credentials page or SDK setup guide).\n`;
                  report += `2. **Link Onboarding Pathways:** Ensure this page links to relevant API schemas or code samples to keep the agent moving forward.\n`;
                  break;
                case 'unresolved_reference':
                  report += `1. **Repair Broken Links:** The agent encountered a dead or missing link at **"${t.breakpoint.surface}"**. Verify that the relative/absolute link paths are valid (avoid local file references or dead HTTP links).\n`;
                  report += `2. **Sync Site Map:** Prune outdated links from your \`sitemap.xml\` that point to deleted or renamed resource routes.\n`;
                  break;
                case 'max_hops_exceeded':
                  report += `1. **Shorten Search Pathways (Token Saving):** The agent took ${t.hopCount} hops without reaching the goal, wasting substantial context window space. Expose a direct shortcut or quick link on the documentation homepage or within your \`/llms.txt\` file.\n`;
                  report += `2. **Flatten Hierarchy:** Group related guides together so agents don't have to navigate through deeply nested menus.\n`;
                  break;
                case 'inference_required':
                  report += `1. **Enhance Semantic Context:** The agent had to guess next steps repeatedly due to vague link text. Avoid using generic link anchors like "click here" or "next". Use explicit labels like "Retrieve API Keys" or "Configure Webhooks".\n`;
                  report += `2. **Optimize Title Tags:** Ensure every page has a unique, descriptive \`<h1>\` and title tag summarizing its exact developer purpose.\n`;
                  break;
                case 'no_start_node':
                  report += `1. **Define a Clear Entrance:** The agent could not find a starting node. Ensure your main landing page has a visible link to the developer docs root.\n`;
                  report += `2. **Publish /llms.txt:** Put a \`/llms.txt\` file in your website root to provide a single, discoverable catalog of documentation.\n`;
                  break;
                default:
                  report += `1. **Ecosystem Realignment:** Add clear, logical navigation linking your main developer surfaces. Ensure links use HTTPS and resolve within 2-3 seconds to prevent timeouts.\n`;
              }
            } else if (t.cost?.inferencePoints > 0) {
              report += `1. **Semantic Navigation:** The agent completed the journey but had to guess at ${t.cost.inferencePoints} step(s). Add clear descriptive links to prevent hallucination.\n`;
            }
            report += `\n`;
          });
        }
        report += `---\n\n`;
      }

      report += `## 🔋 Context Window & Token Efficiency Guidelines\n\n`;
      report += `AI agents operate within strict context window constraints. Inefficient documentation structures inflate API costs and latency, and cause task execution failure due to context truncation. Optimize your site structure using these token-saving rules:\n\n`;
      
      const avgHops = journeys?.avgHopCount ?? 0;
      const fragmentation = journeys?.avgFragmentationScore ?? 0.0;
      
      report += `### 1. Hop Minimization\n`;
      report += `- **Your Current Avg Hops:** ${avgHops.toFixed(1)} hops\n`;
      if (avgHops > 4.5) {
        report += `- **Priority: HIGH.** Your hop count is elevated. Because each page hop forces the agent to append new context and issue a new search command, it wastes thousands of tokens. Create direct shortcuts for core tasks (Setup, Auth, API, SDK) on your root docs page and in \`/llms.txt\`.\n\n`;
      } else {
        report += `- **Priority: LOW.** Your hop count is optimal. Keep documentation paths compact and links direct.\n\n`;
      }

      report += `### 2. Conceptual Fragmentation\n`;
      report += `- **Your Current Fragmentation Score:** ${fragmentation.toFixed(1)} / 5.0\n`;
      if (fragmentation > 2.0) {
        report += `- **Priority: HIGH.** High fragmentation forces agents to make multi-hop vector lookups to stitch related concepts together. Consolidate small, single-paragraph pages into unified guides (e.g. combine credentials and authentication rules on one page) to enable agents to resolve goals in a single lookup.\n\n`;
      } else {
        report += `- **Priority: LOW.** Topic fragmentation is low. Maintain this cohesion by nesting detailed sub-configs inside primary guides.\n\n`;
      }

      report += `### 3. Expose /llms.txt and /llms-full.txt\n`;
      report += `- **Problem:** Standard documentation frameworks (Docusaurus, Mintlify, GitBook) inject massive HTML sidebars, header blocks, script tags, and footer noise. When parsed by agents, this noise consumes up to 80% of context window space.\n`;
      report += `- **Solution:** Expose a clean Markdown catalog at \`/llms.txt\` and compile your entire documentation database into a single, clean text file at \`/llms-full.txt\`. Strip all HTML boilerplates and navigation trees to save up to 90% in token overhead.\n\n`;
      
      report += `### 4. Compress OpenAPI Specifications\n`;
      report += `- **Problem:** Large OpenAPI specs (exceeding 50 endpoints) can easily consume over 100k tokens, bloating agent context windows.\n`;
      report += `- **Solution:** Provide a lightweight summary OpenAPI schema (e.g., \`openapi-summary.json\`) containing only primary routes and request/response parameters, omitting large description fields and duplicate definitions.\n\n`;
      
      report += `---\n\n`;

      if (pages.length > 0) {
        report += `## 📑 Crawled Knowledge Base Corpus\n\n`;
        report += `| Page Title | Crawled URL | Word Count | Code Blocks |\n`;
        report += `| :--- | :--- | :---: | :---: |\n`;
        pages.forEach((p: any) => {
          report += `| [${p.title}](${p.url}) | \`${p.url}\` | ${p.wordCount} words | ${p.codeBlocks?.length || 0} blocks |\n`;
        });
        report += `\n---\n\n`;
      }

      report += `## 🛠️ Actionable AI Prompts for Auto-Generation & Fixes\n\n`;
      report += `*Copy and paste the prompts below directly into Cursor, Claude Code, or Copilot to automatically create the missing resources for your codebase.*\n\n`;

      let hasFixes = false;
      checks.forEach((s: any) => {
        if (!s.found && s.fix) {
          hasFixes = true;
          const recTitle = RECOMMENDATION_TITLES[s.type] || `Implement ${s.type}`;
          report += `### 📝 Fix: ${recTitle}\n`;
          report += `\`\`\`text\n${s.fix}\n\`\`\`\n\n`;
        }
      });

      if (!hasFixes) {
        report += `All critical ecosystem surfaces are active! Your product is 100% Agent-Native. 🎉\n\n`;
      }

      report += `*Report generated by [Glintbase Scanner](https://scan.glintbase.dev) - Infrastructure for AI-agent-ready repositories and documentation.*`;
      return report;
    } else {
      let report = `# AI Agent Readiness Report\n\n`;
      report += `**Repository / Documentation URL:** ${url || 'Scanned URL'}\n`;
      report += `**Agent Readiness Score:** ${score}/100\n`;
      report += `**Scan ID:** ${scanId || 'N/A'}\n\n`;
      report += `---\n\n`;
      report += `## 📊 Category Breakdown\n\n`;

      checks.forEach((check: any) => {
        const meta = CATEGORY_LABELS[check.category] || { label: check.category };
        report += `- **${meta.label}**: ${check.score} / ${check.maxScore}\n`;
      });

      report += `\n---\n\n`;
      report += `## 🚨 Detected Problems (Audit Summary)\n\n`;

      let hasProblems = false;
      checks.forEach((check: any) => {
        const failedChecks = check.results?.filter((r: any) => !r.passed) || [];
        const hasCategoryIssue = check.score < check.maxScore && (!check.results || failedChecks.length > 0 || check.warning || check.fix);

        if (hasCategoryIssue) {
          hasProblems = true;
          const meta = CATEGORY_LABELS[check.category] || { label: check.category };
          report += `### ${meta.label} (Deducted: ${check.maxScore - check.score} pts)\n`;

          if (check.results) {
            failedChecks.forEach((r: any) => {
              report += `- **Issue:** ${r.label}\n`;
              report += `  **Details:** AI agent parser flagged incomplete states or missing files.\n`;
            });
          } else {
            report += `- **Issue:** General category optimization required.\n`;
          }
          report += '\n';
        }
      });

      if (!hasProblems) {
        report += `No problems detected! Your repository is 100% Agent-Native. 🎉\n\n`;
      }

      report += `---\n\n`;
      report += `## 🛠️ Actionable Implementation & Fix Prompts for Your AI Agent\n\n`;

      let hasFixes = false;
      checks.forEach((check: any) => {
        const failedChecks = check.results?.filter((r: any) => !r.passed && r.fix) || [];
        const hasCategoryFix = check.score < check.maxScore && (failedChecks.length > 0 || check.fix);

        if (hasCategoryFix) {
          hasFixes = true;
          const meta = CATEGORY_LABELS[check.category] || { label: check.category };
          report += `### ${meta.label} Remedies\n\n`;

          if (check.fix && !check.results) {
            report += `#### General Remedy Prompt:\n`;
            report += `\`\`\`text\n${check.fix}\n\`\`\`\n\n`;
          }

          failedChecks.forEach((r: any) => {
            report += `#### Fix Prompt for: ${r.label}\n`;
            report += `\`\`\`text\n${r.fix}\n\`\`\`\n\n`;
          });
        }
      });

      if (!hasFixes) {
        report += `All audits passed. No implementation remedies required.\n\n`;
      }

      report += `*Report generated by [Glintbase Scanner](https://scan.glintbase.dev) - Infrastructure for AI-agent-ready repositories and documentation.*`;
      return report;
    }
  };

  const handleDownloadMarkdown = () => {
    const reportText = generateMarkdownReport();
    const blob = new Blob([reportText], { type: 'text/markdown;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    
    let domainName = 'ecosystem';
    try {
      if (url) {
        domainName = new URL(url).hostname.replace(/^www\./, '');
      }
    } catch {}
    
    link.setAttribute('download', `glintbase-readiness-${domainName}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const bandInfo = scoreBand(score);
  const tierText = bandInfo.displayLabel.toUpperCase();
  const tierColor = bandInfo.textClass;

  return (
    <>
      <div className="w-full max-w-full overflow-x-hidden animate-fade-in px-2 sm:px-4 md:px-8 max-w-7xl mx-auto mt-4 sm:mt-8 mb-16 space-y-6" data-theme={isDark ? 'dark' : 'cream'}>

        {/* ——— Dashboard Header ——— */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-white/5 pb-5 gap-4">
          <div className="space-y-1">
            <div className="text-[9px] font-mono uppercase tracking-[0.35em] text-white/30">
              Ecosystem Discovery Analysis / {url ? new URL(url).hostname : 'Scanned Surface'}
            </div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tight font-mono">
              Agent-Readiness Index Report
            </h1>
            <p className="text-[9px] font-mono text-white/25 mt-1">
              score_version: {scoreVersion} ·{' '}
              <a
                href="https://github.com/glintbase/glintscanner/blob/main/docs/methodology/ars-1.0.md"
                target="_blank"
                rel="noreferrer"
                className="text-white/40 hover:text-[#FF3300] underline underline-offset-2"
              >
                ARS methodology
              </a>
            </p>
          </div>

          {/* Top Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-black bg-[#FF3300] hover:bg-[#e62e00] border border-[#FF3300] rounded px-3 py-1.5 transition-all font-mono shadow-[0_0_14px_rgba(255,51,0,0.35)] hover:shadow-[0_0_20px_rgba(255,51,0,0.55)]"
            >
              <ScanSearch size={11} />
              New Scan
            </a>

            <div className="w-px h-4 bg-white/10 mx-0.5" />

            {/* Export Markdown Button */}
            <button
              onClick={handleDownloadMarkdown}
              className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-white border border-white/10 bg-white/[0.02] hover:bg-white/10 rounded px-3 py-1.5 transition-all font-mono cursor-pointer"
            >
              <FileText size={11} />
              Export Markdown
            </button>


            <div className="w-px h-4 bg-white/10 mx-0.5" />

            {/* Share X */}
            <a
              href={tweetUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-white/40 hover:text-white border border-white/5 bg-white/[0.01] hover:bg-white/5 rounded px-3 py-1.5 transition-all font-mono"
            >
              Share X
            </a>
            <button
              onClick={() => { navigator.clipboard.writeText(shareUrl); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
              className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-white/40 hover:text-white border border-white/5 bg-white/[0.01] hover:bg-white/5 rounded px-3 py-1.5 transition-all font-mono cursor-pointer"
            >
              {linkCopied ? 'Copied URL!' : 'Copy Link'}
            </button>

            <div className="w-px h-4 bg-white/10 mx-0.5" />

            {/* Light / Dark toggle */}
            <button
              onClick={() => setIsDark(d => !d)}
              title={isDark ? 'Switch to cream light mode' : 'Switch to dark mode'}
              className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider border rounded px-3 py-1.5 transition-all font-mono cursor-pointer select-none"
              style={isDark
                ? { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.01)' }
                : { color: '#7a6040', borderColor: 'rgba(120,80,20,0.25)', background: 'rgba(250,240,220,0.6)' }
              }
            >
              {isDark ? <Sun size={11} /> : <Moon size={11} />}
              {isDark ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>

        {/* ——— HERO DASHBOARD ——— */}
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch border border-white/[0.06] rounded-2xl overflow-hidden glint-card">
            <div className="relative flex flex-col items-center justify-center px-6 py-6 sm:px-10 sm:py-10 bg-black min-w-full lg:min-w-[200px] border-b lg:border-b-0 lg:border-r border-white/[0.06]">
              <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 50%, ${score >= 90 ? 'rgba(255,51,0,0.10)' : score >= 70 ? 'rgba(34,211,238,0.08)' : score >= 40 ? 'rgba(139,92,246,0.08)' : 'rgba(255,51,0,0.06)'} 0%, transparent 70%)` }} />
              <motion.div className={`text-6xl sm:text-7xl lg:text-[88px] leading-none font-black font-mono tracking-tighter ${tierColor}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
                {score}
              </motion.div>
              <div className="text-[9px] font-mono font-bold tracking-[0.3em] text-white/25 uppercase mt-1">/ 100</div>
              <div className={`mt-3 text-[9px] font-mono font-bold tracking-widest uppercase px-2.5 py-1 rounded border ${score >= 90 ? 'text-[#FF3300] border-[#FF3300]/30 bg-[#FF3300]/[0.08]' : score >= 70 ? 'text-[#22D3EE] border-[#22D3EE]/30 bg-[#22D3EE]/[0.08]' : score >= 40 ? 'text-[#8B5CF6] border-[#8B5CF6]/30 bg-[#8B5CF6]/[0.08]' : 'text-[#FF3300]/70 border-[#FF3300]/20 bg-[#FF3300]/[0.05]'}`}>{tierText}</div>
            </div>

            <div className="flex flex-col justify-center px-5 py-6 sm:px-8 sm:py-8 flex-1 bg-black border-b lg:border-b-0 lg:border-r border-white/[0.06]">
              <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-white/25 mb-2">{isV2 ? 'Agent Ecosystem Discovery' : 'AI Readiness Audit'}</div>
              <div className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight font-mono leading-none break-all">
                {url ? (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })() : 'Scanned Surface'}
              </div>
              <div className="mt-3 text-[11px] sm:text-[12px] text-white/45 leading-relaxed max-w-md">
                {isV2
                  ? score >= 90 ? 'Elite developer ecosystem. Fully optimized for machine ingestion, OpenAPI parsing, and MCP orchestration.'
                  : score >= 70 ? 'AI-ready surfaces with complete discovery paths. Minor updates needed to reach elite index.'
                  : score >= 40 ? 'Partial exploration capabilities. Lacks critical schemas or machine-indexing entrypoints.'
                  : 'Invisible to AI agents. No discoverable entrypoints, sitemaps, or structured schemas present.'
                  : score >= 76 ? 'AI-friendly documentation structure with clear directories and native syntax formatting.'
                  : score >= 41 ? 'Parseable but suboptimal. Tends to consume large prompt contexts.'
                  : 'Invisible to AI agents. High context noise, missing schemas, or empty resource pools.'}
              </div>
              {framework && (
                <div className="mt-4 inline-flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider">
                  <span className="text-white/25">Framework</span>
                  <span className="text-indigo-400 font-bold border border-indigo-400/20 bg-indigo-400/[0.05] px-2 py-0.5 rounded">{framework}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 lg:flex lg:flex-col justify-center min-w-full lg:min-w-[180px] bg-black divide-x lg:divide-x-0 lg:divide-y divide-white/[0.05]">
              <div className="px-3 sm:px-6 py-4 sm:py-5 text-center lg:text-left">
                <div className="text-[8px] font-mono uppercase tracking-widest text-white/25 mb-1 truncate">Surfaces</div>
                <div className="flex items-baseline justify-center lg:justify-start gap-1">
                  <span className="text-2xl sm:text-3xl font-black font-mono text-[#FF3300]">{discoverablesList.filter((d: any) => d.found).length}</span>
                  <span className="text-[10px] font-mono text-white/30">/{discoverablesList.length}</span>
                </div>
              </div>
              <div className="px-3 sm:px-6 py-4 sm:py-5 text-center lg:text-left">
                <div className="text-[8px] font-mono uppercase tracking-widest text-white/25 mb-1 truncate">Large Pages</div>
                <div className="flex items-baseline justify-center lg:justify-start gap-1">
                  <span className="text-2xl sm:text-3xl font-black font-mono text-[#22D3EE]">{contextOverload}</span>
                  <span className="text-[10px] font-mono text-white/30">pgs</span>
                </div>
              </div>
              <div className="px-3 sm:px-6 py-4 sm:py-5 text-center lg:text-left">
                <div className="text-[8px] font-mono uppercase tracking-widest text-white/25 mb-1 truncate">Nav Gap</div>
                <div className="flex items-baseline justify-center lg:justify-start gap-1">
                  <span className={`text-2xl sm:text-3xl font-black font-mono ${locatingDifficulty > 40 ? 'text-[#FF3300]' : 'text-[#8B5CF6]'}`}>{locatingDifficulty}</span>
                  <span className="text-[10px] font-mono text-white/30">pts</span>
                </div>
              </div>
            </div>
          </div>

          {/* Surface inventory */}
          <div className="border border-white/[0.06] rounded-2xl overflow-hidden glint-card">
            <div className="bg-black px-5 py-3 border-b border-white/[0.05] flex items-center justify-between">
              <span className="text-[8px] font-mono uppercase tracking-[0.3em] text-white/25">Surface Inventory</span>
              <span className="text-[8px] font-mono text-white/25">{discoverablesList.filter((d: any) => d.found).length} of {discoverablesList.length} active</span>
            </div>
            <div className="bg-black grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
              {discoverablesList.map((item: any, idx: number) => {
                const isSkipped = item.status === 'skipped';
                return (
                  <div key={idx} className="flex items-center gap-4 px-5 py-4 border-b border-white/[0.04] sm:border-r sm:border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <div className={`text-2xl font-black font-mono w-8 text-center flex-shrink-0 ${isSkipped ? 'text-white/10' : item.found ? 'text-[#FF3300]' : 'text-white/15'}`}>
                      {isSkipped ? '–' : item.found ? '✓' : '–'}
                    </div>
                    <div className="min-w-0">
                      <div className={`text-[12px] font-bold ${isSkipped ? 'text-white/25 font-normal' : item.found ? 'text-white/85' : 'text-white/35'}`}>{item.label}</div>
                      <div className={`text-[9px] font-mono uppercase tracking-wider mt-0.5 ${isSkipped ? 'text-white/20' : item.found ? 'text-[#FF3300]/55' : 'text-white/20'}`}>
                        {isSkipped ? 'SKIPPED' : item.found ? 'ACTIVE' : 'MISSING'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agent pathfinder journeys (SPEC-08: driven by journeys.traces only) */}
          <div className="border border-white/[0.06] rounded-2xl overflow-hidden glint-card">
            <div className="bg-black px-5 py-3 border-b border-white/[0.05] flex items-center justify-between">
              <span className="text-[8px] font-mono uppercase tracking-[0.3em] text-white/25">Agent Journey Pathfinder (Deterministic)</span>
              <span className="text-[8px] font-mono text-white/25">
                {simulatedActions.length > 0
                  ? `${simulatedActions.filter((a: any) => a.passed).length}/${simulatedActions.length} passed`
                  : 'No traces'}
              </span>
            </div>
            {simulatedActions.length === 0 ? (
              <div className="bg-black px-5 py-8 text-center text-[10px] font-mono text-white/30">
                No journey traces available for this scan. Re-run the scan to generate pathfinder results.
              </div>
            ) : (
              <div className="bg-black grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {simulatedActions.map((action: any, idx: number) => (
                  <div
                    key={idx}
                    className={`flex flex-col items-center justify-center py-6 px-3 text-center gap-2 hover:bg-white/[0.02] transition-colors border-white/[0.05]
                      border-b
                      ${idx % 2 === 0 ? 'border-r' : ''}
                      ${idx % 3 !== 2 ? 'md:border-r' : 'md:border-r-0'}
                      ${idx % 4 !== 3 ? 'lg:border-r' : 'lg:border-r-0'}
                    `}
                  >
                    <div className={`text-2xl font-black font-mono ${action.skipped ? 'text-white/10' : action.passed ? 'text-[#FF3300]' : 'text-white/15'}`}>
                      {action.skipped ? '–' : action.passed ? '●' : '○'}
                    </div>
                    <div className={`text-[9px] font-mono leading-tight ${action.skipped ? 'text-white/20 line-through' : action.passed ? 'text-white/65' : 'text-white/25'}`}>
                      {action.label}
                    </div>
                    {typeof action.hops === 'number' && (
                      <div className="text-[8px] font-mono text-white/20">{action.hops} hops</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ecosystem Diagnostic Dimensions Breakdown */}
          {isV2 && (
            <div className="border border-white/[0.06] rounded-2xl overflow-hidden glint-card">
              <div className="bg-black px-5 py-3 border-b border-white/[0.05] flex items-center justify-between">
                <span className="text-[8px] font-mono uppercase tracking-[0.3em] text-white/25">Ecosystem Diagnostic Dimensions</span>
                <span className="text-[8px] font-mono text-white/25">Click cards to expand/collapse details</span>
              </div>
              <div className="bg-black p-3 sm:p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 items-start">
                {dimensionScores.map((dim, idx) => {
                  const isExpanded = !!expandedDims[idx];
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleDimension(idx)}
                      className="flex flex-col p-3 sm:p-4 rounded-xl border border-white/[0.03] bg-white/[0.01] hover:bg-white/[0.02] transition-all cursor-pointer select-none h-fit w-full min-w-0 max-w-full overflow-hidden"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5 font-mono">
                          <span className="text-[10px] font-black text-white/80 uppercase tracking-wider truncate mr-2" title={dim.name}>
                            {dim.name}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-bold text-[#FF3300]">{dim.score}/{dim.maxScore}</span>
                            {isExpanded ? <ChevronUp size={12} className="text-white/40" /> : <ChevronDown size={12} className="text-white/40" />}
                          </div>
                        </div>
                        
                        {/* Progress bar */}
                        <div className="w-full h-1 bg-white/[0.04] rounded-full overflow-hidden mb-2">
                          <div className="h-full bg-[#FF3300] rounded-full transition-all duration-500" style={{ width: `${(dim.score / dim.maxScore) * 100}%` }} />
                        </div>
                      </div>

                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden mt-2"
                          >
                            <p className="text-[9px] text-white/40 leading-normal mb-3">{dim.description}</p>
                            
                            <div className="space-y-1.5 border-t border-white/[0.04] pt-2.5">
                              {dim.observations.map((obs, oIdx) => (
                                <div key={oIdx} className="flex items-start gap-1.5 text-[8px] font-mono text-white/30 leading-normal">
                                  <span className="text-[#FF3300] flex-shrink-0">•</span>
                                  <span>{obs}</span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* ———— BOTTOM GRID (Problems, Solutions, Audit Items) ———— */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* PROBLEMS CARD */}
          <div className="bg-black border border-white/5 rounded-2xl p-6 flex flex-col justify-between overflow-hidden relative glint-card">
            <div className="space-y-4">
              <div className="border-b border-white/5 pb-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Problems</h3>
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 custom-scrollbar text-[11px]">
                {problems.length > 0 ? (
                  problems.map((prob: any, idx: number) => (
                    <div key={idx} className="bg-black/20 p-3 rounded-xl border border-white/[0.03] space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-white/80 uppercase tracking-wider text-[10px]">
                        <span className="text-rose-500">●</span> {prob.title}
                      </div>
                      <p className="text-white/40 leading-relaxed font-sans">{prob.desc}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-white/30 italic font-mono">No problems detected! 🎉</div>
                )}
              </div>
            </div>

            <button
              onClick={handleCopyProblems}
              className="w-full mt-4 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white font-mono text-[9px] font-bold uppercase tracking-widest py-2.5 rounded-lg border border-white/5 transition-colors cursor-pointer"
            >
              {copiedId === 'problems-md' ? 'Copied Problems Markdown!' : 'Copy Problems Markdown'}
            </button>
          </div>

          {/* SOLUTIONS CARD */}
          <div className="bg-black border border-white/5 rounded-2xl p-6 flex flex-col justify-between overflow-hidden relative glint-card">
            <div className="space-y-4">
              <div className="border-b border-white/5 pb-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Solutions</h3>
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 custom-scrollbar text-[11px]">
                {solutions.length > 0 ? (
                  solutions.map((sol: any, idx: number) => (
                    <div key={idx} className="bg-black/20 p-3 rounded-xl border border-white/[0.03] space-y-1">
                      <div className="font-bold text-white/80 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                        <span className="text-emerald-400">●</span> {sol.title}
                      </div>
                      <div className="bg-black border border-white/5 rounded p-2 relative max-h-24 overflow-y-auto mt-1">
                        <pre className="text-[9px] font-mono text-white/40 whitespace-pre-wrap">{sol.prompt}</pre>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-white/30 italic font-mono">All optimized. No remediation needed.</div>
                )}
              </div>
            </div>

            <button
              onClick={handleCopySolutions}
              className="w-full mt-4 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white font-mono text-[9px] font-bold uppercase tracking-widest py-2.5 rounded-lg border border-white/5 transition-colors cursor-pointer"
            >
              {copiedId === 'solutions-md' ? 'Copied Solutions Markdown!' : 'Copy Solutions Markdown'}
            </button>
          </div>

          {/* AUDIT ITEMS */}
          <div className="bg-black border border-white/5 rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden glint-card md:col-span-2 lg:col-span-1">
            <div className="space-y-4">
              <div className="border-b border-white/5 pb-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Audit Items</h3>
              </div>

              <div className="space-y-4 text-[11px]">

                {/* Problem Summary Copy Prompt */}
                <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-2">
                  <div className="font-bold text-white/80 uppercase tracking-wider text-[9px] font-mono">Problem Summary Prompt</div>
                  <p className="text-white/40 leading-relaxed font-sans">
                    Copy a compressed diagnostic summary of missing entrypoints to share with your team or feeding to LLM pipelines.
                  </p>
                  <button
                    onClick={handleCopyProblemSummaryPrompt}
                    className="w-full bg-[#FF3300]/10 hover:bg-[#FF3300]/20 text-[#FF3300] hover:text-white font-mono text-[9px] font-bold uppercase tracking-widest py-2 rounded border border-[#FF3300]/20 transition-all cursor-pointer"
                  >
                    {copiedSummary ? 'Copied Summary Prompt!' : 'Copy Summary Prompt'}
                  </button>
                </div>

                {/* Fixes / Solutions Copy Prompt */}
                <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-2">
                  <div className="font-bold text-white/80 uppercase tracking-wider text-[9px] font-mono">Fixes / Solutions Prompt</div>
                  <p className="text-white/40 leading-relaxed font-sans">
                    Copy complete implementations and config files to copy-paste directly into Cursor, Claude Code, or Copilot.
                  </p>
                  <button
                    onClick={handleCopyFixesPrompt}
                    className="w-full bg-[#22D3EE]/10 hover:bg-[#22D3EE]/20 text-[#22D3EE] hover:text-white font-mono text-[9px] font-bold uppercase tracking-widest py-2 rounded border border-[#22D3EE]/20 transition-all cursor-pointer"
                  >
                    {copiedFixes ? 'Copied Remedies Prompt!' : 'Copy Remedies Prompt'}
                  </button>
                </div>

              </div>
            </div>

            {/* Copy main report */}
            <button
              onClick={handleCopyMarkdownReport}
              className="w-full mt-4 bg-gradient-to-r from-[#FF3300]/10 to-[#8B5CF6]/10 hover:from-[#FF3300]/20 hover:to-[#8B5CF6]/20 text-white font-mono text-[9px] font-bold uppercase tracking-widest py-2.5 rounded-lg border border-white/5 transition-all cursor-pointer"
            >
              {reportCopied ? 'Report Copied!' : 'Copy Full Markdown Report'}
            </button>
          </div>

        </div>

        {/* ———— CRAWLED PAGES ACCORDION EXPLORER ———— */}
        {pages.length > 0 && (
          <div className="bg-black border border-white/5 rounded-2xl p-6 space-y-4 glint-card">
            <div className="border-b border-white/5 pb-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Extracted Knowledge Base</h3>
            </div>
            <div className="space-y-3">
              {pages.map((page: any, pIdx: number) => {
                const isExpanded = expandedPageUrl === page.url;
                return (
                  <div key={page.url} className="border border-white/5 bg-black/25 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedPageUrl(isExpanded ? null : page.url)}
                      className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <FileText size={16} className="text-[#22D3EE] shrink-0" />
                        <div className="min-w-0">
                          <h4 className="font-bold text-xs text-white uppercase tracking-wider truncate">{page.title}</h4>
                          <p className="text-[9px] text-white/35 font-mono truncate">{page.url}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-[10px] font-mono text-white/30 text-right">
                          <div>{page.wordCount} words</div>
                          <div>{page.codeBlocks?.length || 0} code blocks</div>
                        </div>
                        {isExpanded ? <ChevronUp size={16} className="text-white/40" /> : <ChevronDown size={16} className="text-white/40" />}
                      </div>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="border-t border-white/5 bg-black/40 overflow-hidden"
                        >
                          <div className="p-4 space-y-4">
                            {page.headings?.length > 0 && (
                              <div className="space-y-1.5">
                                <h5 className="text-[9px] font-mono font-bold text-[#FF3300] uppercase tracking-wider">Discovered Headings</h5>
                                <div className="flex flex-wrap gap-2">
                                  {page.headings.map((h: string, hIdx: number) => (
                                    <span key={hIdx} className="text-[10px] font-sans text-white/50 bg-white/5 border border-white/[0.03] rounded-md px-2 py-0.5">
                                      {h}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {page.codeBlocks?.length > 0 ? (
                              <div className="space-y-3">
                                <h5 className="text-[9px] font-mono font-bold text-[#FF3300] uppercase tracking-wider">Extracted Code Blocks</h5>
                                <div className="space-y-2">
                                  {page.codeBlocks.map((b: any, bIdx: number) => (
                                    <div key={bIdx} className="relative rounded-lg border border-white/5 bg-black overflow-hidden group">
                                      <div className="bg-white/5 px-3 py-1 flex items-center justify-between border-b border-white/5 text-[9px] font-mono text-white/40 uppercase">
                                        <span>{b.lang || 'text'}</span>
                                        <button
                                          onClick={() => handleCopy(b.code, `code-${pIdx}-${bIdx}`)}
                                          className="hover:text-white transition-colors"
                                        >
                                          {copiedId === `code-${pIdx}-${bIdx}` ? 'Copied' : 'Copy'}
                                        </button>
                                      </div>
                                      <pre className="p-3 text-[10px] font-mono text-white/60 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-40">
                                        {b.code}
                                      </pre>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="text-[10px] font-mono text-white/20 italic">No code blocks extracted on this page.</div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ———— KNOWLEDGE GRAPH VISUALIZER ———— */}
        {graph && (
          <div className="bg-black border border-white/5 rounded-2xl p-6 space-y-6 glint-card">
            <div className="border-b border-white/5 pb-4 flex items-center justify-between">
              <div>
                <h3 className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Graph Map Overview</h3>
                <h2 className="text-xl font-black text-white uppercase tracking-tighter mt-1">Knowledge Graph</h2>
              </div>
              <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/20 uppercase tracking-wider">
                {graph.nodes.length} Nodes • {graph.edges.length} Edges
              </span>
            </div>

            {/* Knowledge Graph Visualizer component */}
            <div className="space-y-2">
              <ObsidianGraph3D
                data={forceGraphData}
                isDark={isDark}
                onNodeClick={(nodeId) => {
                  const fmtNode = forceGraphData.nodes.find((n: any) => n.id === nodeId);
                  const nodeUrl = (fmtNode?.metadata as any)?.url;
                  if (nodeUrl) {
                    window.open(nodeUrl, '_blank');
                  }
                }}
              />
            </div>

            {/* Directed Graph Connection Map */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Ecosystem Connection Logs</h4>
              <div className="max-h-60 overflow-y-auto border border-white/5 rounded-xl bg-black/40 p-4 space-y-2.5 font-mono text-[10px] custom-scrollbar">
                {graph.edges.map((edge: any, edgeIdx: number) => {
                  const srcNode = graph.nodes.find((n: any) => n.id === edge.source);
                  const destNode = graph.nodes.find((n: any) => n.id === edge.target);
                  if (!srcNode || !destNode) return null;

                  const edgeLabel =
                    edge.type === 'page_references_page' ? '👉 REFERENCES' :
                      edge.type === 'concept_depends_on_concept' ? '🔗 DEPENDS ON' :
                        edge.type === 'workflow_depends_on_prerequisite' ? '⚠️ PREREQUISITE' :
                          edge.type === 'api_maps_to_sdk_example' ? '🔗 MAPS TO' :
                            edge.type === 'docs_entrypoint_connects_to_onboarding' ? '🚥 LEADS TO' :
                              edge.type === 'support_path_resolves_error_path' ? '🛠️ RESOLVES' :
                                '👉 LINKS';

                  const typeColors: Record<string, string> = {
                    page: 'text-[#8B5CF6]',
                    concept: 'text-[#22D3EE]',
                    api: 'text-[#FF3300]',
                    sdk: 'text-[#FF3300]',
                    workflow: 'text-[#22D3EE]',
                    prerequisite: 'text-[#8B5CF6]',
                    code_example: 'text-[#22D3EE]',
                    machine_entrypoint: 'text-[#22D3EE]',
                    support_path: 'text-white/40',
                    canonical_link: 'text-[#FF3300]',
                    duplicate: 'text-white/20',
                    unresolved_reference: 'text-[#FF3300] font-bold'
                  };

                  return (
                    <div key={edgeIdx} className="flex items-center gap-2 py-1 border-b border-white/[0.02] last:border-b-0">
                      <span className={typeColors[srcNode.type] || 'text-white'}>
                        {srcNode.label}
                      </span>
                      <span className="text-white/20 text-[9px]">{edgeLabel}</span>
                      <span className={typeColors[destNode.type] || 'text-white'}>
                        {destNode.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ———— Phase 6: Agent Journey Simulation Panel ———— */}
        {journeys && journeys.traces && journeys.traces.length > 0 && (
          <JourneyPanel journeys={journeys} />
        )}

      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body, html, main, #__next {
            background: #ffffff !important;
            color: #000000 !important;
          }
          nav, footer, button, a[href="/"], .fixed, .obsidian-controls, .absolute.right-0.mt-1\\.5 {
            display: none !important;
          }
          .glint-card {
            border: 1px solid rgba(0, 0, 0, 0.15) !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            margin-bottom: 20px !important;
            page-break-inside: avoid;
          }
          .text-white {
            color: #000000 !important;
          }
          .text-white\\/40, .text-white\\/30, .text-white\\/25, .text-white\\/45 {
            color: #444444 !important;
          }
          .bg-black {
            background: #ffffff !important;
          }
          .text-\\[\\#FF3300\\], .text-\\[\\#FF3300\\]\\/55 {
            color: #cc2900 !important;
          }
        }
      `}} />
    </>
  );
}

