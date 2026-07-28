import { ImageResponse } from 'next/og';
import { getScanBySlug, deriveCompany } from '@/lib/resolveSlug';
import { scoreBand } from '@/lib/scanner/shared';
import { getCompetitiveContext } from '@/lib/getCompetitiveContext';

export const runtime = 'edge';

const size = { width: 1200, height: 630 };

/**
 * Shareable scorecard PNG — a stable, downloadable image URL per scan:
 * /api/scorecard/[slug]. Clones the OG image design language as a scorecard.
 */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  if (['favicon.ico', 'robots.txt', 'sitemap.xml', 'icon.svg', 'leaderboard', 'api'].includes(params.slug)) {
    return new Response('Not Found', { status: 404 });
  }

  const data = await getScanBySlug(params.slug);
  if (!data) {
    return new Response('Not Found', { status: 404 });
  }

  const scanUrl = data.url || 'Unknown';
  const score = data.score ?? 0;
  const company = deriveCompany(scanUrl);
  const band = scoreBand(score);
  let displayDomain = scanUrl;
  try {
    displayDomain = new URL(scanUrl).hostname;
  } catch {
    displayDomain = scanUrl.replace(/^https?:\/\//i, '').split('/')[0];
  }
  displayDomain = displayDomain.toLowerCase().replace(/^www\./i, '');

  // Competitive line ("vs Stripe · 95") — best-effort, never blocks the card
  let vsLine: string | null = null;
  try {
    const ctx = await getCompetitiveContext(scanUrl);
    if (ctx.isLeader) {
      vsLine = '#1 on the Agent Readiness Leaderboard';
    } else if (ctx.leader) {
      vsLine = `vs ${ctx.leader.company} · ${ctx.leader.score}`;
    }
  } catch {
    vsLine = null;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 80px',
          background: '#000000',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Grid pattern */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage:
              'linear-gradient(to right, rgba(30,41,59,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(30,41,59,0.12) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Band-colored glow behind the score */}
        <div
          style={{
            position: 'absolute',
            top: '60px',
            left: '340px',
            width: '520px',
            height: '520px',
            background: `radial-gradient(ellipse, ${band.colorHex}18, transparent 70%)`,
            borderRadius: '50%',
          }}
        />

        {/* Header: brand mark + label */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                background: '#FF3300',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 30px rgba(255,51,0,0.35)',
              }}
            >
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  background: '#000000',
                  borderRadius: '4px',
                  transform: 'rotate(12deg)',
                }}
              />
            </div>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 800,
                letterSpacing: '0.25em',
                textTransform: 'uppercase' as const,
                color: 'rgba(241,245,249,0.3)',
              }}
            >
              Agent Readiness Scorecard
            </span>
          </div>
          <span
            style={{
              fontSize: '16px',
              color: 'rgba(241,245,249,0.25)',
              fontFamily: 'monospace',
            }}
          >
            {displayDomain}
          </span>
        </div>

        {/* Center: company + giant score */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            position: 'relative',
          }}
        >
          <div
            style={{
              fontSize: '48px',
              fontWeight: 900,
              color: '#F1F5F9',
              letterSpacing: '-0.03em',
              lineHeight: 1,
              textTransform: 'uppercase' as const,
            }}
          >
            {company}
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span
              style={{
                fontSize: '160px',
                fontWeight: 900,
                color: band.colorHex,
                lineHeight: 1,
                letterSpacing: '-0.04em',
                textShadow: `0 0 80px ${band.colorHex}50`,
              }}
            >
              {score}
            </span>
            <span
              style={{
                fontSize: '32px',
                fontWeight: 800,
                color: 'rgba(241,245,249,0.3)',
                letterSpacing: '0.05em',
              }}
            >
              / 100
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                padding: '8px 24px',
                borderRadius: '999px',
                background: `${band.colorHex}15`,
                border: `1px solid ${band.colorHex}30`,
                fontSize: '15px',
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase' as const,
                color: band.colorHex,
              }}
            >
              {band.label}
            </div>
            {vsLine && (
              <div
                style={{
                  padding: '8px 24px',
                  borderRadius: '999px',
                  border: '1px solid rgba(241,245,249,0.12)',
                  background: 'rgba(241,245,249,0.04)',
                  fontSize: '15px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase' as const,
                  color: 'rgba(241,245,249,0.5)',
                }}
              >
                {vsLine}
              </div>
            )}
          </div>
        </div>

        {/* Footer: scan URL + branding */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative' }}>
          <span
            style={{
              fontSize: '14px',
              color: 'rgba(241,245,249,0.3)',
              fontFamily: 'monospace',
              letterSpacing: '0.05em',
            }}
          >
            scan.glintbase.dev/scan/{params.slug}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 800,
                letterSpacing: '0.2em',
                textTransform: 'uppercase' as const,
                color: 'rgba(241,245,249,0.2)',
              }}
            >
              Scanned by Glintbase
            </span>
            <span
              style={{
                fontSize: '10px',
                color: 'rgba(241,245,249,0.12)',
                letterSpacing: '0.05em',
              }}
            >
              Infrastructure for AI-Agent-Ready Products
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    }
  );
}
