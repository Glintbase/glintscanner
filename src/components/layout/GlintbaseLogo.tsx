// Shared Glintbase brand mark. Server-safe (pure SVG, no client hooks).
export function GlintbaseLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <mask id="navLogoMask">
          <rect width="100" height="100" fill="white" />
          <rect
            x="28"
            y="28"
            width="44"
            height="44"
            rx="12"
            fill="black"
            transform="rotate(15 50 50)"
          />
        </mask>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF3300" />
          <stop offset="100%" stopColor="#FF1800" />
        </linearGradient>
      </defs>
      <rect
        x="12"
        y="12"
        width="76"
        height="76"
        rx="22"
        fill="url(#logoGrad)"
        mask="url(#navLogoMask)"
      />
    </svg>
  );
}

export default GlintbaseLogo;
