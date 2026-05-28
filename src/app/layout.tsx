import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Glintbase Agent Readiness Scanner — Check if AI agents can use your docs",
  description:
    "Free public tool. Scan any documentation URL and get an instant Agent Readiness Score with copy-paste fix prompts for Cursor, Claude Code, and GitHub Copilot.",
  openGraph: {
    title: "Glintbase Agent Readiness Scanner",
    description: "Check if AI agents can actually use your product's documentation.",
    url: "https://glintbase.xyz/scan",
    siteName: "Glintbase",
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
