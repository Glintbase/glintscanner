import { supabase } from "@/lib/supabase/client";
import { badgeColorForScore } from "@/lib/scanner/shared";

export const runtime = 'edge';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  let score: number | null = null;

  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://mock.supabase.co') {
      const { data, error } = await supabase
        .from('public_scans')
        .select('score')
        .eq('id', params.id)
        .maybeSingle();

      if (!error && data && typeof data.score === 'number') {
        score = data.score;
      }
    }
  } catch (err) {
    console.error('Badge score fetch error:', err);
  }

  // Unknown scan id: render a grey "not scanned" badge (embeds must still get an
  // image), never a made-up score. Cached briefly so a new scan shows up soon.
  const found = score !== null;
  const value = found ? `${score}/100` : 'not scanned';
  const color = found ? badgeColorForScore(score as number) : '#9CA3AF';
  const valueWidth = found ? 50 : 72;
  const width = 110 + valueWidth;
  const valueX = 110 + valueWidth / 2;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="agent-readiness: ${value}">
      <linearGradient id="b" x2="0" y2="100%">
        <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
        <stop offset="1" stop-opacity=".1"/>
      </linearGradient>
      <clipPath id="a">
        <rect width="${width}" height="20" rx="3" fill="#fff"/>
      </clipPath>
      <g clip-path="url(#a)">
        <rect width="110" height="20" fill="#0F172A"/>
        <rect x="110" width="${valueWidth}" height="20" fill="${color}"/>
        <rect width="${width}" height="20" fill="url(#b)"/>
      </g>
      <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="10" font-weight="bold">
        <text x="55" y="15" fill="#010101" fill-opacity=".3">agent-readiness</text>
        <text x="55" y="14" fill="#F1F5F9">agent-readiness</text>
        <text x="${valueX}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
        <text x="${valueX}" y="14" fill="#020617">${value}</text>
      </g>
    </svg>
  `;

  return new Response(svg.trim(), {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': found
        ? 'public, max-age=3600, s-maxage=3600'
        : 'public, max-age=300, s-maxage=300',
    },
  });
}
