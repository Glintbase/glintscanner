import type { Metadata } from "next";
import ResultsReport from "@/components/scanner/ResultsReport";
import Link from "next/link";
import { Search } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = 'force-dynamic';

// ─── Helper: derive company name from URL ─────────────────────────────────
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

// ─── Helper: derive score band label ──────────────────────────────────────
function scoreBand(score: number): string {
  if (score >= 76) return 'Agent-Native';
  if (score >= 41) return 'AI-Friendly';
  return 'Legacy Docs';
}

// ─── Dynamic SEO metadata ─────────────────────────────────────────────────
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('public_scans')
    .select('url, score')
    .eq('id', params.id)
    .single();

  if (!data) {
    return {
      title: 'Scan Not Found',
      description: 'This scan report could not be found.',
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
      url: `https://scan.glintbase.xyz/scan/${params.id}`,
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
      canonical: `https://scan.glintbase.xyz/scan/${params.id}`,
    },
  };
}

// ─── Page Component ───────────────────────────────────────────────────────
export default async function PublicScanPage({ params }: { params: { id: string } }) {
  let score = 0;
  let checks: any[] = [];
  let error = null;
  let url = '';

  try {
    const supabase = createServerSupabaseClient();
    const { data, error: dbError } = await supabase
      .from('public_scans')
      .select('*')
      .eq('id', params.id)
      .single();

    if (dbError || !data) {
      error = "Scan not found";
    } else {
      score = data.score;
      checks = data.checks;
      url = data.url;
    }
  } catch (err: any) {
    error = err.message;
  }

  if (error) {
    return (
      <main className="flex-1 flex flex-col items-center pt-32 pb-12 px-4 w-full">
        <div className="w-full max-w-3xl text-center space-y-6">
          <h1 className="text-3xl font-black text-white uppercase tracking-tight">Scan Not Found</h1>
          <p className="text-white/40">The scan report with ID <code className="text-white/60 font-mono">{params.id}</code> could not be found.</p>
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

  const company = deriveCompany(url);

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
        url: `https://scan.glintbase.xyz/scan/${params.id}`,
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
          <p className="text-white/40 font-mono text-xs">ID: {params.id}</p>
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

      <ResultsReport score={score} checks={checks} scanId={params.id} />
    </main>
  );
}
