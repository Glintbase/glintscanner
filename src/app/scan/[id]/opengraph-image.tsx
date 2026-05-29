import { ImageResponse } from 'next/og';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'edge';

export const alt = 'AI Agent Readiness Audit — Glintbase Scanner';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

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

function scoreBand(score: number): { label: string; color: string } {
  if (score >= 76) return { label: 'Agent-Native', color: '#22C55E' };
  if (score >= 41) return { label: 'AI-Friendly', color: '#F59E0B' };
  return { label: 'Legacy Docs', color: '#EF4444' };
}

export default async function Image({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('public_scans')
    .select('url, score, checks')
    .eq('id', params.id)
    .single();

  const scanUrl = data?.url || 'Unknown';
  const score = data?.score ?? 0;
  const checks = data?.checks || [];
  const company = deriveCompany(scanUrl);
  const band = scoreBand(score);
  let displayDomain = scanUrl;
  try {
    displayDomain = new URL(scanUrl).hostname;
  } catch {
    displayDomain = scanUrl.replace(/^https?:\/\//i, '').split('/')[0];
  }

  // Derive status indicators from check categories
  const indicators: { label: string; passed: boolean }[] = [];
  for (const check of checks) {
    if (check.category === 'context') {
      const hasLlmsTxt = check.results?.some((r: any) => r.id === 'llms_txt' && r.passed);
      indicators.push({ label: 'llms.txt', passed: !!hasLlmsTxt });
    }
    if (check.category === 'machine') {
      const hasSchema = check.results?.some((r: any) => r.id === 'structured_data' && r.passed);
      indicators.push({ label: 'Structured Data', passed: !!hasSchema });
    }
    if (check.category === 'agent') {
      const hasMcp = check.results?.some((r: any) => r.id === 'mcp_endpoint' && r.passed);
      indicators.push({ label: 'MCP Ready', passed: !!hasMcp });
    }
  }
  // Fallback indicators if checks are sparse
  if (indicators.length === 0) {
    indicators.push(
      { label: 'Context', passed: score >= 40 },
      { label: 'Code', passed: score >= 50 },
      { label: 'Machine', passed: score >= 30 },
    );
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
          background: '#020617',
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

        {/* Top glow behind score */}
        <div
          style={{
            position: 'absolute',
            top: '-40px',
            right: '80px',
            width: '400px',
            height: '400px',
            background: `radial-gradient(ellipse, ${band.color}15, transparent 70%)`,
            borderRadius: '50%',
          }}
        />

        {/* Top row: company info + score */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
          {/* Left: Company identity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '640px' }}>
            {/* Scanner label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  background: '#FF4500',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 30px rgba(255,69,0,0.35)',
                }}
              >
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    background: '#020617',
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
                Agent Readiness Audit
              </span>
            </div>

            {/* Company name */}
            <div
              style={{
                fontSize: '64px',
                fontWeight: 900,
                color: '#F1F5F9',
                letterSpacing: '-0.03em',
                lineHeight: 1,
                textTransform: 'uppercase' as const,
              }}
            >
              {company}
            </div>

            {/* Domain */}
            <div
              style={{
                fontSize: '16px',
                color: 'rgba(241,245,249,0.25)',
                fontFamily: 'monospace',
              }}
            >
              {displayDomain}
            </div>
          </div>

          {/* Right: Score display */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                fontSize: '96px',
                fontWeight: 900,
                color: band.color,
                lineHeight: 1,
                letterSpacing: '-0.04em',
                textShadow: `0 0 60px ${band.color}40`,
              }}
            >
              {score}
            </div>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase' as const,
                color: 'rgba(241,245,249,0.3)',
              }}
            >
              / 100
            </div>
            <div
              style={{
                marginTop: '8px',
                padding: '6px 20px',
                borderRadius: '999px',
                background: `${band.color}15`,
                border: `1px solid ${band.color}30`,
                fontSize: '13px',
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase' as const,
                color: band.color,
              }}
            >
              {band.label}
            </div>
          </div>
        </div>

        {/* Bottom: Indicators + branding */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative' }}>
          {/* Indicators */}
          <div style={{ display: 'flex', gap: '12px' }}>
            {indicators.map((ind) => (
              <div
                key={ind.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 18px',
                  borderRadius: '999px',
                  border: `1px solid ${ind.passed ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.2)'}`,
                  background: ind.passed ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.04)',
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: ind.passed ? '#22C55E' : '#EF4444',
                    boxShadow: ind.passed ? '0 0 8px rgba(34,197,94,0.5)' : '0 0 8px rgba(239,68,68,0.4)',
                  }}
                />
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase' as const,
                    color: ind.passed ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.7)',
                  }}
                >
                  {ind.label}
                </span>
              </div>
            ))}
          </div>

          {/* Branding footer */}
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
    { ...size }
  );
}
