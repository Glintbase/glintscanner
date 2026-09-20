"use client";

import { CheckCircle2, XCircle, Copy, AlertTriangle, Share2, X, ExternalLink, Terminal, ShieldCheck, Trophy, Sparkles, ChevronDown, ChevronUp, FileText, Sun, Moon, ScanSearch, Play, Check, Zap } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { calculateScoreDimensions, ARS_VERSION, type ScoreDimension } from '@/lib/scanner/v2/scoring';
import { deriveCompany, deriveCompanySlug, scoreBand, getArsGrade } from '@/lib/scanner/shared';
import dynamic from 'next/dynamic';

import MachineTopologyMap from './MachineTopologyMap';

const CATEGORY_LABELS: Record<string, { label: string }> = {
  context: { label: 'Context Optimization' },
  code: { label: 'Code Block Execution' },
  machine: { label: 'Machine Readability' },
  agent: { label: 'Agent Tooling & MCP' },
};
const ARS3_LAYER_LABELS: Record<string, string> = {
  discovery: 'Layer 1: Discovery',
  access: 'Layer 2: Access & Understanding',
  usability: 'Layer 3: Usability & Interoperability',
  payments: 'Layer 4: Payments & Commerce',
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
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
  const [copiedCliAudit, setCopiedCliAudit] = useState(false);
  const [copiedMcpServe, setCopiedMcpServe] = useState(false);

  useEffect(() => {
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'cream');
    }
    return () => {
      document.documentElement.removeAttribute('data-theme');
    };
  }, [isDark]);

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

  const ars3Scorecard = useMemo(() => {
    if (!Array.isArray(rawChecks) && rawChecks?.scorecard) {
      return rawChecks.scorecard;
    }
    return null;
  }, [rawChecks]);

  const archetype = useMemo(() => {
    if (!Array.isArray(rawChecks)) {
      return rawChecks?.archetype || rawChecks?.scorecard?.archetype || null;
    }
    return null;
  }, [rawChecks]);

  const arsGrade = useMemo(() => {
    if (!Array.isArray(rawChecks) && rawChecks?.grade) {
      return rawChecks.grade;
    }
    return getArsGrade(score).grade;
  }, [rawChecks, score]);

  const soft404Detected = useMemo(() => {
    if (ars3Scorecard?.layers?.access?.checks) {
      return ars3Scorecard.layers.access.checks.some(
        (c: any) => c.checkId === 'anti-spa-404-canary' && c.status === 'fail'
      );
    }
    if (pages && pages.some((p: any) => p.fetchStatus === 'soft_404')) {
      return true;
    }
    return false;
  }, [ars3Scorecard, pages]);

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
  const bandInfo = scoreBand(score);
  const tierText = bandInfo.displayLabel.toUpperCase();
  const tierColor = bandInfo.textClass;

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

  const problems = useMemo(() => {
    // 1. ARS 3.0 Scorecard checks (Primary)
    if (ars3Scorecard) {
      const allResults: any[] = ars3Scorecard.results?.length
        ? ars3Scorecard.results
        : [
            ...(ars3Scorecard.layers?.discovery?.checks || []),
            ...(ars3Scorecard.layers?.access?.checks || []),
            ...(ars3Scorecard.layers?.usability?.checks || []),
            ...(ars3Scorecard.layers?.payments?.checks || []),
          ];

      const failedOrWarned = allResults.filter(
        (c: any) => c.status === 'fail' || c.status === 'warn'
      );

      if (failedOrWarned.length > 0) {
        return failedOrWarned.map((c: any) => {
          const layerKey = c.layer || (
            c.checkId?.startsWith('robots') || c.checkId?.startsWith('ard') || c.checkId?.startsWith('ai-cat') || c.checkId?.startsWith('registry') ? 'discovery' :
            c.checkId?.startsWith('llms') || c.checkId?.startsWith('anti-spa') || c.checkId?.startsWith('content') || c.checkId?.startsWith('zero-js') || c.checkId?.startsWith('openapi') ? 'access' :
            c.checkId?.startsWith('mcp') || c.checkId?.startsWith('auth') || c.checkId?.startsWith('rate-limit') ? 'usability' :
            'payments'
          );

          return {
            id: c.checkId,
            title: c.name || c.remediation?.title || c.checkId,
            desc: c.message || 'Check failed or requires optimization.',
            layer: layerKey,
            layerLabel: ARS3_LAYER_LABELS[layerKey] || layerKey,
            severity: c.status === 'fail' ? 'critical' : 'warning',
            status: c.status,
            earnedPoints: c.earnedPoints ?? 0,
            maxPoints: c.maxPoints ?? 0,
            targetFile: c.remediation?.file,
            fix: c.remediation?.fixCommand || c.remediation?.title,
            mcpPrompt: c.remediation?.mcpPrompt,
            diffSnippet: c.remediation?.diffSnippet ? (Array.isArray(c.remediation.diffSnippet) ? c.remediation.diffSnippet.join('\n') : c.remediation.diffSnippet) : undefined,
          };
        });
      }
    }

    // 2. Legacy V2 Surfaces Fallback
    if (isV2) {
      return checks.filter((s: any) => !s.found && s.status !== 'skipped').map((s: any) => ({
        title: SURFACE_LABELS[s.type] || s.type,
        desc: s.description,
        fix: s.fix,
        layer: 'surfaces',
        layerLabel: 'Ecosystem Surface',
        severity: 'critical',
      }));
    } else {
      const list: any[] = [];
      checks.forEach((c: any) => {
        const failed = c.results?.filter((r: any) => !r.passed) || [];
        failed.forEach((r: any) => {
          list.push({
            title: r.label,
            desc: r.fix || 'Asset is missing, incomplete, or requires optimization.',
            fix: r.fix,
            layer: c.category || 'legacy',
            layerLabel: CATEGORY_LABELS[c.category]?.label || c.category || 'Legacy Audit',
            severity: 'critical',
          });
        });
      });
      return list;
    }
  }, [ars3Scorecard, checks, isV2]);

  const solutions = useMemo(() => {
    // 1. ARS 3.0 Scorecard Remediations (Primary)
    if (ars3Scorecard) {
      const list: any[] = [];
      const seenIds = new Set<string>();

      // A. Explicit remediations array on scorecard
      if (Array.isArray(ars3Scorecard.remediations) && ars3Scorecard.remediations.length > 0) {
        for (const r of ars3Scorecard.remediations) {
          const key = r.id || r.title;
          if (!r.title || seenIds.has(key)) continue;
          seenIds.add(key);

          let promptContent = r.mcpPrompt;
          if (!promptContent) {
            if (r.diffSnippet) {
              promptContent = `Target File: ${r.targetFile || 'Configuration'}\n${r.fixCommand ? `Command: ${r.fixCommand}\n\n` : ''}${r.diffSnippet}`;
            } else if (r.fixCommand) {
              promptContent = `${r.description || r.title}\n\nRun CLI remediation:\n${r.fixCommand}`;
            } else {
              promptContent = r.description || `Implement remediation for ${r.title}`;
            }
          }

          list.push({
            id: r.id,
            title: r.title,
            layer: r.layer,
            layerLabel: ARS3_LAYER_LABELS[r.layer] || r.layer,
            targetFile: r.targetFile,
            fixCommand: r.fixCommand,
            diffSnippet: r.diffSnippet,
            prompt: promptContent,
            severity: r.severity || 'high',
          });
        }
      }

      // B. Supplement with any failed check with remediation not yet in list
      const allResults: any[] = ars3Scorecard.results?.length
        ? ars3Scorecard.results
        : [
            ...(ars3Scorecard.layers?.discovery?.checks || []),
            ...(ars3Scorecard.layers?.access?.checks || []),
            ...(ars3Scorecard.layers?.usability?.checks || []),
            ...(ars3Scorecard.layers?.payments?.checks || []),
          ];

      for (const c of allResults) {
        if ((c.status === 'fail' || c.status === 'warn') && c.remediation) {
          const key = c.checkId || c.remediation.title;
          if (seenIds.has(key)) continue;
          seenIds.add(key);

          const layerKey = c.layer || (
            c.checkId?.startsWith('robots') || c.checkId?.startsWith('ard') ? 'discovery' :
            c.checkId?.startsWith('llms') || c.checkId?.startsWith('anti-spa') || c.checkId?.startsWith('content') ? 'access' :
            c.checkId?.startsWith('mcp') || c.checkId?.startsWith('auth') ? 'usability' :
            'payments'
          );

          const diffStr = c.remediation.diffSnippet
            ? (Array.isArray(c.remediation.diffSnippet) ? c.remediation.diffSnippet.join('\n') : c.remediation.diffSnippet)
            : undefined;

          let promptContent = c.remediation.mcpPrompt;
          if (!promptContent) {
            if (diffStr) {
              promptContent = `Target File: ${c.remediation.file || 'Codebase'}\n${c.remediation.fixCommand ? `Command: ${c.remediation.fixCommand}\n\n` : ''}${diffStr}`;
            } else if (c.remediation.fixCommand) {
              promptContent = `${c.message || c.remediation.title}\n\nRun CLI remediation:\n${c.remediation.fixCommand}`;
            } else {
              promptContent = c.message || `Implement remediation for ${c.remediation.title}`;
            }
          }

          list.push({
            id: c.checkId,
            title: c.remediation.title,
            layer: layerKey,
            layerLabel: ARS3_LAYER_LABELS[layerKey] || layerKey,
            targetFile: c.remediation.file,
            fixCommand: c.remediation.fixCommand,
            diffSnippet: diffStr,
            prompt: promptContent,
            severity: c.status === 'fail' ? 'critical' : 'high',
          });
        }
      }

      if (list.length > 0) return list;
    }

    // 2. Legacy V2 Surfaces Fallback
    if (isV2) {
      return checks.filter((s: any) => !s.found && s.status !== 'skipped' && s.fix).map((s: any) => ({
        title: RECOMMENDATION_TITLES[s.type] || `Implement ${s.type}`,
        prompt: s.fix,
        layer: 'surfaces',
        layerLabel: 'Ecosystem Surface',
      }));
    } else {
      const list: any[] = [];
      checks.forEach((c: any) => {
        const failed = c.results?.filter((r: any) => !r.passed && r.fix) || [];
        failed.forEach((r: any) => {
          list.push({
            title: `Remedy for: ${r.label}`,
            prompt: r.fix,
            layer: c.category,
            layerLabel: CATEGORY_LABELS[c.category]?.label || c.category,
          });
        });
        if (c.fix && !c.results) {
          list.push({
            title: `General Remedy: ${CATEGORY_LABELS[c.category]?.label || c.category}`,
            prompt: c.fix,
            layer: c.category,
            layerLabel: CATEGORY_LABELS[c.category]?.label || c.category,
          });
        }
      });
      return list;
    }
  }, [ars3Scorecard, checks, isV2]);

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

    if (ars3Scorecard) {
      let report = `# ARS 3.0 AI Agent Readiness Audit Report\n\n`;
      report += `**Product / Target URL:** ${url || 'Scanned Target'}\n`;
      report += `**ARS Score:** ${score} / 100\n`;
      report += `**Grade:** ${arsGrade} (${ars3Scorecard.gradeLabel || tierText})\n`;
      report += `**Archetype Profile:** ${archetype?.label || archetype?.archetype || 'Auto-detected'}\n`;
      report += `**Active Denominator:** ${ars3Scorecard.activeDenominator || 85} pts (Base: ${ars3Scorecard.baseDenominator || 85} pts + Bonus Earned: ${ars3Scorecard.bonusEarned || 0} pts)\n`;
      if (scanId) report += `**Scan ID:** ${scanId}\n`;
      report += `**Generated On:** ${current_date}\n\n`;
      report += `---\n\n`;

      report += `## 📊 Executive Summary\n\n`;
      report += `This audit evaluates the machine-readability, searchability, tool discovery, and autonomous agent interoperability of the target across the ARS 3.0 open protocol standard.\n\n`;
      if (score >= 90) {
        report += `**Verdict:** **Elite (Agent-Native)**. Autonomous AI agents (Cursor, Claude Code, GitHub Copilot) can discover, parse, authenticate, and execute integrations against this product with zero friction and near-zero hallucination risks.\n`;
      } else if (score >= 70) {
        report += `**Verdict:** **AI-Friendly**. Core machine surfaces and protocols are available, but targeted improvements in authentication contracts, OpenAPI schemas, or error recovery are recommended to achieve elite status.\n`;
      } else if (score >= 40) {
        report += `**Verdict:** **AI-Capable**. Basic documentation is accessible, but agents face friction due to soft-404 SPA route leaks, missing machine schemas, or context-bloating navigation structures.\n`;
      } else {
        report += `**Verdict:** **Legacy Target**. Core open protocol files (robots.txt AI directives, /llms.txt, OpenAPI specs, auth.md) are absent or misconfigured, causing agent navigation stalls.\n`;
      }
      report += `\n---\n\n`;

      // 4-Layer Summary Table
      report += `## 🏛️ ARS 3.0 4-Layer Scorecard\n\n`;
      report += `| Layer | Base Earned | Max Points | Status |\n`;
      report += `| :--- | :---: | :---: | :--- |\n`;
      if (ars3Scorecard.layers) {
        const layerKeys = ['discovery', 'access', 'usability', 'payments'] as const;
        layerKeys.forEach((k) => {
          const l = ars3Scorecard.layers[k];
          if (l) {
            report += `| **${l.name || ARS3_LAYER_LABELS[k] || k}** | ${l.baseEarned} | ${l.baseMax} pts | ${l.statusText || 'Evaluated'} |\n`;
          }
        });
      }
      report += `\n---\n\n`;

      // Detected Problems
      report += `## 🚨 Detected Issues & Defects (${problems.length} issues)\n\n`;
      if (problems.length > 0) {
        problems.forEach((p: any, idx: number) => {
          report += `### ${idx + 1}. [${(p.severity || 'defect').toUpperCase()}] ${p.title}\n`;
          if (p.layerLabel) report += `- **Layer:** ${p.layerLabel}\n`;
          report += `- **Description:** ${p.desc}\n`;
          if (p.targetFile) report += `- **Target File:** \`${p.targetFile}\`\n`;
          if (p.fix) report += `- **Recommended Fix:** \`${p.fix}\`\n`;
          report += `\n`;
        });
      } else {
        report += `No problems detected! All evaluated checks passed. 🎉\n\n`;
      }
      report += `---\n\n`;

      // Actionable Remedies
      report += `## 🛠️ Actionable Implementation Remediations (${solutions.length} available)\n\n`;
      if (solutions.length > 0) {
        solutions.forEach((s: any, idx: number) => {
          report += `### Remedy ${idx + 1}: ${s.title}\n`;
          if (s.layerLabel) report += `- **Layer:** ${s.layerLabel}\n`;
          if (s.targetFile) report += `- **Target File:** \`${s.targetFile}\`\n`;
          if (s.fixCommand) report += `- **CLI Fix Command:** \`${s.fixCommand}\`\n`;
          report += `\n\`\`\`text\n${s.prompt}\n\`\`\`\n\n`;
        });
      } else {
        report += `All evaluated systems are optimal. No immediate remediations required.\n\n`;
      }

      if (pages.length > 0) {
        report += `---\n\n`;
        report += `## 📑 Crawled Knowledge Corpus (${pages.length} pages)\n\n`;
        report += `| Page Title | URL | Word Count | Code Blocks |\n`;
        report += `| :--- | :--- | :---: | :---: |\n`;
        pages.slice(0, 50).forEach((p: any) => {
          report += `| [${p.title || 'Untitled'}](${p.url}) | \`${p.url}\` | ${p.wordCount ?? 0} words | ${p.codeBlocks?.length ?? 0} blocks |\n`;
        });
        report += `\n`;
      }

      report += `---\n\n`;
      report += `*Report generated by [Glintbase Scanner](https://scan.glintbase.dev) — ARS 3.0 Open Protocol Specification.*`;
      return report;
    }

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

  const handleCopyMarkdownReport = () => {
    const reportText = generateMarkdownReport();
    navigator.clipboard.writeText(reportText);
    setReportCopied(true);
    setTimeout(() => setReportCopied(false), 2500);
  };

  const handleCopyProblems = () => {
    let text = `### ARS 3.0 Detected Problems & Defects\n\n`;
    if (ars3Scorecard) {
      text += `**Target URL:** ${url || 'Scanned URL'}\n`;
      text += `**ARS Score:** ${score}/100 (Grade: ${arsGrade})\n`;
      text += `**Archetype Profile:** ${archetype?.label || archetype?.archetype || 'Auto-detected'}\n\n`;
    }
    text += problems.map((p: any) => `- [${(p.severity || 'warning').toUpperCase()}] **${p.title}** (${p.layerLabel || p.layer || 'general'}): ${p.desc}${p.targetFile ? ` [Target: ${p.targetFile}]` : ''}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedId('problems-md');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopySolutions = () => {
    let text = `### ARS 3.0 Actionable Implementation Remedies\n\n`;
    if (ars3Scorecard) {
      text += `**Target URL:** ${url || 'Scanned URL'}\n`;
      text += `**ARS Score:** ${score}/100\n\n`;
    }
    text += solutions.map((s: any) => `#### ${s.title}${s.layerLabel ? ` (${s.layerLabel})` : ''}\n${s.targetFile ? `**Target File:** \`${s.targetFile}\`\n` : ''}${s.fixCommand ? `**CLI Command:** \`${s.fixCommand}\`\n` : ''}\n\`\`\`\n${s.prompt}\n\`\`\``).join('\n\n');
    navigator.clipboard.writeText(text);
    setCopiedId('solutions-md');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyProblemSummaryPrompt = () => {
    let text = '';
    if (ars3Scorecard) {
      text = `We completed an ARS 3.0 AI Agent Readiness Audit on our developer ecosystem.\n\n`;
      text += `Target URL: ${url || 'Scanned Target'}\n`;
      text += `ARS Score: ${score}/100 (Grade: ${arsGrade})\n`;
      text += `Archetype Profile: ${archetype?.label || archetype?.archetype || 'Auto-detected'}\n`;
      if (ars3Scorecard.activeDenominator) {
        text += `Active Denominator: ${ars3Scorecard.activeDenominator} pts\n`;
      }
      text += `\nHere is the compressed diagnostic summary of detected defects across ARS 3.0 layers:\n\n`;

      const groupedByLayer: Record<string, any[]> = {};
      problems.forEach((p: any) => {
        const layerKey = p.layer || 'general';
        if (!groupedByLayer[layerKey]) groupedByLayer[layerKey] = [];
        groupedByLayer[layerKey].push(p);
      });

      for (const [lKey, probs] of Object.entries(groupedByLayer)) {
        const layerName = ARS3_LAYER_LABELS[lKey] || lKey.toUpperCase();
        text += `### ${layerName}\n`;
        probs.forEach((p) => {
          text += `- [${(p.severity || 'defect').toUpperCase()}] ${p.title}: ${p.desc}${p.targetFile ? ` (File: ${p.targetFile})` : ''}\n`;
        });
        text += '\n';
      }

      text += `Please analyze these architectural agent readiness defects and recommend immediate remediation steps.`;
    } else {
      text = `We are missing critical developer ecosystem surfaces. Here is a summary of the problems:\n` + problems.map((p: any) => `- ${p.title}: ${p.desc}`).join('\n') + `\n\nPlease help us fix these issues.`;
    }

    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const handleCopyFixesPrompt = () => {
    let text = '';
    if (ars3Scorecard) {
      text = `Here are the official ARS 3.0 remediation instructions, configuration files, and code patches to make our product agent-native:\n\n`;
      text += `Target: ${url || 'Scanned Repository'}\n`;
      text += `Target ARS Grade: A+ (Elite Agent-Native)\n\n`;

      solutions.forEach((s: any, idx: number) => {
        text += `### ${idx + 1}. ${s.title}\n`;
        if (s.layerLabel) text += `- **Layer:** ${s.layerLabel}\n`;
        if (s.targetFile) text += `- **Target File:** \`${s.targetFile}\`\n`;
        if (s.fixCommand) text += `- **CLI Fix:** \`${s.fixCommand}\`\n`;
        text += `\n\`\`\`\n${s.prompt}\n\`\`\`\n\n`;
      });

      text += `Please implement these configuration files, fix commands, and code patches in our repository.`;
    } else {
      text = `Here are the remediation instructions for making our product agent-native:\n` + solutions.map((s: any) => `### ${s.title}\n\n${s.prompt}`).join('\n\n') + `\n\nPlease implement these files and configure our repository accordingly.`;
    }

    navigator.clipboard.writeText(text);
    setCopiedFixes(true);
    setTimeout(() => setCopiedFixes(false), 2000);
  };

  return (
    <>
      <div
        className="w-full min-w-0 max-w-7xl mx-auto px-3 sm:px-4 md:px-8 mt-4 sm:mt-8 mb-16 space-y-6"
        data-theme={isDark ? 'dark' : 'cream'}
        style={{ overflowX: 'clip' }}
      >

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
              href="https://glintbase.dev/enterprise"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-black bg-[#FF3300] hover:bg-[#e62e00] border border-[#FF3300] rounded px-3 py-1.5 transition-all font-mono shadow-[0_0_14px_rgba(255,51,0,0.35)] hover:shadow-[0_0_20px_rgba(255,51,0,0.55)] cursor-pointer"
            >
              <Sparkles size={11} />
              Enterprise Audit
            </a>

            <div className="w-px h-4 bg-white/10 mx-0.5" />

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

            {url && (
              <>
                <div className="w-px h-4 bg-white/10 mx-0.5" />
                <a
                  href={`/scan/${companySlug || deriveCompanySlug(url)}/briefing?url=${encodeURIComponent(url)}&score=${score}`}
                  className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-white border border-white/10 bg-white/[0.02] hover:bg-white/10 rounded px-3 py-1.5 transition-all font-mono cursor-pointer"
                >
                  <FileText size={11} />
                  Executive PDF
                </a>
              </>
            )}


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
            <div className="relative flex flex-col items-center justify-center px-6 py-6 sm:px-10 sm:py-10 bg-black min-w-full lg:min-w-[220px] border-b lg:border-b-0 lg:border-r border-white/[0.06]">
              <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 50%, ${score >= 90 ? 'rgba(255,51,0,0.10)' : score >= 70 ? 'rgba(34,211,238,0.08)' : score >= 40 ? 'rgba(139,92,246,0.08)' : 'rgba(255,51,0,0.06)'} 0%, transparent 70%)` }} />
              <div className="flex items-center gap-3">
                <div className={`text-5xl sm:text-6xl lg:text-[76px] leading-none font-black font-mono tracking-tighter ${tierColor}`}>
                  {score}
                </div>
                <div className="flex flex-col items-center pl-2 border-l border-white/10">
                  <span className="px-2.5 py-0.5 rounded-lg bg-white/5 border border-white/15 text-2xl sm:text-3xl font-black font-mono text-white">
                    {arsGrade}
                  </span>
                  <span className="text-[8px] font-mono text-white/40 uppercase mt-0.5">Grade</span>
                </div>
              </div>
              <div className="text-[9px] font-mono font-bold tracking-[0.3em] text-white/25 uppercase mt-1">/ 100</div>
              <div className={`mt-3 text-[9px] font-mono font-bold tracking-widest uppercase px-2.5 py-1 rounded border ${score >= 90 ? 'text-[#FF3300] border-[#FF3300]/30 bg-[#FF3300]/[0.08]' : score >= 70 ? 'text-[#22D3EE] border-[#22D3EE]/30 bg-[#22D3EE]/[0.08]' : score >= 40 ? 'text-[#8B5CF6] border-[#8B5CF6]/30 bg-[#8B5CF6]/[0.08]' : 'text-[#FF3300]/70 border-[#FF3300]/20 bg-[#FF3300]/[0.05]'}`}>{tierText}</div>
            </div>

            <div className="flex flex-col justify-center px-5 py-6 sm:px-8 sm:py-8 flex-1 bg-black border-b lg:border-b-0 lg:border-r border-white/[0.06]">
              <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-white/25 mb-2">{isV2 ? 'Agent Ecosystem Discovery' : 'AI Readiness Audit'}</div>
              <div className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight font-mono leading-none break-all">
                {url ? (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })() : 'Scanned Surface'}
              </div>
              {archetype && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FF3300]/10 text-[#FF3300] border border-[#FF3300]/30 uppercase tracking-wider">
                    Archetype: {archetype.label || archetype.archetype}
                  </span>
                  {ars3Scorecard?.activeDenominator && (
                    <span className="text-[10px] font-mono text-white/50 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                      Denominator: {ars3Scorecard.activeDenominator} pts
                    </span>
                  )}
                </div>
              )}
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

          {/* Dual-Track CLI & Simulator Integration Bar */}
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 glint-card">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#FF3300]/10 border border-[#FF3300]/30 flex items-center justify-center shrink-0">
                <Terminal size={16} className="text-[#FF3300]" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Developer Track & MCP Parity
                </div>
                <div className="text-[11px] text-white/50 truncate font-mono">
                  Inspect in CLI or test live agent trajectories in Flight Simulator
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`glintbase audit ${url || ''}`);
                  setCopiedCliAudit(true);
                  setTimeout(() => setCopiedCliAudit(false), 2000);
                }}
                className="px-3 py-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-white/80 hover:text-white border border-white/10 text-xs font-mono flex items-center gap-1.5 transition-all"
                title="Copy CLI audit command"
              >
                <Copy size={12} className={copiedCliAudit ? 'text-emerald-400' : 'text-white/40'} />
                <span>{copiedCliAudit ? 'Copied CLI Command' : 'glintbase audit'}</span>
              </button>

              <Link
                href={`/simulate?target=${encodeURIComponent(url || '')}`}
                className="px-3 py-1.5 rounded-lg bg-[#FF3300] hover:bg-[#FF3300]/90 text-white text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md shadow-[#FF3300]/20"
              >
                <Play size={12} fill="currentColor" />
                <span>Flight Simulator</span>
              </Link>

              <button
                onClick={() => {
                  navigator.clipboard.writeText('glintbase serve');
                  setCopiedMcpServe(true);
                  setTimeout(() => setCopiedMcpServe(false), 2000);
                }}
                className="px-3 py-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-white/80 hover:text-white border border-white/10 text-xs font-mono flex items-center gap-1.5 transition-all"
                title="Copy MCP server serve command"
              >
                <Copy size={12} className={copiedMcpServe ? 'text-emerald-400' : 'text-white/40'} />
                <span>{copiedMcpServe ? 'Copied' : 'glintbase serve'}</span>
              </button>
            </div>
          </div>

          {/* Soft-404 Anti-SPA Canary Warning */}
          {soft404Detected && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-300 uppercase tracking-wider font-mono">
                <AlertTriangle size={16} /> Anti-SPA Canary Hazard Detected
              </div>
              <p className="leading-relaxed text-amber-200/80">
                Non-existent routes return HTTP 200 HTML shells instead of RFC 7807 404 JSON. Autonomous agent personas (Claude Code, Cursor, Perplexity) parse these HTML shells as valid API bodies, resulting in hallucinated fields and stuck retry loops.
              </p>
              <div className="text-[11px] font-mono text-amber-300/90 pt-1">
                Fix: Deploy an Anti-SPA 404 handler returning genuine HTTP 404 status.
              </div>
            </div>
          )}

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

          {/* ARS 3.0 Machine Topology Map */}
          <MachineTopologyMap
            graph={checks?.graph}
            surfaces={checks?.surfaces || discoverablesList}
            targetUrl={url || ''}
          />

          {/* Ecosystem Diagnostic Dimensions Breakdown
              Mobile: isolate from canvas compositing; avoid overflow-x clip of labels */}
          {/* ARS 3.0 Standard 4-Layer Dynamic Architecture */}
          {ars3Scorecard?.layers ? (
            <div className="border border-white/[0.06] rounded-2xl glint-card min-w-0 gpu-isolate relative z-[1]">
              <div className="bg-black px-4 sm:px-5 py-3 border-b border-white/[0.05] flex items-center justify-between gap-2 rounded-t-2xl min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-[#FF3300] font-bold truncate">
                    ARS 3.0 Standard · 4-Layer Dynamic Architecture
                  </span>
                  <span className="text-[9px] font-mono bg-white/5 text-white/50 px-2 py-0.5 rounded border border-white/10 shrink-0">
                    119 Discrete Checks
                  </span>
                </div>
                <span className="text-[8px] font-mono text-white/25 shrink-0 hidden sm:inline">
                  Tap card to expand check results
                </span>
              </div>

              <div className="bg-black p-3 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-stretch rounded-b-2xl min-w-0">
                {(['discovery', 'access', 'usability', 'payments'] as const).map((layerKey) => {
                  const layer = ars3Scorecard.layers[layerKey];
                  if (!layer) return null;
                  const isExpanded = expandedLayer === layerKey;
                  const pct = layer.baseMax > 0 ? Math.min(100, Math.max(0, (layer.totalEarned / layer.baseMax) * 100)) : 0;
                  const passedChecks = layer.checks.filter((c: any) => c.status === 'pass').length;

                  return (
                    <div
                      key={layerKey}
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedLayer(isExpanded ? null : layerKey)}
                      className={`flex flex-col p-4 rounded-xl border transition-all cursor-pointer select-none w-full min-w-0 ${
                        isExpanded
                          ? 'border-[#FF3300]/40 bg-white/[0.03]'
                          : 'border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2 font-mono min-w-0">
                        <div className="min-w-0">
                          <span className="text-[10px] sm:text-[11px] font-black text-white/90 uppercase tracking-wide leading-snug block truncate" title={layer.name}>
                            {layer.name}
                          </span>
                          <span className="text-[9px] text-white/40 font-mono block mt-0.5">
                            {passedChecks}/{layer.checks.length} checks passed
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                          <span className="text-xs font-bold text-[#FF3300] font-mono tabular-nums whitespace-nowrap">
                            {layer.totalEarned}/{layer.baseMax}
                          </span>
                          {isExpanded ? (
                            <ChevronUp size={12} className="text-white/40" />
                          ) : (
                            <ChevronDown size={12} className="text-white/40" />
                          )}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full h-1.5 bg-white/[0.06] rounded-full mb-2 min-w-0 overflow-hidden">
                        <div
                          className="h-full bg-[#FF3300] rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[9px] font-mono mt-auto pt-2 border-t border-white/[0.04]">
                        <span className={`font-bold ${
                          layer.statusText === 'Optimal' ? 'text-emerald-400' : layer.statusText === 'Needs attention' ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                          {layer.applicable ? layer.statusText : 'N/A (Skipped)'}
                        </span>
                        {layer.bonusEarned > 0 && (
                          <span className="text-cyan-400">+{layer.bonusEarned} bonus</span>
                        )}
                      </div>

                      {/* Expandable checks list */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1.5 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                          {layer.checks.map((c: any) => (
                            <div
                              key={c.checkId}
                              className="p-2 rounded bg-black/50 border border-white/5 space-y-1 text-[9px] font-mono"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-white/80 truncate">
                                  {c.checkId}
                                </span>
                                <span className={`px-1.5 py-0.2 rounded text-[8px] uppercase font-bold ${
                                  c.status === 'pass'
                                    ? 'text-emerald-400 bg-emerald-500/10'
                                    : c.status === 'warn'
                                    ? 'text-amber-400 bg-amber-500/10'
                                    : c.status === 'skip'
                                    ? 'text-white/30 bg-white/5'
                                    : 'text-rose-400 bg-rose-500/10'
                                }`}>
                                  {c.status}
                                </span>
                              </div>
                              <p className="text-white/50 leading-tight">{c.message}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : isV2 ? (
            <div className="border border-white/[0.06] rounded-2xl glint-card min-w-0 gpu-isolate relative z-[1]">
              <div className="bg-black px-4 sm:px-5 py-3 border-b border-white/[0.05] flex items-center justify-between gap-2 rounded-t-2xl min-w-0">
                <span className="text-[8px] font-mono uppercase tracking-[0.3em] text-white/25 truncate">
                  Ecosystem Diagnostic Dimensions
                </span>
                <span className="text-[8px] font-mono text-white/25 shrink-0 hidden sm:inline">
                  Tap cards to expand
                </span>
              </div>
              <div className="bg-black p-3 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 items-stretch rounded-b-2xl min-w-0">
                {dimensionScores.map((dim, idx) => {
                  const isExpanded = !!expandedDims[idx];
                  const pct = dim.maxScore > 0 ? Math.min(100, Math.max(0, (dim.score / dim.maxScore) * 100)) : 0;
                  return (
                    <div
                      key={idx}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleDimension(idx)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleDimension(idx);
                        }
                      }}
                      className="dim-card flex flex-col p-3.5 sm:p-4 rounded-xl border border-white/[0.06] bg-white/[0.01] active:bg-white/[0.03] sm:hover:bg-white/[0.02] cursor-pointer select-none w-full min-w-0"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2 font-mono min-w-0">
                        <span
                          className="text-[10px] sm:text-[11px] font-black text-white/85 uppercase tracking-wide leading-snug min-w-0 flex-1 break-words"
                          title={dim.name}
                        >
                          {dim.name}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                          <span className="text-[11px] font-bold text-[#FF3300] tabular-nums whitespace-nowrap">
                            {dim.score}/{dim.maxScore}
                          </span>
                          {isExpanded ? (
                            <ChevronUp size={12} className="text-white/40" />
                          ) : (
                            <ChevronDown size={12} className="text-white/40" />
                          )}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full h-1 bg-white/[0.06] rounded-full mb-1 min-w-0">
                        <div
                          className="h-full bg-[#FF3300] rounded-full"
                          style={{ width: `${pct}%`, maxWidth: '100%' }}
                        />
                      </div>

                      {/* Accordion */}
                      {isExpanded && (
                        <div className="mt-2 pt-2 border-t border-white/[0.06] min-w-0">
                          <p className="text-[9px] text-white/45 leading-relaxed mb-2 break-words">
                            {dim.description}
                          </p>
                          <div className="space-y-1.5">
                            {dim.observations.map((obs, oIdx) => (
                              <div
                                key={oIdx}
                                className="flex items-start gap-1.5 text-[8px] font-mono text-white/35 leading-relaxed min-w-0"
                              >
                                <span className="text-[#FF3300] shrink-0">•</span>
                                <span className="min-w-0 break-words">{obs}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

        </div>

        {/* ———— BOTTOM GRID (Problems, Solutions, Audit Items) ———— */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* PROBLEMS CARD */}
          <div className="bg-black border border-white/5 rounded-2xl p-6 flex flex-col justify-between overflow-hidden relative glint-card">
            <div className="space-y-4">
              <div className="border-b border-white/5 pb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Problems</h3>
                <span className="text-[10px] font-mono text-white/40">{problems.length} detected</span>
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 custom-scrollbar text-[11px]">
                {problems.length > 0 ? (
                  problems.map((prob: any, idx: number) => (
                    <div key={idx} className="bg-black/20 p-3 rounded-xl border border-white/[0.03] space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-bold text-white/80 uppercase tracking-wider text-[10px] min-w-0">
                          <span className={prob.severity === 'critical' ? "text-rose-500 shrink-0" : "text-amber-400 shrink-0"}>●</span>
                          <span className="truncate">{prob.title}</span>
                        </div>
                        {prob.layer && (
                          <span className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/5 text-white/50 border border-white/5 shrink-0 whitespace-nowrap">
                            {prob.layer}
                          </span>
                        )}
                      </div>
                      <p className="text-white/40 leading-relaxed font-sans">{prob.desc}</p>
                      {prob.targetFile && (
                        <div className="text-[9px] font-mono text-white/30 flex items-center gap-1">
                          <span>Target:</span>
                          <code className="text-[#FF3300]/80">{prob.targetFile}</code>
                        </div>
                      )}
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
              <div className="border-b border-white/5 pb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Solutions</h3>
                <span className="text-[10px] font-mono text-white/40">{solutions.length} available</span>
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 custom-scrollbar text-[11px]">
                {solutions.length > 0 ? (
                  solutions.map((sol: any, idx: number) => (
                    <div key={idx} className="bg-black/20 p-3 rounded-xl border border-white/[0.03] space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-bold text-white/80 uppercase tracking-wider text-[10px] flex items-center gap-1.5 min-w-0">
                          <span className="text-emerald-400 shrink-0">●</span>
                          <span className="truncate">{sol.title}</span>
                        </div>
                        {sol.layer && (
                          <span className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 whitespace-nowrap">
                            {sol.layer}
                          </span>
                        )}
                      </div>
                      {sol.targetFile && (
                        <div className="text-[9px] font-mono text-white/40 flex items-center gap-1">
                          <span>Target:</span>
                          <code className="text-white/70">{sol.targetFile}</code>
                        </div>
                      )}
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
                    Copy an ARS 3.0 compressed diagnostic defect summary structured by layer for teams or LLM pipelines.
                  </p>
                  <button
                    onClick={handleCopyProblemSummaryPrompt}
                    className="w-full bg-[#FF3300]/10 hover:bg-[#FF3300]/20 text-[#FF3300] hover:text-white font-mono text-[9px] font-bold uppercase tracking-widest py-2 rounded border border-[#FF3300]/20 transition-all cursor-pointer"
                  >
                    {copiedSummary ? 'Copied ARS 3.0 Summary!' : 'Copy ARS 3.0 Summary Prompt'}
                  </button>
                </div>

                {/* Fixes / Solutions Copy Prompt */}
                <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-2">
                  <div className="font-bold text-white/80 uppercase tracking-wider text-[9px] font-mono">Fixes / Solutions Prompt</div>
                  <p className="text-white/40 leading-relaxed font-sans">
                    Copy ARS 3.0 remediation files, patches, and CLI fix commands directly for Cursor, Claude Code, or Copilot.
                  </p>
                  <button
                    onClick={handleCopyFixesPrompt}
                    className="w-full bg-[#22D3EE]/10 hover:bg-[#22D3EE]/20 text-[#22D3EE] hover:text-white font-mono text-[9px] font-bold uppercase tracking-widest py-2 rounded border border-[#22D3EE]/20 transition-all cursor-pointer"
                  >
                    {copiedFixes ? 'Copied ARS 3.0 Remedies!' : 'Copy ARS 3.0 Remedies Prompt'}
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

                    {isExpanded && (
                      <div className="border-t border-white/5 bg-black/40">
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}



        {/* ———— Agent Flight Simulator Cockpit Banner ———— */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] via-black to-[#FF3300]/[0.04] p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 glint-card">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-[9px] font-mono font-bold uppercase tracking-[0.25em] text-[#FF3300]">
              <Zap size={12} />
              Autonomous Agent Flight Simulator
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white font-mono uppercase tracking-tight">
              Test Real Agent Execution In The Cockpit
            </h3>
            <p className="text-xs text-white/50 leading-relaxed font-sans">
              Evaluate real-world agent execution against this ecosystem across Claude Code, Cursor & Windsurf, and Perplexity Sonar. Measure token consumption tax, schema friction risks, and autonomous credential handshakes.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/10 text-[9px] font-mono text-white/50">
                5-Phase Trajectory
              </span>
              <span className="px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/10 text-[9px] font-mono text-white/50">
                BPE Token Tax Counter
              </span>
              <span className="px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/10 text-[9px] font-mono text-white/50">
                Time-to-First-Tool-Call (TTFTC)
              </span>
              <span className="px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/10 text-[9px] font-mono text-white/50">
                Schema Friction Index
              </span>
            </div>
          </div>
          <Link
            href={`/simulate?url=${encodeURIComponent(url || '')}`}
            className="inline-flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-white bg-[#FF3300] hover:bg-[#FF3300]/90 rounded-xl px-6 py-4 transition-all font-mono shrink-0 shadow-[0_0_20px_rgba(255,51,0,0.35)] hover:shadow-[0_0_30px_rgba(255,51,0,0.55)] cursor-pointer active:scale-[0.96]"
          >
            Launch Flight Simulator
            <ExternalLink size={13} />
          </Link>
        </div>

        {/* ———— Enterprise Audit Banner ———— */}
        <div className="mt-8 rounded-2xl border border-[#8B5CF6]/30 bg-gradient-to-r from-[#8B5CF6]/[0.08] via-black to-[#FF3300]/[0.05] p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 glint-card">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-[9px] font-mono font-bold uppercase tracking-[0.25em] text-[#8B5CF6]">
              <Sparkles size={12} />
              Enterprise Infrastructure Audit
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white font-mono uppercase tracking-tight">
              Need a Custom In-Depth Enterprise Audit?
            </h3>
            <p className="text-xs text-white/50 leading-relaxed font-sans">
              Get custom multi-agent simulation harnesses, live production API probing, dedicated MCP server tools, and tailored enterprise readiness benchmarks built specifically for your product.
            </p>
          </div>
          <a
            href="https://glintbase.dev/enterprise"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-black bg-[#FF3300] hover:bg-[#e62e00] rounded-xl px-6 py-3.5 transition-all font-mono shrink-0 shadow-[0_0_20px_rgba(255,51,0,0.4)] hover:shadow-[0_0_28px_rgba(255,51,0,0.6)] cursor-pointer"
          >
            Request Enterprise Audit
            <ExternalLink size={13} />
          </a>
        </div>

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

