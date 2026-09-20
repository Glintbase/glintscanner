import type { Metadata } from "next";
import ResultsReport from "@/components/scanner/ResultsReport";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { notFound } from "next/navigation";
import { getScanBySlug, deriveCompany } from "@/lib/resolveSlug";
import { scoreBandLabel } from "@/lib/scanner/shared";
import ShareScorecard from "@/components/scanner/ShareScorecard";

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  // Prevent catching system files or assets
  if (params.slug.includes('.') || ['favicon.ico', 'robots.txt', 'sitemap.xml', 'icon.svg', 'leaderboard', 'api'].includes(params.slug)) {
    return {};
  }

  const data = await getScanBySlug(params.slug);

  if (!data) {
    return {
      title: 'Scan Not Found / Invalid Domain — Glintbase',
      description: 'The requested AI agent readiness audit could not be found.',
    };
  }

  const company = deriveCompany(data.url);
  const band = scoreBandLabel(data.score);

  return {
    title: `${company} Agent Readiness Audit`,
    description: `${company} scored ${data.score}/100 for AI Agent Readiness (${band}). Analyze documentation discoverability, semantic context, MCP compatibility, and tool integrations.`,
    openGraph: {
      title: `${company} Agent Readiness Audit — Glintbase`,
      description: `${company} scored ${data.score}/100 for AI Agent Readiness. Analyze MCP support, semantic structure, documentation discoverability, and retrieval compatibility.`,
      url: `https://scan.glintbase.dev/scan/${params.slug}`,
      siteName: 'Glintbase Scanner',
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${company} scored ${data.score}/100 — AI Agent Readiness`,
      description: `${company}'s documentation band is ${band}. Scanned by Glintbase.`,
      creator: '@glintbase',
      site: '@glintbase',
    },
    alternates: {
      canonical: `https://scan.glintbase.dev/scan/${params.slug}`,
    },
  };
}

export default async function DynamicSlugScanPage({ params }: { params: { slug: string } }) {
  // Prevent matching static or layout assets
  if (params.slug.includes('.') || ['favicon.ico', 'robots.txt', 'sitemap.xml', 'icon.svg'].includes(params.slug)) {
    notFound();
  }

  const data = await getScanBySlug(params.slug);

  if (!data) {
    return (
      <main className="flex-1 flex flex-col items-center pt-32 pb-12 px-4 w-full">
        <div className="w-full max-w-3xl text-center space-y-6">
          <h1 className="text-3xl font-black text-white uppercase tracking-tight">Scan Not Found / Invalid Domain</h1>
          <p className="text-white/40">No active readiness audit found for slug: <code className="text-white/60 font-mono">{params.slug}</code>.</p>
          <Link 
            href="/"
            className="inline-flex items-center gap-2 bg-[#FF3300] text-white px-6 py-3 rounded-lg hover:bg-[#FF3300]/90 transition-all font-bold uppercase tracking-wider text-xs"
          >
            Run a New Scan
          </Link>
        </div>
      </main>
    );
  }

  const company = deriveCompany(data.url);
  const score = data.score;
  const checks = data.checks;
  const url = data.url;

  // JSON-LD Structured Data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'Glintbase',
        url: 'https://glintbase.dev',
        description: 'Infrastructure for AI-agent-ready repositories and documentation.',
        sameAs: ['https://twitter.com/glintbase'],
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Glintbase Scanner',
        url: 'https://scan.glintbase.dev',
        applicationCategory: 'DeveloperApplication',
        description: 'AI Agent Readiness Scanner for developer platforms, SDKs, APIs, and repositories.',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
      {
        '@type': 'TechArticle',
        headline: `${company} AI Agent Readiness Audit`,
        url: `https://scan.glintbase.dev/scan/${params.slug}`,
        description: `${company} scored ${score}/100 for AI Agent Readiness.`,
        author: {
          '@type': 'Organization',
          name: 'Glintbase',
        },
        publisher: {
          '@type': 'Organization',
          name: 'Glintbase',
        },
      },
    ],
  };

  return (
    <main className="flex-1 flex flex-col items-center pt-20 sm:pt-24 pb-12 px-0 sm:px-4 w-full min-w-0 max-w-full">
      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {data.score_version !== 'ars-3.0.0' && (
        <div className="w-full max-w-3xl mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                Legacy Audit Detected (Pre-ARS 3.0)
              </div>
              <p className="text-xs text-white/70">
                This audit was calculated using an older scoring model. Upgrade to ARS 3.0 Standard to evaluate 119 discrete checks, dynamic archetype denominators, and live Flight Simulator testing.
              </p>
            </div>
          </div>
          <Link
            href={`/?url=${encodeURIComponent(url)}`}
            className="shrink-0 px-4 py-2 rounded-lg bg-[#FF3300] hover:bg-[#FF3300]/90 text-white text-xs font-bold uppercase tracking-wider transition shadow-md whitespace-nowrap"
          >
            Re-scan with ARS 3.0
          </Link>
        </div>
      )}

      <ResultsReport score={score} checks={checks} scanId={data.id} url={url} />

      <ShareScorecard
        slug={params.slug}
        company={company}
        score={score}
        band={scoreBandLabel(score)}
      />
    </main>
  );
}

