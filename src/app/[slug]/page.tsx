import type { Metadata } from "next";
import ResultsReport from "@/components/scanner/ResultsReport";
import Link from "next/link";
import { Search } from "lucide-react";
import { getScanBySlug, deriveCompany } from "@/lib/resolveSlug";

export const dynamic = 'force-dynamic';

function scoreBand(score: number): string {
  if (score >= 76) return 'Agent-Native';
  if (score >= 41) return 'AI-Friendly';
  return 'Legacy Docs';
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  // Prevent catching system files or assets
  if (['favicon.ico', 'robots.txt', 'sitemap.xml', 'icon.svg', 'leaderboard', 'api'].includes(params.slug)) {
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
  const band = scoreBand(data.score);

  return {
    title: `${company} Agent Readiness Audit`,
    description: `${company} scored ${data.score}/100 for AI Agent Readiness (${band}). Analyze documentation discoverability, semantic context, MCP compatibility, and tool integrations.`,
    openGraph: {
      title: `${company} Agent Readiness Audit — Glintbase`,
      description: `${company} scored ${data.score}/100 for AI Agent Readiness. Analyze MCP support, semantic structure, documentation discoverability, and retrieval compatibility.`,
      url: `https://scan.glintbase.xyz/${params.slug}`,
      siteName: 'Glintbase Scanner',
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${company} scored ${data.score}/100 — AI Agent Readiness`,
      description: `${company}'s documentation ${band === 'Agent-Native' ? 'is fully agent-native' : band === 'AI-Friendly' ? 'is AI-friendly but needs work' : 'needs significant improvement'}. Scanned by Glintbase.`,
      creator: '@glintbase',
      site: '@glintbase',
    },
    alternates: {
      canonical: `https://scan.glintbase.xyz/${params.slug}`,
    },
  };
}

export default async function DynamicSlugScanPage({ params }: { params: { slug: string } }) {
  // Prevent matching static or layout assets
  if (['favicon.ico', 'robots.txt', 'sitemap.xml', 'icon.svg'].includes(params.slug)) {
    return null;
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
            className="inline-flex items-center gap-2 bg-[#FF4500] text-white px-6 py-3 rounded-lg hover:bg-[#FF4500]/90 transition-all font-bold uppercase tracking-wider text-xs"
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
        url: 'https://glintbase.xyz',
        description: 'Infrastructure for AI-agent-ready repositories and documentation.',
        sameAs: ['https://twitter.com/glintbase'],
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Glintbase Scanner',
        url: 'https://scan.glintbase.xyz',
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
        url: `https://scan.glintbase.xyz/${params.slug}`,
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
    <main className="flex-1 flex flex-col items-center pt-24 pb-12 px-4 w-full">
      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="w-full max-w-3xl mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tight mb-2">Scan Results: {url}</h1>
          <p className="text-white/40 font-mono text-xs">Vanity URL: scan.glintbase.xyz/{params.slug}</p>
        </div>
        <div className="flex items-center gap-6">
          <Link 
            href="/leaderboard"
            className="text-white/40 hover:text-white flex items-center gap-2 font-bold transition-colors uppercase tracking-wider text-xs"
          >
            Leaderboard
          </Link>
          <Link 
            href="/"
            className="text-[#FF4500] hover:text-[#FF4500]/80 flex items-center gap-2 font-bold transition-colors uppercase tracking-wider text-xs"
          >
            <Search size={14} />
            New Scan
          </Link>
        </div>
      </div>

      <ResultsReport score={score} checks={checks} scanId={data.id} url={url} />
    </main>
  );
}
