import { supabase } from "@/lib/supabase/client";
import { badgeColorForScore } from "@/lib/scanner/shared";

export const runtime = 'edge';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  let score = 0;
  let found = false;

  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://mock.supabase.co') {
      const { data, error } = await supabase
        .from('public_scans')
        .select('score')
        .eq('id', params.id)
        .single();

      if (!error && data) {
        score = data.score;
        found = true;
      }
    }
  } catch (err) {
    console.error('Badge score fetch error:', err);
  }

  // Demo fallbacks only when DB has no row (not used as production scores for real IDs)
  if (!found) {
    const demos: Record<string, number> = {
      stripe: 95,
      twilio: 88,
      supabase: 74,
      vercel: 38,
    };
    score = demos[params.id] ?? 0;
  }

  const color = badgeColorForScore(score);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="20">
      <linearGradient id="b" x2="0" y2="100%">
        <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
        <stop offset="1" stop-opacity=".1"/>
      </linearGradient>
      <clipPath id="a">
        <rect width="160" height="20" rx="3" fill="#fff"/>
      </clipPath>
      <g clip-path="url(#a)">
        <rect width="110" height="20" fill="#0F172A"/>
        <rect x="110" width="50" height="20" fill="${color}"/>
        <rect width="160" height="20" fill="url(#b)"/>
      </g>
      <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="10" font-weight="bold">
        <text x="55" y="15" fill="#010101" fill-opacity=".3">agent-readiness</text>
        <text x="55" y="14" fill="#F1F5F9">agent-readiness</text>
        <text x="135" y="15" fill="#010101" fill-opacity=".3">${score}/100</text>
        <text x="135" y="14" fill="#020617">${score}/100</text>
      </g>
    </svg>
  `;

  return new Response(svg.trim(), {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
