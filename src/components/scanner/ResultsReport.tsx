"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Copy, AlertTriangle, Share2, X } from 'lucide-react';
import { useState } from 'react';

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  context: { label: 'Context Optimization', icon: '⚡' },
  code:    { label: 'Code Block Execution', icon: '🔧' },
  machine: { label: 'Machine Readability',  icon: '🔍' },
  agent:   { label: 'Agent Tooling & MCP',   icon: '🤖' },
};

function getScoreLabel(score: number) {
  if (score >= 76) return { label: 'Glintbase Agent-Native', color: 'text-success', border: 'border-success', glow: 'shadow-[0_0_60px_rgba(16,185,129,0.3)]' };
  if (score >= 41) return { label: 'AI-Friendly Docs', color: 'text-warning', border: 'border-warning', glow: 'shadow-[0_0_60px_rgba(245,158,11,0.2)]' };
  return { label: 'Legacy Docs (Invisible)', color: 'text-danger', border: 'border-danger', glow: 'shadow-[0_0_60px_rgba(239,68,68,0.3)]' };
}

function deriveCompany(rawUrl: string): string {
  let hostname = rawUrl;
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    hostname = rawUrl.replace(/^https?:\/\//i, '').split('/')[0];
  }
  hostname = hostname.toLowerCase().replace(/^www\./i, '');
  let company = hostname.split('.')[0];
  if (['docs', 'www', 'developer', 'dev', 'api'].includes(company)) {
    company = hostname.split('.')[1] || company;
  }
  return company.charAt(0).toUpperCase() + company.slice(1);
}

export default function ResultsReport({ score, checks, scanId, url }: { score: number; checks: any[]; scanId?: string; url?: string }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<'problems' | 'fixes' | null>(null);
  const { label, color, border, glow } = getScoreLabel(score);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const companySlug = url ? deriveCompany(url).toLowerCase() : '';
  const shareUrl = companySlug
    ? `https://scan.glintbase.xyz/${companySlug}-scan`
    : (scanId ? `https://scan.glintbase.xyz/scan/${scanId}` : 'https://scan.glintbase.xyz');

  const tweetText = `Just ran an AI Agent Readiness Audit via @glintbase 🤖\n\nScore: ${score}/100 — ${label}\n\nCan Cursor, Claude Code, and Copilot understand your documentation?\nScan yours here:`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
  const [linkCopied, setLinkCopied] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);

  const generateMarkdownReport = () => {
    let report = `# AI Agent Readiness Report\n\n`;
    report += `**Repository / Documentation URL:** ${url || 'Scanned URL'}\n`;
    report += `**Agent Readiness Score:** ${score}/100\n`;
    report += `**Scan ID:** ${scanId || 'N/A'}\n\n`;
    report += `---\n\n`;
    report += `## 📊 Category Breakdown\n\n`;

    checks.forEach(check => {
      const meta = CATEGORY_LABELS[check.category] || { label: check.category };
      report += `- **${meta.label}**: ${check.score} / ${check.maxScore}\n`;
    });

    report += `\n---\n\n`;
    report += `## 🚨 Detected Problems (Audit Summary)\n\n`;

    let hasProblems = false;
    checks.forEach(check => {
      const failedChecks = check.results?.filter((r: any) => !r.passed) || [];
      const hasCategoryIssue = check.score < check.maxScore && (!check.results || failedChecks.length > 0 || check.warning || check.fix);

      if (hasCategoryIssue) {
        hasProblems = true;
        const meta = CATEGORY_LABELS[check.category] || { label: check.category, icon: '📊' };
        report += `### ${meta.icon} ${meta.label} (Deducted: ${check.maxScore - check.score} pts)\n`;

        if (check.results) {
          failedChecks.forEach((r: any) => {
            report += `- **Issue:** ${r.label}\n`;
            report += `  **Details:** AI agent parser flagged incomplete states or missing files.\n`;
          });
        } else {
          report += `- **Issue:** General category optimization required.\n`;
        }
        report += `\n`;
      }
    });

    if (!hasProblems) {
      report += `No problems detected! Your repository is 100% Agent-Native. 🎉\n\n`;
    }

    report += `---\n\n`;
    report += `## 🛠️ Actionable Implementation & Fix Prompts for Your AI Agent\n\n`;
    report += `*You can copy and paste the prompts below directly into your AI coding assistant (such as Cursor, Claude Code, or Copilot) to automatically generate or fix these files.*\n\n`;

    let hasFixes = false;
    checks.forEach(check => {
      const failedChecks = check.results?.filter((r: any) => !r.passed && r.fix) || [];
      const hasCategoryFix = check.score < check.maxScore && (failedChecks.length > 0 || check.fix);

      if (hasCategoryFix) {
        hasFixes = true;
        const meta = CATEGORY_LABELS[check.category] || { label: check.category, icon: '📊' };
        report += `### ${meta.icon} ${meta.label} Remedies\n\n`;

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

    report += `*Report generated by [Glintbase Scanner](https://scan.glintbase.xyz) - Infrastructure for AI-agent-ready repositories and documentation.*`;

    return report;
  };

  const handleCopyMarkdownReport = () => {
    const reportText = generateMarkdownReport();
    navigator.clipboard.writeText(reportText);
    setReportCopied(true);
    setTimeout(() => setReportCopied(false), 2500);
  };


  return (
    <>
      <div className="w-full animate-fade-in">
        <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-3xl mx-auto mt-10 space-y-6"
      >
      {/* ── Overall Score Card ─────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-[#0F172A] border border-white/5 rounded-2xl p-8 flex flex-col md:flex-row items-center gap-8"
      >
        {/* Ring */}
        <div className={`relative flex-shrink-0 flex items-center justify-center w-36 h-36 rounded-full border-[6px] ${border} bg-[#020617] ${glow}`}>
          <motion.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
            className={`text-5xl font-black font-mono ${color}`}
          >
            {score}
          </motion.span>
          <span className="absolute -bottom-7 text-xs font-bold text-white/30 uppercase tracking-widest">/100</span>
        </div>

        {/* Summary */}
        <div className="flex-1 text-center md:text-left space-y-3">
          <div className={`text-[10px] font-mono uppercase tracking-[0.4em] ${color}`}>
            Agent Readiness Score
          </div>
          <h2 className={`text-4xl font-black uppercase tracking-tighter ${color}`}>
            {label}
          </h2>
          <p className="text-sm text-white/40 leading-relaxed">
            {score >= 76 ? 'Excellent. Zero layout waste, optimized context, complete code block integration, and native MCP hooks.' :
             score >= 41 ? 'Parseable by AI models but has high token usage or lacks standard machine-readable hooks.' :
             'Invisible to AI agents. Severe context noise, non-functional code, or zero discoverable specifications.'}
          </p>

          {/* Share Audit Bar */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <a
              href={tweetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/40 hover:text-white border border-white/10 hover:border-white/30 rounded-lg px-4 py-2 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.736-8.857L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Share on X
            </a>
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/40 hover:text-white border border-white/10 hover:border-white/30 rounded-lg px-4 py-2 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              LinkedIn
            </a>
            <button
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2500);
              }}
              className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/40 hover:text-white border border-white/10 hover:border-white/30 rounded-lg px-4 py-2 transition-all cursor-pointer"
            >
              <Copy size={14} />
              {linkCopied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── CTA Action Buttons for Popups ────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => setActiveModal('problems')}
          className="group relative overflow-hidden bg-gradient-to-br from-red-500/10 to-[#0F172A] hover:from-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-200 font-black text-xs uppercase tracking-[0.25em] py-4 px-6 rounded-xl transition-all shadow-[0_0_20px_rgba(239,68,68,0.05)] hover:shadow-[0_0_30px_rgba(239,68,68,0.15)] flex items-center justify-center gap-3 cursor-pointer w-full"
        >
          <span className="text-sm">🚨</span>
          Problems Audit Summary
          <span className="absolute right-4 transform translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all font-mono">→</span>
        </button>
        <button
          onClick={() => setActiveModal('fixes')}
          className="group relative overflow-hidden bg-gradient-to-br from-emerald-500/10 to-[#0F172A] hover:from-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-200 font-black text-xs uppercase tracking-[0.25em] py-4 px-6 rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.05)] hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] flex items-center justify-center gap-3 cursor-pointer w-full"
        >
          <span className="text-sm">🛠️</span>
          Implementation Fix Guide
          <span className="absolute right-4 transform translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all font-mono">→</span>
        </button>
      </div>

      {/* ── Copy Agent-Ready Report ──────────────────────── */}
      <button
        onClick={handleCopyMarkdownReport}
        className="w-full group relative overflow-hidden bg-gradient-to-br from-[#FF4500]/10 to-[#0F172A] hover:from-[#FF4500]/20 border border-[#FF4500]/20 hover:border-[#FF4500]/40 text-[#FF4500] hover:text-white font-black text-xs uppercase tracking-[0.25em] py-4 px-6 rounded-xl transition-all shadow-[0_0_20px_rgba(255,69,0,0.05)] hover:shadow-[0_0_30px_rgba(255,69,0,0.15)] flex items-center justify-center gap-3 cursor-pointer mt-4"
      >
        <span className="text-sm">📋</span>
        {reportCopied ? 'Report Copied to Clipboard!' : 'Copy Agent-Ready Markdown Report'}
        <span className="absolute right-4 transform translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all font-mono">→</span>
      </button>

      {/* ── Category Bars ─────────────────────────────────── */}
      <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-6 space-y-5">
        <h3 className="text-[10px] font-mono text-white/20 uppercase tracking-widest mb-4">Category Breakdown</h3>
        {checks.map((check, idx) => {
          const pct = Math.round((check.score / check.maxScore) * 100);
          const meta = CATEGORY_LABELS[check.category] || { label: check.category, icon: '📊' };
          return (
            <motion.div
              key={check.category}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + idx * 0.08 }}
              className="space-y-1.5"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-white/70">{meta.label}</span>
                <span className={`font-mono font-bold text-xs ${check.score === check.maxScore ? 'text-success' : check.score > check.maxScore * 0.5 ? 'text-[#22D3EE]' : 'text-danger'}`}>
                  {check.score} / {check.maxScore}
                </span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: 0.3 + idx * 0.08, duration: 0.7, ease: 'easeOut' }}
                  className={`h-full rounded-full ${pct >= 90 ? 'bg-success' : pct >= 60 ? 'bg-[#22D3EE]' : pct >= 30 ? 'bg-warning' : 'bg-danger'}`}
                />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Detailed Checks ───────────────────────────────── */}
      <h3 className="text-xl font-black text-white uppercase tracking-tighter pt-2">Detailed Findings</h3>

      {checks.map((check, idx) => {
        const meta = CATEGORY_LABELS[check.category] || { label: check.category, icon: '📊' };
        const hasIssues = check.score < check.maxScore;

        return (
          <motion.div
            key={check.category}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + idx * 0.08 }}
            className="bg-[#0F172A] border border-white/5 hover:border-white/10 rounded-2xl overflow-hidden transition-colors"
          >
            {/* Category header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <span className="text-xl">{meta.icon}</span>
                <h4 className="font-black text-white uppercase tracking-wide text-sm">{meta.label}</h4>
              </div>
              <div className={`font-mono font-bold text-sm px-3 py-1 rounded-lg border ${
                check.score === check.maxScore
                  ? 'text-success border-success/20 bg-success/5'
                  : check.score > check.maxScore * 0.5
                  ? 'text-[#22D3EE] border-[#22D3EE]/20 bg-[#22D3EE]/5'
                  : 'text-danger border-danger/20 bg-danger/5'
              }`}>
                {check.score}/{check.maxScore}
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Warning */}
              {check.warning && (
                <div className="flex items-start gap-3 text-warning/70 bg-warning/5 border border-warning/10 rounded-xl p-4">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <p className="text-sm leading-relaxed">
                    This category was analyzed using structural heuristics. Results reflect your documentation&apos;s observable patterns.
                  </p>
                </div>
              )}

              {/* Individual check results */}
              {check.results && (
                <div className="space-y-3">
                  {check.results.map((r: any) => (
                    <div key={r.id} className="flex items-start gap-3">
                      {r.passed ? (
                        <CheckCircle2 className="text-success shrink-0 mt-0.5" size={16} />
                      ) : (
                        <XCircle className="text-danger shrink-0 mt-0.5" size={16} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${r.passed ? 'text-white/70' : 'text-white'}`}>{r.label}</p>
                        {r.fix && (
                          <div className="mt-3 relative group/fix">
                            <div className="text-[10px] font-mono text-[#FF4500] uppercase tracking-wider mb-2 font-bold">
                              ↳ AI Agent Fix Prompt
                            </div>
                            <div className="bg-[#020617] border border-white/5 rounded-xl p-4 pr-12">
                              <pre className="text-xs font-mono text-white/40 whitespace-pre-wrap leading-relaxed">{r.fix}</pre>
                              <button
                                onClick={() => handleCopy(r.fix, r.id)}
                                className="absolute top-3 right-3 p-2 rounded-lg bg-white/5 text-white/30 hover:text-[#FF4500] hover:bg-[#FF4500]/10 transition-all"
                                title="Copy prompt"
                              >
                                {copiedId === r.id ? <CheckCircle2 size={14} className="text-success" /> : <Copy size={14} />}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Category-level fix prompt */}
              {check.fix && !check.results && (
                <div className="relative group/fix">
                  <div className="text-[10px] font-mono text-[#FF4500] uppercase tracking-wider mb-2 font-bold">
                    AI Agent Fix Prompt
                  </div>
                  <div className="bg-[#020617] border border-white/5 rounded-xl p-4 pr-12">
                    <pre className="text-xs font-mono text-white/40 whitespace-pre-wrap leading-relaxed">{check.fix}</pre>
                    <button
                      onClick={() => handleCopy(check.fix, check.category)}
                      className="absolute top-3 right-3 p-2 rounded-lg bg-white/5 text-white/30 hover:text-[#FF4500] hover:bg-[#FF4500]/10 transition-all"
                    >
                      {copiedId === check.category ? <CheckCircle2 size={14} className="text-success" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {/* All passing */}
              {!check.warning && !check.fix && (!check.results || check.results.every((r: any) => r.passed)) && (
                <div className="flex items-center gap-2 text-success text-sm">
                  <CheckCircle2 size={16} />
                  <span>All checks passed — this category is agent-ready.</span>
                </div>
              )}
            </div>
          </motion.div>
        );
      })}

      {/* ── README Badge Embed Card ──────────────────────── */}
    </motion.div>
  </div>

  {/* ── Overlay Popups ─────────────────────────────────── */}
  <AnimatePresence>
      {activeModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-center justify-center bg-[#020617]/85 backdrop-blur-md p-4 md:p-6"
        >
          {/* Modal Box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            className="bg-[#0F172A] border border-white/10 w-full max-w-3xl max-h-[85vh] rounded-2xl flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.6)] overflow-hidden"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-[#020617]/40">
              <div className="flex items-center gap-3">
                <span className="text-xl">{activeModal === 'problems' ? '🚨' : '🛠️'}</span>
                <h3 className="text-lg font-black text-white uppercase tracking-wider font-mono">
                  {activeModal === 'problems' ? 'Problems Audit Summary' : 'Implementation Fix Guide'}
                </h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-2 rounded-xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
              {activeModal === 'problems' ? (
                // Problems Content
                <div className="space-y-6 text-left">
                  <p className="text-sm text-white/60 leading-relaxed font-sans">
                    Below is the comprehensive list of all detected issues that prevent AI agents from parsing, navigating, or utilizing your documentation correctly:
                  </p>

                  <div className="space-y-4">
                    {checks.map((check) => {
                      const failedChecks = check.results?.filter((r: any) => !r.passed) || [];
                      const hasCategoryLevelIssue = check.score < check.maxScore && (!check.results || failedChecks.length > 0 || check.warning || check.fix);

                      if (!hasCategoryLevelIssue) return null;

                      const meta = CATEGORY_LABELS[check.category] || { label: check.category, icon: '📊' };

                      return (
                        <div key={check.category} className="border border-white/5 bg-white/[0.01] rounded-xl p-5 space-y-3">
                          <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                            <span className="text-base">{meta.icon}</span>
                            <h4 className="font-bold text-sm text-white uppercase tracking-wide">{meta.label}</h4>
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 ml-auto">
                              Deducted: {check.maxScore - check.score} pts
                            </span>
                          </div>

                          {check.warning && (
                            <div className="text-xs text-white/30 bg-white/[0.02] border border-white/5 rounded-lg p-3">
                              Analyzed via structural heuristics
                            </div>
                          )}

                          <div className="space-y-2">
                            {check.results ? (
                              failedChecks.map((r: any) => (
                                <div key={r.id} className="text-xs space-y-1">
                                  <div className="flex items-start gap-2 text-white">
                                    <span className="text-red-500 shrink-0 font-bold">✕</span>
                                    <span className="font-semibold">{r.label}</span>
                                  </div>
                                  <p className="text-white/40 pl-4 leading-relaxed">
                                    {r.fix ? 'This check failed because the asset is missing, returns layout boilerplate, or is structured in a non-standard manner for coding agents.' : 'AI agent parser flagged syntactical, placeholder, or dependency incomplete states.'}
                                  </p>
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-white/50 leading-relaxed">
                                {check.fix ? 'Documentation lacks critical elements or exceeds token density limits.' : 'Check scored below threshold.'}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {checks.every(c => c.score === c.maxScore) && (
                      <div className="text-center py-10 space-y-3">
                        <span className="text-4xl">🎉</span>
                        <h4 className="font-black text-white uppercase tracking-wide text-sm">Perfect Score!</h4>
                        <p className="text-xs text-white/40 max-w-xs mx-auto">No problems were detected. Your documentation is 100% agent-native.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // Fixes Content
                <div className="space-y-6 text-left">
                  <p className="text-sm text-white/60 leading-relaxed font-sans">
                    Follow these step-by-step actionable recommendations to resolve all failing audits and make your documentation agent-native:
                  </p>

                  <div className="space-y-4">
                    {checks.map((check) => {
                      const failedChecks = check.results?.filter((r: any) => !r.passed && r.fix) || [];
                      const hasCategoryLevelFix = check.score < check.maxScore && (failedChecks.length > 0 || check.fix);

                      if (!hasCategoryLevelFix) return null;

                      const meta = CATEGORY_LABELS[check.category] || { label: check.category, icon: '📊' };

                      return (
                        <div key={check.category} className="border border-white/5 bg-white/[0.01] rounded-xl p-5 space-y-4">
                          <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                            <span className="text-base">{meta.icon}</span>
                            <h4 className="font-bold text-sm text-white uppercase tracking-wide">{meta.label} Remedies</h4>
                          </div>

                          {/* Category general fix */}
                          {check.fix && !check.results && (
                            <div className="space-y-2">
                              <div className="text-xs font-mono text-[#FF4500] uppercase tracking-wider font-bold">General Remedy:</div>
                              <div className="bg-[#020617] border border-white/5 rounded-lg p-4 relative group/fix overflow-hidden">
                                <pre className="text-xs font-mono text-white/50 whitespace-pre-wrap leading-relaxed select-all pr-10">{check.fix}</pre>
                                <button
                                  onClick={() => handleCopy(check.fix, 'general-' + check.category)}
                                  className="absolute top-3 right-3 p-2 rounded-lg bg-white/5 text-white/30 hover:text-[#FF4500] hover:bg-[#FF4500]/10 transition-all cursor-pointer"
                                >
                                  {copiedId === 'general-' + check.category ? <CheckCircle2 size={13} className="text-success" /> : <Copy size={13} />}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Detailed checks fixes */}
                          {failedChecks.map((r: any) => (
                            <div key={r.id} className="space-y-2">
                              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                <span className="text-[#FF4500]">↳</span> {r.label}
                              </div>
                              <div className="bg-[#020617] border border-white/5 rounded-lg p-4 relative group/fix overflow-hidden">
                                <pre className="text-xs font-mono text-white/50 whitespace-pre-wrap leading-relaxed select-all pr-10">{r.fix}</pre>
                                <button
                                  onClick={() => handleCopy(r.fix, 'modal-' + r.id)}
                                  className="absolute top-3 right-3 p-2 rounded-lg bg-white/5 text-white/30 hover:text-[#FF4500] hover:bg-[#FF4500]/10 transition-all cursor-pointer"
                                >
                                  {copiedId === 'modal-' + r.id ? <CheckCircle2 size={13} className="text-success" /> : <Copy size={13} />}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}

                    {checks.every(c => c.score === c.maxScore) && (
                      <div className="text-center py-10 space-y-3">
                        <span className="text-4xl">🛡️</span>
                        <h4 className="font-black text-white uppercase tracking-wide text-sm">Documentation Fully Optimized!</h4>
                        <p className="text-xs text-white/40 max-w-xs mx-auto">All checks passed successfully. No remedies required.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-white/5 bg-[#020617]/40 flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-widest px-6 py-3 rounded-lg transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
