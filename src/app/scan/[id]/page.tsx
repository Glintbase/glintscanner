import ResultsReport from "@/components/scanner/ResultsReport";
import Link from "next/link";
import { Search } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = 'force-dynamic';

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

  return (
    <main className="flex-1 flex flex-col items-center pt-24 pb-12 px-4 w-full">
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
