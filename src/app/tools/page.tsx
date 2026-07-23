import type { Metadata } from "next";
import { SiteNav } from "@/components/layout/SiteNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ResourceHub } from "@/components/tools/ResourceHub";

export const metadata: Metadata = {
  title: "Developer Tools — MCP, CLI & Agent Skill",
  description:
    "Install the Glintbase agent-readiness scanner as an MCP server (in-editor), a CLI (CI gates), or an agent skill. Copy-paste setup for Claude Code, Cursor, Windsurf, and more.",
  alternates: { canonical: "https://scan.glintbase.dev/tools" },
  openGraph: {
    title: "Glintbase Developer Tools — MCP, CLI & Agent Skill",
    description:
      "Three ways to run the Glintbase agent-readiness scanner: MCP server, CLI, and agent skill.",
    url: "https://scan.glintbase.dev/tools",
  },
};

export default function ToolsPage() {
  return (
    <>
      <SiteNav />
      {/* Grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(255,51,0,0.06),transparent)] pointer-events-none" />
      <ResourceHub />
      <SiteFooter />
    </>
  );
}
