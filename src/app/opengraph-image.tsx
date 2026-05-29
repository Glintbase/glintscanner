import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Glintbase Scanner — AI Agent Readiness Audit';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#020617',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle grid pattern */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage:
              'linear-gradient(to right, rgba(30,41,59,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(30,41,59,0.15) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Top glow */}
        <div
          style={{
            position: 'absolute',
            top: '-120px',
            left: '200px',
            width: '600px',
            height: '400px',
            background: 'radial-gradient(ellipse, rgba(255,69,0,0.12), transparent 70%)',
            borderRadius: '50%',
          }}
        />

        {/* Header section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative' }}>
          {/* Logo mark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                background: '#FF4500',
                borderRadius: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 40px rgba(255,69,0,0.4)',
              }}
            >
              <div
                style={{
                  width: '22px',
                  height: '22px',
                  background: '#020617',
                  borderRadius: '5px',
                  transform: 'rotate(12deg)',
                }}
              />
            </div>
            <span
              style={{
                fontSize: '16px',
                fontWeight: 900,
                letterSpacing: '0.3em',
                textTransform: 'uppercase' as const,
                color: 'rgba(241,245,249,0.4)',
              }}
            >
              Glintbase Scanner
            </span>
          </div>

          {/* Main title */}
          <div
            style={{
              fontSize: '56px',
              fontWeight: 900,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              color: '#F1F5F9',
              textTransform: 'uppercase' as const,
              maxWidth: '800px',
            }}
          >
            AI Agent Readiness{' '}
            <span style={{ color: '#FF4500' }}>Audit</span>
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: '20px',
              color: 'rgba(241,245,249,0.35)',
              lineHeight: 1.5,
              maxWidth: '680px',
            }}
          >
            Analyze whether AI agents like Cursor, Claude Code, and Copilot
            can reliably understand and use your product documentation.
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase' as const,
                color: 'rgba(241,245,249,0.2)',
              }}
            >
              scan.glintbase.xyz
            </span>
          </div>

          {/* Status pills */}
          <div style={{ display: 'flex', gap: '12px' }}>
            {['MCP', 'llms.txt', 'Semantic', 'Tooling'].map((label) => (
              <div
                key={label}
                style={{
                  padding: '6px 16px',
                  borderRadius: '999px',
                  border: '1px solid rgba(255,69,0,0.25)',
                  background: 'rgba(255,69,0,0.06)',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase' as const,
                  color: 'rgba(255,69,0,0.7)',
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
