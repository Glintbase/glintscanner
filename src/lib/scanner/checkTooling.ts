import { CheckResult, CategoryResult } from './types';

export async function checkTooling(url: string, markdown: string): Promise<CategoryResult> {
  const base = new URL(url).origin;
  const results: CheckResult[] = [];

  // 1. Model Context Protocol (MCP) Server configuration probe (10 pts)
  let hasMcp = false;

  const mcpWellKnown = await fetch(`${base}/.well-known/mcp.json`).catch(() => null);
  if (mcpWellKnown && mcpWellKnown.status === 200) {
    hasMcp = true;
  } else {
    // Check markdown for MCP server mentions
    const mdLower = markdown.toLowerCase();
    hasMcp = 
      mdLower.includes('model context protocol') || 
      mdLower.includes('mcp server') || 
      mdLower.includes('mcp.json') ||
      mdLower.includes('mcp-server');
  }

  results.push({
    id: 'mcp_integration',
    label: 'Model Context Protocol (MCP) Server Integration',
    passed: hasMcp,
    points: hasMcp ? 10 : 0,
    maxPoints: 10,
    fix: hasMcp ? null : 'Configure and expose an MCP server definition at /.well-known/mcp.json or publish guidelines showing AI agents how to interact with your APIs using MCP tool declarations.'
  });

  // 2. Error Code Cross-Referencing Index Detection (10 pts)
  const mdLower = markdown.toLowerCase();
  const hasErrorIndex = 
    mdLower.includes('error code') || 
    mdLower.includes('error codes') || 
    mdLower.includes('status code') || 
    mdLower.includes('troubleshooting') ||
    /error\s+(?:reference|list|table|dictionary|map)/.test(mdLower);

  results.push({
    id: 'error_index',
    label: 'Error Code Diagnostics & Cross-Referencing Index',
    passed: hasErrorIndex,
    points: hasErrorIndex ? 10 : 0,
    maxPoints: 10,
    fix: hasErrorIndex ? null : 'Provide a comprehensive table or section listing error codes, their causes, and solutions. This lets agents cross-reference error stacks and resolve integration errors automatically.'
  });

  const score = results.reduce((s, r) => s + r.points, 0);

  return {
    category: 'agent',
    score,
    maxScore: 20,
    results
  };
}
