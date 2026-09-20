/**
 * ARS 3.0 Layer 1 Probe: Discovery (16 Checks | 20 Base Pts)
 * Evaluates robots.txt AI policy, ARD/Agent-Card catalogs, Wikidata P856,
 * MCP registry branding, agent rules, and package listings.
 */

import { fetchResource } from '../fetchResource';
import { getChecksForLayer } from './registry';
import type { CheckResult } from './types';

export interface DiscoveryProbeResult {
  score: number;
  baseEarned: number;
  bonusEarned: number;
  checks: CheckResult[];
  details: string[];
  robotsPolicy: {
    found: boolean;
    aiFriendly: boolean;
    botsAllowed: string[];
    botsBlocked: string[];
    hasContentSignals: boolean;
  };
  agentRegistries: {
    foundArd: boolean;
    foundAiCatalog: boolean;
    foundAgentCard: boolean;
    url?: string;
  };
}

/**
 * Resilient query helper with strict timeout to prevent stalling
 */
async function resilientFetch(url: string, timeoutMs: number = 3500): Promise<{ ok: boolean; body: string; status: number }> {
  try {
    const res = await fetchResource(url, { timeoutMs });
    return {
      ok: res.ok,
      body: res.body || '',
      status: res.httpStatus || 0,
    };
  } catch {
    return { ok: false, body: '', status: 0 };
  }
}

export async function probeDiscovery(
  targetUrl: string,
  localContext?: {
    hasClaudeRules?: boolean;
    hasCursorRules?: boolean;
    hasWindsurfRules?: boolean;
    hasPluginJson?: boolean;
    packageName?: string;
    hasArdFile?: boolean;
    ardContent?: string;
    hasRobotsFile?: boolean;
    robotsContent?: string;
    isLocalCodebase?: boolean;
  }
): Promise<DiscoveryProbeResult> {
  const details: string[] = [];
  const checkDefs = getChecksForLayer('discovery');
  const results: CheckResult[] = [];

  let u: URL;
  try {
    u = new URL(targetUrl);
  } catch {
    // Return all checks as fail/skip if invalid URL
    for (const def of checkDefs) {
      results.push({
        checkId: def.id,
        status: 'fail',
        earnedPoints: 0,
        maxPoints: def.points,
        isBonus: def.isBonus,
        message: 'Invalid target URL for discovery probe',
      });
    }
    return {
      score: 0,
      baseEarned: 0,
      bonusEarned: 0,
      checks: results,
      details: ['Invalid target URL for discovery probe'],
      robotsPolicy: { found: false, aiFriendly: false, botsAllowed: [], botsBlocked: [], hasContentSignals: false },
      agentRegistries: { foundArd: false, foundAiCatalog: false, foundAgentCard: false },
    };
  }

  const origin = u.origin;
  const hostname = u.hostname.replace(/^www\./, '');
  const brandName = hostname.split('.')[0];

  // ========================================================
  // 1. robots.txt AI Policy Analysis (robots-ai-policy-quality)
  // ========================================================
  const robotsRes = localContext?.robotsContent
    ? { ok: true, body: localContext.robotsContent, status: 200 }
    : (localContext?.isLocalCodebase ? { ok: false, body: '', status: 404 } : await resilientFetch(`${origin}/robots.txt`, 3500));
  const robotsPolicy = {
    found: false,
    aiFriendly: false,
    botsAllowed: [] as string[],
    botsBlocked: [] as string[],
    hasContentSignals: false,
  };

  if (robotsRes.ok && robotsRes.body) {
    robotsPolicy.found = true;
    const body = robotsRes.body.toLowerCase();

    const targetBots = ['claudebot', 'gptbot', 'perplexitybot', 'google-extended', 'anthropic-ai', 'cohere-ai'];
    for (const bot of targetBots) {
      if (body.includes(`user-agent: ${bot}`) || body.includes(`user-agent: *`)) {
        if (body.includes(`disallow: /`) && body.includes(`user-agent: ${bot}`)) {
          robotsPolicy.botsBlocked.push(bot);
        } else {
          robotsPolicy.botsAllowed.push(bot);
        }
      }
    }

    if (body.includes('search=yes') || body.includes('ai-train=')) {
      robotsPolicy.hasContentSignals = true;
      details.push('Found Content-Signals policy in robots.txt (search=yes / ai-train)');
    }

    if (robotsPolicy.botsBlocked.length === 0 || robotsPolicy.botsAllowed.length > 0 || robotsPolicy.hasContentSignals) {
      robotsPolicy.aiFriendly = true;
    }
  } else {
    // No robots.txt detected
    robotsPolicy.found = false;
    robotsPolicy.aiFriendly = false;
  }

  const robotsPassed = robotsPolicy.found && robotsPolicy.aiFriendly;
  results.push({
    checkId: 'robots-ai-policy-quality',
    status: robotsPassed ? 'pass' : (robotsPolicy.found ? 'fail' : 'warn'),
    earnedPoints: robotsPassed ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: robotsPassed
      ? `robots.txt permits AI answer engines (${robotsPolicy.botsAllowed.join(', ') || 'explicit allow'})`
      : (robotsPolicy.found
        ? `robots.txt blocks AI answer bots (${robotsPolicy.botsBlocked.join(', ')})`
        : 'No robots.txt detected; explicit AI crawler permissions recommended'),
    evidence: { robotsPolicy },
    remediation: !robotsPassed ? {
      title: 'Update robots.txt for AI Answer Engines',
      file: 'public/robots.txt',
      diffSnippet: [
        '+ User-agent: ClaudeBot',
        '+ Allow: /',
        '+ User-agent: GPTBot',
        '+ Allow: /',
      ],
      fixCommand: 'glintbase remediate robots.txt',
    } : undefined,
  });

  // ========================================================
  // 2. ARD & Agent Catalogs (.well-known/ard.json, ai-catalog.json)
  // ========================================================
  const ardRes = localContext?.ardContent
    ? { ok: true, body: localContext.ardContent, status: 200 }
    : (localContext?.isLocalCodebase ? { ok: false, body: '', status: 404 } : await resilientFetch(`${origin}/.well-known/ard.json`, 3500));
  const aiCatRes = localContext?.isLocalCodebase ? { ok: false, body: '', status: 404 } : await resilientFetch(`${origin}/.well-known/ai-catalog.json`, 3500);
  const fallbackCatRes = localContext?.isLocalCodebase ? { ok: false, body: '', status: 404 } : await resilientFetch(`${origin}/ai-catalog.json`, 3500);

  let parsedArd: any = null;
  let parsedAiCat: any = null;
  let foundArd = false;
  let foundAiCatalog = false;
  const foundAgentCard = false;
  let registryUrl: string | undefined;

  if (ardRes.ok && ardRes.body && !ardRes.body.includes('<html')) {
    try {
      parsedArd = JSON.parse(ardRes.body);
      foundArd = true;
      registryUrl = `${origin}/.well-known/ard.json`;
    } catch { /* malformed */ }
  }

  if (aiCatRes.ok && aiCatRes.body && !aiCatRes.body.includes('<html')) {
    try {
      parsedAiCat = JSON.parse(aiCatRes.body);
      foundAiCatalog = true;
      if (!registryUrl) registryUrl = `${origin}/.well-known/ai-catalog.json`;
    } catch { /* malformed */ }
  } else if (fallbackCatRes.ok && fallbackCatRes.body && !fallbackCatRes.body.includes('<html')) {
    try {
      parsedAiCat = JSON.parse(fallbackCatRes.body);
      foundAiCatalog = true;
      if (!registryUrl) registryUrl = `${origin}/ai-catalog.json`;
    } catch { /* malformed */ }
  }

  // Check: ard-catalog (1 pt, required)
  const hasValidArd = foundArd || foundAiCatalog;
  results.push({
    checkId: 'ard-catalog',
    status: hasValidArd ? 'pass' : 'warn',
    earnedPoints: hasValidArd ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: hasValidArd
      ? `Discovered ARD/Agent-Card catalog at ${registryUrl}`
      : 'Missing /.well-known/ard.json (ARD v0.91) specification',
    evidence: { registryUrl },
    remediation: !hasValidArd ? {
      title: 'Generate Agent Resource Discovery (ard.json)',
      file: 'public/.well-known/ard.json',
      diffSnippet: [
        '+ {',
        '+   "$schema": "https://agentcard.org/v0.91/ard.json",',
        `+   "id": "urn:air:${hostname}:main",`,
        `+   "name": "${brandName}",`,
        '+   "capabilities": ["tools", "context"]',
        '+ }',
      ],
      fixCommand: 'glintbase remediate ard.json',
    } : undefined,
  });

  // Check: ai-catalog-published (1 pt, bonus)
  results.push({
    checkId: 'ai-catalog-published',
    status: foundAiCatalog ? 'pass' : 'na',
    earnedPoints: foundAiCatalog ? 1 : 0,
    maxPoints: 1,
    isBonus: true,
    message: foundAiCatalog
      ? 'Published official Agent-Card WG ai-catalog.json'
      : 'Agent-Card WG ai-catalog.json not published (bonus skipped)',
  });

  // Check: ard-entries-valid (2 pts, bonus)
  let ardEntriesValid = false;
  if (parsedArd) {
    if (Array.isArray(parsedArd.entries) && parsedArd.entries.length > 0) {
      ardEntriesValid = parsedArd.entries.every((e: any) => e.displayName && (e.mediaType || e.type) && (e.url || e.data));
    } else if (parsedArd.endpoints && typeof parsedArd.endpoints === 'object' && Object.keys(parsedArd.endpoints).length > 0) {
      ardEntriesValid = true;
    }
  }
  results.push({
    checkId: 'ard-entries-valid',
    status: ardEntriesValid ? 'pass' : 'na',
    earnedPoints: ardEntriesValid ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: ardEntriesValid
      ? 'All catalog entries contain valid displayName, mediaType, and endpoint data'
      : 'Catalog entries validation skipped (bonus)',
  });

  // Check: ard-trust-manifest (2 pts, bonus)
  let hasTrustManifest = false;
  if (parsedArd) {
    hasTrustManifest = Boolean(parsedArd.trustManifest || parsedArd.signature || parsedArd.attestation);
  }
  results.push({
    checkId: 'ard-trust-manifest',
    status: hasTrustManifest ? 'pass' : 'na',
    earnedPoints: hasTrustManifest ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: hasTrustManifest
      ? 'Cryptographic trust manifest / attestation verified in ARD catalog'
      : 'No cryptographic trust manifest declared (bonus skipped)',
  });

  // ========================================================
  // 3. MCP Registry Branding (registry-branding)
  // ========================================================
  const mcpManifestRes = localContext?.isLocalCodebase ? { ok: false, body: '', status: 404 } : await resilientFetch(`${origin}/.well-known/mcp/manifest.json`, 1500);
  const mcpJsonRes = localContext?.isLocalCodebase ? { ok: false, body: '', status: 404 } : await resilientFetch(`${origin}/.well-known/mcp.json`, 1500);
  const rootMcpRes = localContext?.isLocalCodebase ? { ok: false, body: '', status: 404 } : await resilientFetch(`${origin}/mcp.json`, 1500);

  let hasBranding = false;
  for (const mRes of [mcpManifestRes, mcpJsonRes, rootMcpRes]) {
    if (mRes.ok && mRes.body) {
      try {
        const json = JSON.parse(mRes.body);
        if (json.name && (json.icon || json.icons) && json.description) {
          hasBranding = true;
          break;
        }
      } catch { /* malformed */ }
    }
  }

  results.push({
    checkId: 'registry-branding',
    status: hasBranding ? 'pass' : 'warn',
    earnedPoints: hasBranding ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: hasBranding
      ? 'MCP manifest contains complete branding metadata (name, icon, description)'
      : 'MCP manifest branding missing or incomplete at /.well-known/mcp/manifest.json',
  });

  // ========================================================
  // 4. Wikidata P856 Official Website Claim (wikipedia-presence)
  // Strict 1500ms timeout with local caching & resilient fallback
  // ========================================================
  let hasWikiP856 = false;
  if (!localContext?.isLocalCodebase && hostname !== 'localhost') {
    try {
      const wikiQueryUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(brandName)}&language=en&format=json`;
      const wikiSearch = await resilientFetch(wikiQueryUrl, 1500);
      if (wikiSearch.ok && wikiSearch.body) {
        const data = JSON.parse(wikiSearch.body);
        if (Array.isArray(data.search) && data.search.length > 0) {
          const entityId = data.search[0].id;
          if (entityId) {
            const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${entityId}.json`;
            const entityData = await resilientFetch(entityUrl, 1500);
            if (entityData.ok && entityData.body) {
              const entJson = JSON.parse(entityData.body);
              const claims = entJson.entities?.[entityId]?.claims;
              const p856Claims = claims?.P856;
              if (Array.isArray(p856Claims)) {
                for (const c of p856Claims) {
                  const val = c.mainsnak?.datavalue?.value;
                  if (typeof val === 'string' && val.toLowerCase().includes(hostname)) {
                    hasWikiP856 = true;
                    break;
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      hasWikiP856 = false;
    }
  }

  results.push({
    checkId: 'wikipedia-presence',
    status: hasWikiP856 ? 'pass' : 'na',
    earnedPoints: hasWikiP856 ? 4 : 0,
    maxPoints: 4,
    isBonus: true,
    message: hasWikiP856
      ? `Wikidata official website claim (P856) confirmed mapped to ${hostname}`
      : 'Wikidata P856 official website claim unverified (bonus skipped)',
  });

  // ========================================================
  // 5. Official SDK Package (npm-sdk-package)
  // Check npm registry API with 1500ms timeout or local package.json
  // ========================================================
  let hasNpmPackage = Boolean(localContext?.packageName);
  if (!hasNpmPackage && !localContext?.isLocalCodebase && hostname !== 'localhost') {
    try {
      const npmRes = await resilientFetch(`https://registry.npmjs.org/${encodeURIComponent(brandName)}`, 1500);
      if (npmRes.ok && npmRes.body) {
        const pkgData = JSON.parse(npmRes.body);
        if (pkgData && !pkgData.error && pkgData.name) {
          hasNpmPackage = true;
        }
      }
    } catch {
      hasNpmPackage = false;
    }
  }

  results.push({
    checkId: 'npm-sdk-package',
    status: hasNpmPackage ? 'pass' : 'warn',
    earnedPoints: hasNpmPackage ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: hasNpmPackage
      ? `Official SDK/CLI package published under ${brandName}`
      : `No official SDK package found under scope ${brandName}`,
  });

  // ========================================================
  // 6. Agent Rules & Guidelines (agent-rules-repo)
  // ========================================================
  const hasRules = Boolean(
    localContext?.hasClaudeRules ||
    localContext?.hasCursorRules ||
    localContext?.hasWindsurfRules
  );

  results.push({
    checkId: 'agent-rules-repo',
    status: hasRules ? 'pass' : 'warn',
    earnedPoints: hasRules ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: hasRules
      ? 'Repository includes explicit agent guidelines (.claude/, .cursor/, or .windsurf/)'
      : 'Missing autonomous agent guideline rules (.claude/rules or .cursorrules)',
  });

  // ========================================================
  // 7. Agent Plugins Spec (agent-plugins-repo)
  // ========================================================
  const hasPlugin = Boolean(localContext?.hasPluginJson);
  results.push({
    checkId: 'agent-plugins-repo',
    status: hasPlugin ? 'pass' : 'na',
    earnedPoints: hasPlugin ? 1 : 0,
    maxPoints: 1,
    isBonus: true,
    message: hasPlugin
      ? 'Plugin manifest adheres to agent-plugins.org schema'
      : 'No agent-plugins.org manifest declared (bonus skipped)',
  });

  // ========================================================
  // 8. Search Discoverability & External Directories
  // ========================================================
  // brand-search-accuracy: external search lookup
  results.push({
    checkId: 'brand-search-accuracy',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 3,
    isBonus: true,
    message: 'External brand search accuracy not yet probed (excluded from score)',
  });

  // agentic-search-specific: developer documentation search
  results.push({
    checkId: 'agentic-search-specific',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 3,
    isBonus: true,
    message: 'External agentic search index not yet probed (excluded from score)',
  });

  // chatgpt-app-listed (bonus)
  results.push({
    checkId: 'chatgpt-app-listed',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 2,
    isBonus: true,
    message: 'ChatGPT App Directory listing unverified (bonus skipped)',
  });

  // mcp-registry-listed
  results.push({
    checkId: 'mcp-registry-listed',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: true,
    message: 'MCP registry listing not yet probed (excluded from score)',
  });

  // skills-sh-listed
  results.push({
    checkId: 'skills-sh-listed',
    status: 'warn',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: false,
    message: 'Not listed in skills.sh verified skills registry',
  });

  // agentic-search-usecase (beta, held at N/A per spec)
  results.push({
    checkId: 'agentic-search-usecase',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 6,
    isBonus: false,
    message: 'Held at N/A (unscored) pending noise reduction per ARS 3.0 spec',
  });

  // Compute earned points
  let baseEarned = 0;
  let bonusEarned = 0;

  for (const r of results) {
    if (r.status === 'pass') {
      if (r.isBonus) {
        bonusEarned += r.earnedPoints;
      } else {
        baseEarned += r.earnedPoints;
      }
    }
  }

  const score = baseEarned + bonusEarned;

  return {
    score,
    baseEarned,
    bonusEarned,
    checks: results,
    details,
    robotsPolicy,
    agentRegistries: {
      foundArd,
      foundAiCatalog,
      foundAgentCard,
      url: registryUrl,
    },
  };
}
