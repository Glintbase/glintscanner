import type { Metadata } from 'next';
import FlightSimulatorCockpit from '@/components/scanner/FlightSimulatorCockpit';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Simulate',
  description:
    'Walk your site the way coding agents look for docs. Every step is a real request: see statuses, dead ends and which agent files are missing.',
  openGraph: {
    title: 'Simulate — Glintbase',
    description:
      'A navigation probe for agent readiness: real requests, measured statuses and times, dead ends and missing agent files, with suggested fixes.',
    url: 'https://scan.glintbase.dev/simulate',
    siteName: 'Glintbase Scanner',
  },
};

export default function SimulatePage({
  searchParams,
}: {
  searchParams: { target?: string; agent?: string; url?: string };
}) {
  const initialTarget = searchParams.target || searchParams.url || '';

  return (
    <main className="flex-1 flex flex-col items-center pt-20 pb-20 px-4 sm:px-6 w-full min-h-screen bg-[#0A0A0B] relative selection:bg-[#FF3300]/30 selection:text-white">
      {/* Subtle ambient lighting at top */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(255,51,0,0.04),transparent)] pointer-events-none" />

      <div className="w-full max-w-5xl mb-6 flex items-center justify-between relative z-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-[#121214] hover:bg-[#18181B] text-white/60 hover:text-white text-xs font-mono transition-transform duration-150 active:scale-[0.96] uppercase tracking-wider"
        >
          <ArrowLeft size={13} className="text-[#FF3300]" />
          <span>Back to ARS Scanner</span>
        </Link>
      </div>

      <FlightSimulatorCockpit initialTarget={initialTarget} />
    </main>
  );
}
