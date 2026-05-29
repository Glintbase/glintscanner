import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  metadataBase: new URL("https://scan.glintbase.xyz"),
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
  authors: [{ name: "Glintbase", url: "https://glintbase.xyz" }],
  creator: "Glintbase",
  publisher: "Glintbase",
  
  // 1. THIS IS THE VERIFICATION KEY MERGED PERFECTLY INSIDE YOUR METADATA OBJECT
  verification: {
    google: "FuwkZGg4rWDRQLqPv7TBAdIsXx8AZt5eQ2T0PW1dO4s", 
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
    url: "https://scan.glintbase.xyz",
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
    canonical: "https://scan.glintbase.xyz",
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
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="font-sans antialiased bg-[#020617] text-[#F1F5F9] min-h-dvh flex flex-col selection:bg-[#FF4500]/20 overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
