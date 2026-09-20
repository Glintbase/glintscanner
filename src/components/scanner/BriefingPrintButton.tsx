"use client";

import { Download } from 'lucide-react';

interface BriefingPrintButtonProps {
  url?: string;
  scanId?: string;
  companySlug?: string;
  score?: number;
}

export default function BriefingPrintButton({
  url,
  scanId,
  companySlug,
  score,
}: BriefingPrintButtonProps) {
  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <button
      onClick={handlePrint}
      title="Download executive report as PDF"
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FF3300] hover:bg-[#FF3300]/90 text-white text-xs font-bold uppercase tracking-wider transition shadow-sm cursor-pointer select-none"
    >
      <Download className="w-3.5 h-3.5" />
      <span>Download PDF</span>
    </button>
  );
}

