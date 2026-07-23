import type { Metadata } from "next";
import { SiteNav } from "@/components/layout/SiteNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { McpGateway } from "@/components/mcp/McpGateway";

export const metadata: Metadata = {
  title: "MCP Gateway — Zero-Config Agent Readiness Tools",
  description:
    "Connect the Glintbase agent-readiness MCP server to Claude Code, Cursor, Windsurf, or OpenCode. Nine composable tools, zero-config deep_crawl, no API keys.",
  alternates: { canonical: "https://scan.glintbase.dev/mcp" },
  openGraph: {
    title: "Glintbase MCP Gateway",
    description:
      "Nine composable agent-readiness tools for AI coding agents. Zero-config, no API keys — copy-paste setup for every client.",
    url: "https://scan.glintbase.dev/mcp",
  },
};

export default function McpPage() {
  return (
    <>
      <SiteNav />
      {/* Grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(255,51,0,0.06),transparent)] pointer-events-none" />
      <McpGateway />
      <SiteFooter />
    </>
  );
}
