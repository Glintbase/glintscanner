import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#000000",
        foreground: "#F1F5F9",
        brand: {
          DEFAULT: "#FF3300", // Solar Neon Red-Orange
          glow: "rgba(255, 51, 0, 0.3)",
        },
        primary: {
          DEFAULT: "#FF3300",
          foreground: "#000000",
        },
        secondary: {
          DEFAULT: "#8B5CF6", // Hyper Violet
          foreground: "#F1F5F9",
        },
        accent: {
          DEFAULT: "#22D3EE",
          foreground: "#000000",
        },
        surface: {
          950: "#000000",
          900: "#0F172A",
          800: "#1E293B",
          700: "#334155",
        },
        success: "#10B981",
        danger: "#EF4444",
        warning: "#F59E0B"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"],
        mono: ["var(--font-jetbrains)"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        scan: "scan 4s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scan: {
          "0%": { top: "0%" },
          "100%": { top: "100%" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
