import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://scan.glintbase.dev"),
  title: {
    default: "Glintbase Scanner — AI Agent Readiness Audit",
    template: "%s — Glintbase",
  },
  description:
    "Analyze whether AI agents like Cursor, Claude Code, and Copilot can reliably understand and use your product documentation. Infrastructure for AI-agent-ready repositories.",
  keywords: [
    "AI agent readiness",
    "documentation scanner",
    "MCP compatibility",
    "llms.txt",
    "developer documentation audit",
    "Cursor",
    "Claude Code",
    "Copilot",
    "AI infrastructure",
    "Glintbase",
    "agent-ready docs",
    "semantic structure",
    "API discoverability",
  ],
  authors: [{ name: "Glintbase", url: "https://glintbase.dev" }],
  creator: "Glintbase",
  publisher: "Glintbase",
  
  // 1. THIS IS THE VERIFICATION KEY MERGED PERFECTLY INSIDE YOUR METADATA OBJECT
  verification: {
    google: "k0DX8PtCSHYedje9IPPug8EIPeS_ETRAdRjtGIYm-3g", 
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Glintbase Scanner",
    title: "Glintbase Scanner — AI Agent Readiness Audit",
    description:
      "Analyze whether AI agents like Cursor, Claude Code, and Copilot can reliably understand and use your product documentation.",
    url: "https://scan.glintbase.dev",
  },
  twitter: {
    card: "summary_large_image",
    title: "Glintbase Scanner — AI Agent Readiness Audit",
    description:
      "Analyze whether AI agents like Cursor, Claude Code, and Copilot can reliably understand and use your product documentation.",
    creator: "@glintbase",
    site: "@glintbase",
  },
  alternates: {
    canonical: "https://scan.glintbase.dev",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} h-full scroll-smooth`}>
      <body className="min-h-full flex flex-col bg-black text-[#F1F5F9] font-sans selection:bg-[#FF3300]/30 selection:text-white overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}

