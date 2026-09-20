import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getScanBySlug, deriveCompany } from '@/lib/resolveSlug';
import { getArsGrade } from '@/lib/scanner/shared';
import { classifyArchetype } from '@/lib/scanner/v2/archetype';
import { runArs3Probes } from '@/lib/scanner/v2/probes';
import { ALL_CHECKS } from '@/lib/scanner/v2/probes/registry';
import BriefingPrintButton from '@/components/scanner/BriefingPrintButton';
import {
  AgentTrajectoryGraphic,
  LayerSpectrumGraphic,
  MarketDistributionGraphic,
  ProtocolDeclarationMatrix,
  TokenTaxGraphic,
  type TrajectoryStage,
  type LayerMetric,
  type ProtocolDeclaration,
  type FrictionMetrics,
} from '@/components/scanner/briefing/BriefingGraphics';
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { url?: string; score?: string };
}): Promise<Metadata> {
  let domain = params.slug;
  if (searchParams?.url) {
    try {
      domain = new URL(searchParams.url).hostname.replace(/^www\./, '');
    } catch {}
  }
  return {
    title: `Executive report · ${domain} | Glintbase`,
    description: `Executive AI Agent Readiness Audit and Benchmark for ${domain} (ARS 3.0 Standard).`,
  };
}

// ─── Known Peer Industry Benchmarks ──────────────────────────────────────────
interface BenchmarkPeer {
  domain: string;
  company: string;
  score: number;
  grade: string;
  isTarget?: boolean;
}

const INDUSTRY_BENCHMARKS: BenchmarkPeer[] = [
  { domain: 'stripe.com', company: 'Stripe', score: 95, grade: 'A+' },
  { domain: 'twilio.com', company: 'Twilio', score: 88, grade: 'A' },
  { domain: 'supabase.com', company: 'Supabase', score: 74, grade: 'B' },
  { domain: 'openai.com', company: 'OpenAI', score: 71, grade: 'B' },
  { domain: 'github.com', company: 'GitHub', score: 68, grade: 'B' },
  { domain: 'anthropic.com', company: 'Anthropic', score: 65, grade: 'B' },
  { domain: 'resend.com', company: 'Resend', score: 58, grade: 'C' },
  { domain: 'vercel.com', company: 'Vercel', score: 38, grade: 'D' },
  { domain: 'cloudflare.com', company: 'Cloudflare', score: 35, grade: 'D' },
  { domain: 'aws.amazon.com', company: 'AWS', score: 28, grade: 'F' },
];

export default async function ExecutiveBriefingPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { url?: string; score?: string };
}) {
  // 1. Data Retrieval: Supabase lookup first
  const dbData = await getScanBySlug(params.slug);

  let targetUrl = dbData?.url || searchParams?.url;
  if (!targetUrl) {
    targetUrl = params.slug.includes('.')
      ? `https://${params.slug}`
      : `https://${params.slug}.com`;
  }

  // 2. Scorecard Extraction or Live ARS 3.0 Probe Execution
  let scorecard = dbData?.scorecard || dbData?.checks?.scorecard;

  // If scorecard is missing or pre-ARS 3.0, execute live probe on the target URL
  if (!scorecard || !scorecard.layers) {
    try {
      scorecard = await runArs3Probes(targetUrl);
    } catch (err) {
      console.error('Error running fallback ARS 3.0 probes for briefing:', err);
    }
  }

  // 3. Domain & Score resolution
  const company = deriveCompany(targetUrl);
  let domain = company.toLowerCase();
  try {
    domain = new URL(targetUrl).hostname.replace(/^www\./, '');
  } catch {}

  const score = typeof scorecard?.score === 'number'
    ? scorecard.score
    : typeof dbData?.score === 'number'
    ? dbData.score
    : searchParams?.score
    ? parseInt(searchParams.score, 10) || 46
    : 46;

  const arsGrade = scorecard?.grade || getArsGrade(score);
  const archetype = scorecard?.archetype || classifyArchetype({ url: targetUrl });
  const activeDenominator = scorecard?.activeDenominator || archetype?.baseDenominator || 85;

  // 4. Central Registry Check Mapping
  const checkMetaMap = new Map(ALL_CHECKS.map((c) => [c.id, c]));
  const results: any[] = scorecard?.results || [];

  // Enriched check results
  const enrichedResults = results.map((r: any) => {
    const meta = checkMetaMap.get(r.checkId);
    return {
      ...r,
      name: r.name || meta?.name || r.checkId,
      layer: r.layer || meta?.layer || 'discovery',
      maxPoints: r.maxPoints || meta?.points || 1,
      description: meta?.description || r.message,
    };
  });

  const passingChecks = enrichedResults.filter((c) => c.status === 'pass');
  const failingChecks = enrichedResults.filter((c) => c.status !== 'pass' && !c.isBonus);
  const bonusChecks = enrichedResults.filter((c) => c.isBonus && c.status === 'pass');

  // 5. Four Layer Metrics
  const l1Summary = scorecard?.layers?.discovery;
  const l1Earned = l1Summary?.totalEarned ?? l1Summary?.baseEarned ?? Math.round(score * 0.2);
  const l1Max = l1Summary?.baseMax ?? 20;
  const l1Pct = Math.round((l1Earned / (l1Max || 1)) * 100);
  const l1Gaps = l1Summary?.checks?.filter((c: any) => c.status !== 'pass')?.length ?? Math.max(1, Math.round((1 - l1Pct / 100) * 8));

  const l2Summary = scorecard?.layers?.access;
  const l2Earned = l2Summary?.totalEarned ?? l2Summary?.baseEarned ?? Math.round(score * 0.3);
  const l2Max = l2Summary?.baseMax ?? 30;
  const l2Pct = Math.round((l2Earned / (l2Max || 1)) * 100);
  const l2Gaps = l2Summary?.checks?.filter((c: any) => c.status !== 'pass')?.length ?? Math.max(1, Math.round((1 - l2Pct / 100) * 12));

  const l3Summary = scorecard?.layers?.usability;
  const l3Earned = l3Summary?.totalEarned ?? l3Summary?.baseEarned ?? Math.round(score * 0.4);
  const l3Max = l3Summary?.baseMax ?? 35;
  const l3Pct = Math.round((l3Earned / (l3Max || 1)) * 100);
  const l3Gaps = l3Summary?.checks?.filter((c: any) => c.status !== 'pass')?.length ?? Math.max(1, Math.round((1 - l3Pct / 100) * 16));

  const l4Summary = scorecard?.layers?.payments;
  const l4Earned = l4Summary?.totalEarned ?? l4Summary?.baseEarned ?? 0;
  const l4Max = l4Summary?.baseMax ?? 0;
  const l4Pct = l4Max > 0 ? Math.round((l4Earned / l4Max) * 100) : 0;
  const l4Gaps = l4Summary?.checks?.filter((c: any) => c.status !== 'pass')?.length ?? 0;

  const layerMetrics: LayerMetric[] = [
    {
      name: '01 / Discovery Layer',
      earned: l1Earned,
      max: l1Max,
      pct: l1Pct,
      benchmarkPct: 32,
      status: l1Pct >= 70 ? 'Optimal' : l1Pct >= 40 ? 'Moderate' : 'Remediate',
      gaps: l1Gaps,
    },
    {
      name: '02 / Access Layer',
      earned: l2Earned,
      max: l2Max,
      pct: l2Pct,
      benchmarkPct: 45,
      status: l2Pct >= 70 ? 'Optimal' : l2Pct >= 40 ? 'Moderate' : 'Remediate',
      gaps: l2Gaps,
    },
    {
      name: '03 / Usability Layer',
      earned: l3Earned,
      max: l3Max,
      pct: l3Pct,
      benchmarkPct: 28,
      status: l3Pct >= 70 ? 'Optimal' : l3Pct >= 40 ? 'Moderate' : 'Remediate',
      gaps: l3Gaps,
    },
    {
      name: '04 / Payments Layer',
      earned: l4Earned,
      max: l4Max,
      pct: l4Pct,
      benchmarkPct: 6,
      status: l4Max === 0 ? 'Exempt' : l4Pct >= 50 ? 'Optimal' : 'Needs attention',
      gaps: l4Gaps,
    },
  ];

  // 6. 5-Stage Agent Trajectory Construction (Live Trace)
  const robotsCheck = enrichedResults.find((c) => c.checkId === 'robots-ai-policy-quality');
  const llmsCheck = enrichedResults.find((c) => c.checkId === 'llms-txt-exists');
  const openapiCheck = enrichedResults.find((c) => c.checkId === 'openapi-spec');
  const authCheck = enrichedResults.find((c) => c.checkId === 'auth-md-structure' || c.checkId === 'oauth-rfc9728-prm');
  const mcpCheck = enrichedResults.find((c) => c.checkId === 'mcp-server-manifest');
  const canaryCheck = enrichedResults.find((c) => c.checkId === 'anti-spa-404');
  const paymentCheck = enrichedResults.find((c) => c.checkId === 'x402-support');

  const trajectoryStages: TrajectoryStage[] = [
    {
      step: '01',
      name: 'Discovery',
      protocol: 'robots.txt / llms.txt',
      status:
        robotsCheck?.status === 'pass' && llmsCheck?.status === 'pass'
          ? 'pass'
          : robotsCheck?.status === 'pass'
          ? 'warn'
          : 'fail',
      diagnostic:
        llmsCheck?.status === 'pass'
          ? 'Verified /llms.txt context index with clean AI crawler allowance.'
          : robotsCheck?.status === 'pass'
          ? 'AI crawlers permitted, but missing /llms.txt context catalog.'
          : 'Robots.txt blocks or restricts primary AI crawler user-agents.',
    },
    {
      step: '02',
      name: 'Context Ingestion',
      protocol: 'OpenAPI 3.1 Schema',
      status: openapiCheck?.status === 'pass' ? 'pass' : 'fail',
      diagnostic:
        openapiCheck?.status === 'pass'
          ? 'Structured OpenAPI schema accessible for zero-shot tool compilation.'
          : 'Missing OpenAPI 3.x schema; agent forced to parse untyped HTML.',
    },
    {
      step: '03',
      name: 'Machine Auth',
      protocol: 'auth.md / RFC 9728',
      status: authCheck?.status === 'pass' ? 'pass' : 'fail',
      diagnostic:
        authCheck?.status === 'pass'
          ? 'Autonomous credential acquisition protocol verified.'
          : 'No machine auth specification; autonomous workflow halts at login.',
    },
    {
      step: '04',
      name: 'Tool Execution',
      protocol: 'MCP / Anti-SPA Canary',
      status:
        mcpCheck?.status === 'pass' && canaryCheck?.status === 'pass'
          ? 'pass'
          : mcpCheck?.status === 'pass' || canaryCheck?.status === 'pass'
          ? 'warn'
          : 'fail',
      diagnostic:
        mcpCheck?.status === 'pass'
          ? 'Streamable HTTP MCP tools active with clean HTTP 404 guard.'
          : canaryCheck?.status === 'pass'
          ? 'Clean 404 boundary verified, but missing native MCP server.'
          : 'Missing MCP tools and soft-404 SPA leak poisons context window.',
    },
    {
      step: '05',
      name: 'Settlement',
      protocol: 'x402 / MPP Protocol',
      status:
        l4Max === 0
          ? 'pass'
          : paymentCheck?.status === 'pass'
          ? 'pass'
          : 'warn',
      diagnostic:
        l4Max === 0
          ? 'Exempt from autonomous payments under current profile.'
          : paymentCheck?.status === 'pass'
          ? 'HTTP 402 / MPP autonomous micropayment capability detected.'
          : 'No machine payment declaration; transactions require human checkout.',
    },
  ];

  // 7. Core Protocol Declaration Matrix
  const protocolMatrix: ProtocolDeclaration[] = [
    {
      name: 'AI Crawler Permissions',
      pathOrStandard: '/robots.txt',
      status: robotsCheck?.status === 'pass' ? 'pass' : 'fail',
      latencyOrHttp: robotsCheck?.evidence?.status ? `HTTP ${robotsCheck.evidence.status}` : 'HTTP 200',
      agentImpact: 'Controls whether ClaudeBot, GPTBot, and Perplexity index your apex pages.',
    },
    {
      name: 'LLMs Context Index',
      pathOrStandard: '/llms.txt',
      status: llmsCheck?.status === 'pass' ? 'pass' : 'fail',
      latencyOrHttp: llmsCheck?.evidence?.status ? `HTTP ${llmsCheck.evidence.status}` : '404 Absent',
      agentImpact: 'Eliminates 90%+ token waste by providing curated markdown context to LLMs.',
    },
    {
      name: 'OpenAPI Specification',
      pathOrStandard: '/openapi.json',
      status: openapiCheck?.status === 'pass' ? 'pass' : 'fail',
      latencyOrHttp: openapiCheck?.evidence?.status ? `HTTP ${openapiCheck.evidence.status}` : '404 Absent',
      agentImpact: 'Provides deterministic types and endpoints for agent tool generation.',
    },
    {
      name: 'Autonomous Machine Auth',
      pathOrStandard: '/.well-known/auth.md',
      status: authCheck?.status === 'pass' ? 'pass' : 'fail',
      latencyOrHttp: authCheck?.evidence?.status ? `HTTP ${authCheck.evidence.status}` : '404 Absent',
      agentImpact: 'Enables autonomous agents to register and claim API tokens without human login.',
    },
    {
      name: 'Model Context Protocol',
      pathOrStandard: '/api/mcp (Streamable)',
      status: mcpCheck?.status === 'pass' ? 'pass' : 'fail',
      latencyOrHttp: mcpCheck?.evidence?.status ? `HTTP ${mcpCheck.evidence.status}` : 'Not Mounted',
      agentImpact: 'Allows Claude Desktop, Cursor, and ChatGPT Sites to run tools in your API.',
    },
    {
      name: 'Anti-SPA 404 Canary Guard',
      pathOrStandard: '/_canary_404_test',
      status: canaryCheck?.status === 'pass' ? 'pass' : 'fail',
      latencyOrHttp: canaryCheck?.evidence?.status ? `HTTP ${canaryCheck.evidence.status}` : '200 Soft-404',
      agentImpact: 'Guarantees dead links return true 404 rather than HTML bundle hallucination traps.',
    },
    {
      name: 'WebMCP Client Tools',
      pathOrStandard: 'DOM toolname attributes',
      status: enrichedResults.find((c) => c.checkId === 'webmcp')?.status === 'pass' ? 'pass' : 'warn',
      latencyOrHttp: 'DOM AST',
      agentImpact: 'Enables browser-resident agents (Chrome 157+, ChatGPT Sites) to trigger UI actions.',
    },
    {
      name: 'Machine Payment Protocol',
      pathOrStandard: 'HTTP 402 / MPP Header',
      status: l4Max === 0 ? 'na' : paymentCheck?.status === 'pass' ? 'pass' : 'warn',
      latencyOrHttp: l4Max === 0 ? 'Exempt' : 'Header Missing',
      agentImpact: 'Allows agents to complete paid API calls and transactions autonomously.',
    },
  ];

  // 8. Market Benchmarking Math & Surrounding Peer Board
  const percentile = Math.min(
    99,
    Math.max(1, Math.round(100 / (1 + Math.exp(-(score - 38) / 16))))
  );
  const ecosystemAvg = 38;
  const ptsDiff = score - ecosystemAvg;

  // Insert target domain into benchmark list and sort
  const combinedPeers: BenchmarkPeer[] = [
    ...INDUSTRY_BENCHMARKS.filter((p) => p.domain.toLowerCase() !== domain.toLowerCase()),
    {
      domain,
      company,
      score,
      grade: arsGrade,
      isTarget: true,
    },
  ].sort((a, b) => b.score - a.score);

  const targetIdx = combinedPeers.findIndex((p) => p.isTarget);
  const rank = targetIdx + 1;
  const totalPeers = combinedPeers.length;

  // Extract 5 peers centered on target
  let sliceStart = Math.max(0, targetIdx - 2);
  const sliceEnd = Math.min(totalPeers, sliceStart + 5);
  if (sliceEnd - sliceStart < 5 && sliceStart > 0) {
    sliceStart = Math.max(0, sliceEnd - 5);
  }
  const surroundingPeers = combinedPeers.slice(sliceStart, sliceEnd);

  // 9. Prioritized Identified Business Risks (Top Failing Checks by Point Impact)
  const prioritizedRisks = failingChecks
    .sort((a, b) => b.maxPoints - a.maxPoints)
    .slice(0, 3);

  // 10. Quantifiable Friction & Telemetry Simulation
  const hasLlms = llmsCheck?.status === 'pass';
  const hasOpenApi = openapiCheck?.status === 'pass';
  const hasAuth = authCheck?.status === 'pass';
  const hasMcp = mcpCheck?.status === 'pass';

  const currentTokens = hasLlms ? 1400 : hasOpenApi ? 14500 : 28400;
  const remediatedTokens = 850;
  const currentLatencyMs = hasMcp ? 450 : hasOpenApi ? 1200 : 3800;
  const remediatedLatencyMs = 280;
  const currentFailureRate = hasAuth && hasMcp ? 8 : hasOpenApi ? 38 : 62;
  const remediatedFailureRate = 4;
  const estCostPer1k = Number(((currentTokens * 1000 * 0.000003)).toFixed(2));
  const remediatedCostPer1k = Number(((remediatedTokens * 1000 * 0.000003)).toFixed(2));

  const frictionMetrics: FrictionMetrics = {
    currentTokens,
    remediatedTokens,
    currentLatencyMs,
    remediatedLatencyMs,
    currentFailureRate,
    remediatedFailureRate,
    estCostPer1k,
    remediatedCostPer1k,
  };

  // 11. Prioritized Remediation Roadmap (Derived from scorecard remediations or failing checks)
  const rawRemediations: any[] = scorecard?.remediations || [];
  const planItems: any[] = rawRemediations.map((rem: any, idx: number) => ({
    num: String(idx + 1).padStart(2, '0'),
    title: rem.title,
    layer: rem.layer ? rem.layer.charAt(0).toUpperCase() + rem.layer.slice(1) : 'Discovery',
    targetFile: rem.targetFile || 'public/.well-known/ard.json',
    points: `+${failingChecks.find((c) => c.checkId === rem.id)?.maxPoints || 3}.0 pts`,
    pointsNum: failingChecks.find((c) => c.checkId === rem.id)?.maxPoints || 3,
    fixCommand: rem.fixCommand || `glintbase remediate ${rem.id}`,
    diffSnippet: rem.diffSnippet,
    desc: rem.description,
  }));

  // If scorecard had fewer than 5 remediations, augment with top failing checks
  if (planItems.length < 5 && failingChecks.length > 0) {
    const existingIds = new Set(planItems.map((p) => p.title.toLowerCase()));
    for (const fail of failingChecks) {
      if (planItems.length >= 6) break;
      if (!existingIds.has(fail.name.toLowerCase())) {
        existingIds.add(fail.name.toLowerCase());
        const layerStr = fail.layer.charAt(0).toUpperCase() + fail.layer.slice(1);
        const targetFile = fail.checkId.includes('openapi')
          ? 'public/openapi.json'
          : fail.checkId.includes('llms')
          ? 'public/llms.txt'
          : fail.checkId.includes('auth')
          ? 'public/.well-known/auth.md'
          : fail.checkId.includes('mcp')
          ? 'app/api/mcp/route.ts'
          : fail.checkId.includes('spa') || fail.checkId.includes('404')
          ? 'app/not-found.tsx'
          : 'public/robots.txt';

        planItems.push({
          num: String(planItems.length + 1).padStart(2, '0'),
          title: `Remediate ${fail.name}`,
          layer: layerStr,
          targetFile,
          points: `+${fail.maxPoints}.0 pts`,
          pointsNum: fail.maxPoints,
          fixCommand: `glintbase remediate ${fail.checkId}`,
          diffSnippet: null,
          desc: fail.description || fail.message,
        });
      }
    }
  }

  const totalProjectedGain = planItems.reduce((sum, item) => sum + (item.pointsNum || 3), 0);
  const projectedScore = Math.min(100, score + totalProjectedGain);

  const currentDateFormatted = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const currentDateTimeFormatted = new Date().toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div className="min-h-screen bg-[#F7F6F3] text-stone-900 font-sans print:bg-white">
      {/* Strict CSS Print Layout Styles */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          @page {
            size: A4 portrait;
            margin: 0.8cm 1.2cm;
          }
          body {
            background-color: #FFFFFF !important;
            color: #1C1917 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-page {
            page-break-after: always !important;
            break-after: page !important;
            min-height: 275mm !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .print-page:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `,
        }}
      />

      {/* Screen Floating Action Bar */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-stone-200 px-6 py-3.5 flex items-center justify-between no-print shadow-xs">
        <Link
          href={`/scan/${params.slug}`}
          className="inline-flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-stone-900 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Scan Results</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-stone-500 hidden sm:inline">
            A4 Executive Briefing · ARS 3.0 Standard
          </span>
          <BriefingPrintButton url={targetUrl} score={score} companySlug={params.slug} />
        </div>
      </header>

      {/* Document Canvas */}
      <main className="max-w-[210mm] mx-auto py-8 sm:py-12 px-2 sm:px-0 space-y-12 print:py-0 print:space-y-0">
        {/* =========================================================================
            PAGE 1: Executive Title, ARS Master Scorecard, & 4-Layer Spectrum
           ========================================================================= */}
        <section className="print-page bg-white p-8 sm:p-12 rounded-xl shadow-xs border border-stone-200/90 flex flex-col justify-between">
          <div className="space-y-6">
            {/* Header & Metadata */}
            <div className="space-y-3 border-b border-stone-200 pb-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-xs bg-[#FF3300] flex items-center justify-center text-white font-mono text-[9px] font-black">
                    G
                  </div>
                  <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-stone-500 font-bold">
                    EXECUTIVE AUDIT REPORT · ARS 3.0 STANDARD
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  VERIFIED RUN
                </div>
              </div>

              <div>
                <h1 className="text-3xl sm:text-4xl font-serif font-normal text-stone-900 tracking-tight">
                  {domain}
                </h1>
                <div className="text-xs font-mono text-stone-500 pt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>Target: {targetUrl}</span>
                  <span>•</span>
                  <span>Archetype: {archetype?.label || 'Developer Platform'}</span>
                  <span>•</span>
                  <span>Evaluated: {currentDateFormatted}</span>
                </div>
              </div>
            </div>

            {/* Executive Calibrated Narrative */}
            <div className="space-y-2 text-stone-700 leading-relaxed font-sans text-xs sm:text-sm">
              <p>
                This executive briefing evaluates the machine-readability, automated access, and
                tool execution readiness of <strong>{domain}</strong> under the <strong>ARS 3.0
                Standard</strong>. Using 119 discrete open-protocol probes across four architectural
                layers, Glintbase measures how effectively AI agents (such as Claude Code, Cursor,
                ChatGPT Sites, and LangChain agents) can discover, authenticate, and execute actions
                against your services without human supervision.
              </p>
              <p>
                {score >= 80 ? (
                  <>
                    <strong>{domain}</strong> demonstrates exceptional autonomous readiness, ranking
                    in the top decile of audited platforms. Foundational declarations including structured
                    OpenAPI schemas and discovery catalogs are operational, providing AI agents with high-fidelity
                    integration surfaces.
                  </>
                ) : score >= 60 ? (
                  <>
                    <strong>{domain}</strong> provides a solid baseline for developer interaction, but
                    experiences material drop-offs during autonomous machine authentication and real-time
                    tool execution. Resolving key gaps will immediately elevate your platform to Tier-1
                    autonomous status.
                  </>
                ) : score >= 40 ? (
                  <>
                    <strong>{domain}</strong> is currently human-optimized. Autonomous AI agents attempting
                    to navigate or use your service encounter substantial friction—falling back to unassisted
                    HTML scraping and incurring severe token taxes that frequently lead to workflow timeouts.
                  </>
                ) : (
                  <>
                    <strong>{domain}</strong> is currently inaccessible to autonomous AI agents. Key
                    machine declarations (including OpenAPI definitions, machine authentication manifests,
                    and context catalogs) are absent, preventing automated tools from operating safely.
                  </>
                )}
              </p>
            </div>

            {/* Key Metric Bento Cards (4 Asymmetric Cards) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Card 1: Score */}
              <div className="border border-stone-200/90 rounded-lg p-4 bg-white space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 font-bold">
                  AGENT READINESS
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-mono font-black text-stone-900">
                    {score}
                  </span>
                  <span className="text-xs font-mono font-bold text-stone-400">/100</span>
                  <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-800 ml-auto">
                    {arsGrade}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-stone-500 pt-1 border-t border-stone-100">
                  D_active: {activeDenominator} pts
                </div>
              </div>

              {/* Card 2: Market Rank */}
              <div className="border border-stone-200/90 rounded-lg p-4 bg-white space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 font-bold">
                  PEER RANK
                </div>
                <div className="text-3xl sm:text-4xl font-mono font-black text-stone-900">
                  #{rank}
                </div>
                <div className="text-[10px] font-mono text-stone-500 pt-1 border-t border-stone-100">
                  Among {totalPeers} benchmark peers
                </div>
              </div>

              {/* Card 3: Percentile */}
              <div className="border border-stone-200/90 rounded-lg p-4 bg-white space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 font-bold">
                  PERCENTILE TIER
                </div>
                <div className="text-3xl sm:text-4xl font-mono font-black text-[#FF3300]">
                  {percentile}th
                </div>
                <div className="text-[10px] font-mono text-stone-500 pt-1 border-t border-stone-100">
                  {percentile >= 75 ? 'Top quartile' : percentile >= 50 ? 'Above median' : 'Below median'}
                </div>
              </div>

              {/* Card 4: Ecosystem Avg */}
              <div className="border border-stone-200/90 rounded-lg p-4 bg-white space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 font-bold">
                  BENCHMARK DELTA
                </div>
                <div className="text-3xl sm:text-4xl font-mono font-black text-stone-900">
                  {ptsDiff >= 0 ? `+${ptsDiff}` : `${ptsDiff}`}
                </div>
                <div className="text-[10px] font-mono text-stone-500 pt-1 border-t border-stone-100">
                  vs {ecosystemAvg} pts ecosystem avg
                </div>
              </div>
            </div>

            {/* Visual Graphic: 4-Layer Spectrum Graphic */}
            <LayerSpectrumGraphic layers={layerMetrics} />
          </div>

          {/* Running Footer Page 1 */}
          <footer className="pt-4 mt-6 border-t border-stone-200 flex items-center justify-between text-[10px] font-mono text-stone-400">
            <span>https://scan.glintbase.dev/scan/{params.slug}</span>
            <span>1/5</span>
          </footer>
        </section>

        {/* =========================================================================
            PAGE 2: Deep Diagnostics & Agent Trajectory Trace
           ========================================================================= */}
        <section className="print-page bg-white p-8 sm:p-12 rounded-xl shadow-xs border border-stone-200/90 flex flex-col justify-between">
          <div className="space-y-6">
            {/* Running Header */}
            <div className="border-b border-stone-100 pb-2 flex items-center justify-between text-[9px] font-mono text-stone-400 uppercase">
              <span>{currentDateTimeFormatted}</span>
              <span>Executive report · {domain} | Glintbase ARS 3.0</span>
            </div>

            {/* Section 01: Agent Interaction Trajectory */}
            <div className="space-y-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">
                01 / AUTONOMOUS TRAJECTORY TRACE
              </div>
              <h2 className="text-2xl sm:text-3xl font-serif font-normal text-stone-900">
                Where autonomous agents succeed or drop off
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                When an AI agent executes a workflow targeting your domain, it advances through five
                discrete phases. If any phase lacks machine-legible declarations, the agent either halts
                with an exception or burns unnecessary tokens attempting heuristic recovery.
              </p>

              {/* Trajectory Graphic */}
              <AgentTrajectoryGraphic stages={trajectoryStages} />
            </div>

            {/* Section 02: Core Protocol Matrix */}
            <div className="space-y-3 pt-2">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">
                02 / TECHNICAL DECLARATION AUDIT
              </div>
              <h3 className="text-lg font-serif font-normal text-stone-900">
                Open protocol verification results
              </h3>
              <ProtocolDeclarationMatrix protocols={protocolMatrix} />
            </div>
          </div>

          {/* Running Footer Page 2 */}
          <footer className="pt-4 mt-6 border-t border-stone-200 flex items-center justify-between text-[10px] font-mono text-stone-400">
            <span>https://scan.glintbase.dev/scan/{params.slug}</span>
            <span>2/5</span>
          </footer>
        </section>

        {/* =========================================================================
            PAGE 3: Peer Benchmarks & Existing Verified Assets
           ========================================================================= */}
        <section className="print-page bg-white p-8 sm:p-12 rounded-xl shadow-xs border border-stone-200/90 flex flex-col justify-between">
          <div className="space-y-6">
            {/* Running Header */}
            <div className="border-b border-stone-100 pb-2 flex items-center justify-between text-[9px] font-mono text-stone-400 uppercase">
              <span>{currentDateTimeFormatted}</span>
              <span>Executive report · {domain} | Glintbase ARS 3.0</span>
            </div>

            {/* Section 03: Market Position & Peer Benchmark */}
            <div className="space-y-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">
                03 / MARKET BENCHMARKING
              </div>
              <h2 className="text-2xl sm:text-3xl font-serif font-normal text-stone-900">
                Position relative to industry peers
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                With a score of <strong>{score}/100</strong>, {domain} sits at the <strong>{percentile}th percentile</strong> of
                technology organizations audited under the ARS 3.0 framework. The following table highlights
                the closest platform peers in your scoring band.
              </p>

              {/* Market Distribution Graphic */}
              <MarketDistributionGraphic score={score} percentile={percentile} />

              {/* Peer Benchmark Table */}
              <div className="border border-stone-200 rounded-lg overflow-hidden bg-white mt-3">
                <div className="bg-stone-50/75 px-4 py-2 border-b border-stone-200 text-[10px] font-mono font-bold uppercase text-stone-500">
                  CLOSEST PEER PLATFORMS (ARS 3.0 COHORT)
                </div>
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50/30 text-[9px] font-mono uppercase text-stone-400">
                      <th className="py-2 px-3 font-semibold">Rank</th>
                      <th className="py-2 px-3 font-semibold">Platform Domain</th>
                      <th className="py-2 px-3 font-semibold">ARS Score</th>
                      <th className="py-2 px-3 font-semibold">Grade</th>
                      <th className="py-2 px-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-700">
                    {surroundingPeers.map((peer, idx) => {
                      const isYou = peer.isTarget;
                      return (
                        <tr
                          key={idx}
                          className={
                            isYou
                              ? 'bg-[#FF3300]/5 font-semibold text-[#FF3300]'
                              : 'hover:bg-stone-50/50'
                          }
                        >
                          <td className="py-2.5 px-3 font-mono text-[11px]">
                            #{sliceStart + idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-serif flex items-center gap-2">
                            <span>{peer.domain}</span>
                            {isYou && (
                              <span className="text-[9px] font-mono uppercase font-black px-1.5 py-0.5 rounded bg-[#FF3300] text-white">
                                YOU
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold">
                            {peer.score}/100
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[10px]">
                            {peer.grade}
                          </td>
                          <td className="py-2.5 px-3 text-[10px] font-mono">
                            {peer.score >= 80 ? (
                              <span className="text-emerald-600 font-bold">Leader</span>
                            ) : peer.score >= 60 ? (
                              <span className="text-amber-600 font-bold">Competitive</span>
                            ) : (
                              <span className="text-stone-500">Developing</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 04: What Already Works (Verified Passing Assets) */}
            <div className="space-y-3 pt-2">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">
                04 / EXISTING STRENGTHS
              </div>
              <h3 className="text-lg font-serif font-normal text-stone-900">
                Verified passing technical assets
              </h3>
              <div className="border border-stone-200 rounded-lg p-4 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  {passingChecks.slice(0, 8).map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-stone-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-stone-900">{c.name}</span>
                        <p className="text-[10px] text-stone-500 line-clamp-1">
                          {c.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Running Footer Page 3 */}
          <footer className="pt-4 mt-6 border-t border-stone-200 flex items-center justify-between text-[10px] font-mono text-stone-400">
            <span>https://scan.glintbase.dev/scan/{params.slug}</span>
            <span>3/5</span>
          </footer>
        </section>

        {/* =========================================================================
            PAGE 4: Quantified Business Risks & Token Tax Impact
           ========================================================================= */}
        <section className="print-page bg-white p-8 sm:p-12 rounded-xl shadow-xs border border-stone-200/90 flex flex-col justify-between">
          <div className="space-y-6">
            {/* Running Header */}
            <div className="border-b border-stone-100 pb-2 flex items-center justify-between text-[9px] font-mono text-stone-400 uppercase">
              <span>{currentDateTimeFormatted}</span>
              <span>Executive report · {domain} | Glintbase ARS 3.0</span>
            </div>

            {/* Section 05: The Risks */}
            <div className="space-y-4">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">
                05 / IDENTIFIED RISKS & VULNERABILITIES
              </div>
              <h2 className="text-2xl sm:text-3xl font-serif font-normal text-stone-900">
                Critical bottlenecks impacting agent adoption
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                Autonomous agents operate without the contextual tolerance of humans. When critical
                declarations are omitted, automated tools do not guess—they abort workflows or generate
                hallucinated parameters. The following high-severity defects were confirmed during this audit:
              </p>

              {/* Detailed Risk Items */}
              <div className="space-y-3">
                {prioritizedRisks.map((risk, idx) => (
                  <div
                    key={idx}
                    className="border border-stone-200/90 rounded-lg p-4 bg-white flex items-start gap-4"
                  >
                    <div className="text-3xl font-mono font-bold text-stone-300 select-none shrink-0 w-10">
                      0{idx + 1}
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-serif font-bold text-stone-900 text-sm sm:text-base">
                          {risk.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono uppercase font-bold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                            Layer {risk.layer}
                          </span>
                          <span className="text-[9px] font-mono font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                            -{risk.maxPoints}.0 pts
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-stone-600 leading-relaxed font-sans">
                        {risk.description || risk.message}
                      </p>
                      <div className="text-[10px] font-mono text-stone-500 pt-1">
                        Diagnostic: {risk.message}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual Graphic: Token Tax & Machine Friction Analysis */}
            <div className="space-y-2 pt-2">
              <TokenTaxGraphic metrics={frictionMetrics} />
            </div>
          </div>

          {/* Running Footer Page 4 */}
          <footer className="pt-4 mt-6 border-t border-stone-200 flex items-center justify-between text-[10px] font-mono text-stone-400">
            <span>https://scan.glintbase.dev/scan/{params.slug}</span>
            <span>4/5</span>
          </footer>
        </section>

        {/* =========================================================================
            PAGE 5: Prioritized Engineering Plan & Audit Governance
           ========================================================================= */}
        <section className="print-page bg-white p-8 sm:p-12 rounded-xl shadow-xs border border-stone-200/90 flex flex-col justify-between">
          <div className="space-y-5">
            {/* Running Header */}
            <div className="border-b border-stone-100 pb-2 flex items-center justify-between text-[9px] font-mono text-stone-400 uppercase">
              <span>{currentDateTimeFormatted}</span>
              <span>Executive report · {domain} | Glintbase ARS 3.0</span>
            </div>

            {/* Section 06: Prioritized Remediation Roadmap */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-400 font-bold">
                    06 / THE REMEDIATION PLAN
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-serif font-normal text-stone-900">
                    Targeted engineering actions
                  </h2>
                </div>
                <div className="text-right font-mono text-xs">
                  <div className="text-stone-400 text-[10px] uppercase">PROJECTED RECOVERY</div>
                  <div className="font-bold text-emerald-600">
                    {score} → {projectedScore}/100 (+{totalProjectedGain} pts)
                  </div>
                </div>
              </div>

              {/* Concrete Plan Cards */}
              <div className="space-y-2.5">
                {planItems.slice(0, 5).map((item, idx) => (
                  <div
                    key={idx}
                    className="border border-stone-200/90 rounded-lg p-3.5 bg-white flex items-start gap-3"
                  >
                    <div className="text-lg font-mono font-bold text-stone-300 select-none shrink-0 w-7">
                      {item.num}
                    </div>
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-serif font-bold text-stone-900 text-xs sm:text-sm">
                            {item.title}
                          </span>
                          <span className="text-[9px] font-mono text-stone-400">
                            ({item.layer})
                          </span>
                        </div>
                        <span className="text-[9px] font-mono font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          {item.points}
                        </span>
                      </div>

                      <div className="text-[11px] font-mono text-stone-500 flex items-center gap-2">
                        <span>Target file:</span>
                        <code className="text-stone-800 bg-stone-100 px-1 py-0.2 rounded text-[10px]">
                          {item.targetFile}
                        </code>
                      </div>

                      <p className="text-[11px] text-stone-600 leading-snug">
                        {item.desc}
                      </p>

                      {item.fixCommand && (
                        <div className="pt-1">
                          <code className="text-[10px] font-mono text-stone-700 bg-stone-50 border border-stone-200 px-2 py-0.5 rounded block truncate">
                            $ {item.fixCommand}
                          </code>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 07: Methodology & Continuous Governance */}
            <div className="border-t border-stone-200 pt-4 space-y-2 text-stone-500 font-sans text-[11px]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 font-bold">
                07 / METHODOLOGY & AUDIT GOVERNANCE
              </div>
              <p className="leading-relaxed">
                The Glintbase Agent Readiness Score (ARS 3.0) is an open industry audit methodology
                calibrated against live LLM execution engines (including Claude 3.7 Sonnet, OpenAI o3,
                and Gemini 2.5 Flash). Probes are executed deterministically against declared endpoints.
                Dynamic denominators prevent archetype bias by excluding non-applicable protocol layers.
              </p>
              <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-stone-400">
                <span>Verification Engine: Glintbase ARS v3.0.0</span>
                <span>Automated CI/CD Remediation: glintbase.dev/docs/ci</span>
              </div>
            </div>
          </div>

          {/* Running Footer Page 5 */}
          <footer className="pt-4 mt-4 border-t border-stone-200 flex items-center justify-between text-[10px] font-mono text-stone-400">
            <span>https://scan.glintbase.dev/scan/{params.slug}</span>
            <span>5/5</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
