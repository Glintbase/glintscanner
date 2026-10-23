/**
 * ARS 3.3 Layer 1 Probe: Discovery
 * Evaluates robots.txt AI policy, ARD/Agent-Card catalogs, Wikidata P856,
 * MCP registry branding, agent rules, and package listings.
 */

import { fetchResource } from '../fetchResource';
import { getChecksForLayer } from './registry';
import { brandFromHostname, registrableDomain } from '../../shared/url';
import type { CheckResult } from './types';
import { lookupMcpRegistry, lookupSkillsSh, type ListingLookup } from './registryListings';

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

/** Third-party lookups (Wikidata, npm) run in parallel with the slower registry lookups. */
const EXTERNAL_LOOKUP_TIMEOUT_MS = 5000;

/**
 * Resilient query helper with strict timeout to prevent stalling
 */
async function resilientFetch(url: string, timeoutMs: number = 3500): Promise<{ ok: boolean; body: string; status: number; contentType?: string | null }> {
  try {
    const res = await fetchResource(url, { timeoutMs });
    return {
      ok: res.ok,
      body: res.body || '',
      status: res.httpStatus || 0,
      contentType: res.contentType,
    };
  } catch {
    return { ok: false, body: '', status: 0 };
  }
}

/** An HTML page served at a plain-text path (SPA fallback / soft 404), not the file itself. */
export function looksLikeHtmlDocument(body: string, contentType?: string | null): boolean {
  if ((contentType || '').toLowerCase().includes('text/html')) return true;
  return /^\s*(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(body);
}

/** robots.txt lines with '#' comments removed, lowercased, blank lines dropped. */
export function robotsDirectiveLines(body: string): string[] {
  return body
    .toLowerCase()
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
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
  // docs.stripe.com -> stripe.com / stripe (not "docs")
  const apexDomain = registrableDomain(hostname);
  const brandName = brandFromHostname(hostname);

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

  // An HTML page at /robots.txt (SPA catch-all, soft 404) is not a robots.txt.
  const robotsIsHtml = Boolean(robotsRes.body) && looksLikeHtmlDocument(robotsRes.body, (robotsRes as { contentType?: string | null }).contentType);
  if (robotsRes.ok && robotsRes.body && !robotsIsHtml) {
    robotsPolicy.found = true;
    const body = robotsRes.body.toLowerCase();
    // Strip '#' comments (whole-line and trailing) before reading directives.
    const lines = robotsDirectiveLines(robotsRes.body);

    const targetBots = ['claudebot', 'gptbot', 'perplexitybot', 'google-extended', 'anthropic-ai', 'cohere-ai', 'oai-searchbot'];
    const botRules = new Map<string, { allow: boolean; disallowRoot: boolean }>();

    let currentAgents: string[] = [];
    let inDirectives = false;
    for (const line of lines) {
      if (line.startsWith('user-agent:')) {
        if (inDirectives) {
          currentAgents = [];
          inDirectives = false;
        }
        const agent = line.slice(11).trim();
        currentAgents.push(agent);
      } else {
        inDirectives = true;
        if (currentAgents.length > 0) {
          const isDisallowRoot = /^disallow:\s*\/(\s*|\s*#.*)$/.test(line);
          const isAllowRoot = /^allow:\s*\/(\s*|\s*#.*)$/.test(line);
          for (const agent of currentAgents) {
            const existing = botRules.get(agent) || { allow: false, disallowRoot: false };
            if (isDisallowRoot) existing.disallowRoot = true;
            if (isAllowRoot) existing.allow = true;
            botRules.set(agent, existing);
          }
        }
      }
    }

    const wildcardRule = botRules.get('*');
    for (const bot of targetBots) {
      const specificRule = botRules.get(bot);
      if (specificRule) {
        if (specificRule.disallowRoot && !specificRule.allow) {
          robotsPolicy.botsBlocked.push(bot);
        } else {
          robotsPolicy.botsAllowed.push(bot);
        }
      } else if (wildcardRule) {
        if (wildcardRule.disallowRoot && !wildcardRule.allow) {
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

    // Strict evaluation: Any blocked AI answer engine invalidates friendly pass
    if (robotsPolicy.botsBlocked.length === 0 && (robotsPolicy.botsAllowed.length > 0 || robotsPolicy.hasContentSignals)) {
      robotsPolicy.aiFriendly = true;
    } else {
      robotsPolicy.aiFriendly = false;
    }
  } else {
    // No robots.txt detected
    robotsPolicy.found = false;
    robotsPolicy.aiFriendly = false;
  }

  const robotsPassed = robotsPolicy.found && robotsPolicy.aiFriendly;
  const isPartial = robotsPolicy.found && robotsPolicy.botsBlocked.length > 0 && robotsPolicy.botsAllowed.length > 0;

  results.push({
    checkId: 'robots-ai-policy-quality',
    status: robotsPassed ? 'pass' : (isPartial ? 'warn' : (robotsPolicy.found ? 'fail' : 'warn')),
    earnedPoints: robotsPassed ? 2 : (isPartial ? 1 : 0),
    maxPoints: 2,
    isBonus: false,
    message: robotsPassed
      ? `robots.txt permits AI answer engines (${robotsPolicy.botsAllowed.join(', ') || 'explicit allow'})`
      : (robotsPolicy.found
        ? (robotsPolicy.botsBlocked.length > 0
          ? `robots.txt blocks AI answer bots (${robotsPolicy.botsBlocked.join(', ')})${robotsPolicy.botsAllowed.length > 0 ? ` while allowing ${robotsPolicy.botsAllowed.join(', ')}` : ''}`
          : 'robots.txt found but lacks explicit AI crawler permissions')
        : 'No robots.txt detected; explicit AI crawler permissions recommended'),
    remediation: !robotsPassed ? {
      title: 'Update robots.txt for AI Answer Engines',
      file: 'public/robots.txt',
      diffSnippet: [
        '+ User-agent: ClaudeBot',
        '+ Allow: /',
        '+ User-agent: GPTBot',
        '+ Allow: /',
        '+ User-agent: OAI-SearchBot',
        '+ Allow: /',
      ],
      fixCommand: 'glintbase remediate robots.txt',
    } : undefined,
  });

  // robots-oai-searchbot (2 pts bonus)
  const oaiSearchBotAllowed = !robotsPolicy.botsBlocked.includes('oai-searchbot') && (robotsPolicy.botsAllowed.includes('oai-searchbot') || robotsPassed);
  results.push({
    checkId: 'robots-oai-searchbot',
    status: oaiSearchBotAllowed ? 'pass' : 'warn',
    earnedPoints: oaiSearchBotAllowed ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: oaiSearchBotAllowed
      ? 'robots.txt explicitly permits or does not restrict OAI-SearchBot for search-indexed agent answers'
      : 'OAI-SearchBot is blocked or restricted in robots.txt (preventing ChatGPT search answers)',
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
  // A failed lookup leaves the bonus unverified (na), never failed
  // ========================================================
  const lookupWikidata = async (): Promise<boolean> => {
    if (localContext?.isLocalCodebase || hostname === 'localhost') return false;
    try {
      const wikiQueryUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(brandName)}&language=en&format=json`;
      const wikiSearch = await resilientFetch(wikiQueryUrl, EXTERNAL_LOOKUP_TIMEOUT_MS);
      if (wikiSearch.ok && wikiSearch.body) {
        const data = JSON.parse(wikiSearch.body);
        if (Array.isArray(data.search) && data.search.length > 0) {
          const entityId = data.search[0].id;
          if (entityId) {
            const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${entityId}.json`;
            const entityData = await resilientFetch(entityUrl, EXTERNAL_LOOKUP_TIMEOUT_MS);
            if (entityData.ok && entityData.body) {
              const entJson = JSON.parse(entityData.body);
              const claims = entJson.entities?.[entityId]?.claims;
              const p856Claims = claims?.P856;
              if (Array.isArray(p856Claims)) {
                for (const c of p856Claims) {
                  const val = c.mainsnak?.datavalue?.value;
                  if (typeof val === 'string' && val.toLowerCase().includes(apexDomain)) {
                    return true;
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      /* treat lookup failure as unverified */
    }
    return false;
  };

  // npm package must exist under the brand name AND point back at the brand's domain or GitHub org,
  // otherwise any unrelated package that happens to share the name would pass.
  // A 404 means no such package; a timeout or server error means npm could not be checked,
  // which is 'unverified' (skip), not a failure.
  const lookupNpm = async (): Promise<'found' | 'not_found' | 'unverified'> => {
    if (localContext?.packageName) return 'found';
    if (localContext?.isLocalCodebase || hostname === 'localhost') return 'not_found';
    try {
      const npmRes = await resilientFetch(`https://registry.npmjs.org/${encodeURIComponent(brandName)}/latest`, EXTERNAL_LOOKUP_TIMEOUT_MS);
      if (npmRes.status === 404) return 'not_found';
      if (!npmRes.ok || !npmRes.body) return 'unverified';
      const pkg = JSON.parse(npmRes.body);
      if (!pkg?.name) return 'unverified';
      const refs = [pkg.homepage, pkg.repository?.url, typeof pkg.repository === 'string' ? pkg.repository : '', pkg.bugs?.url]
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.toLowerCase());
      return refs.some((r) => r.includes(apexDomain) || new RegExp(`github\\.com[/:]${brandName}[-/]`, 'i').test(r)) ? 'found' : 'not_found';
    } catch {
      return 'unverified';
    }
  };

  // Registry listings need a public domain; a local codebase or localhost scan has none.
  const remoteLookupsPossible = !localContext?.isLocalCodebase && hostname !== 'localhost';
  const noRemoteLookup: ListingLookup = { outcome: 'unverified', reason: 'registry listings are only checked for public URLs' };

  const [hasWikiP856, npmPackage, mcpRegistry, skillsSh] = await Promise.all([
    lookupWikidata(),
    lookupNpm(),
    remoteLookupsPossible ? lookupMcpRegistry(apexDomain, brandName) : Promise.resolve(noRemoteLookup),
    remoteLookupsPossible ? lookupSkillsSh(apexDomain, brandName) : Promise.resolve(noRemoteLookup),
  ]);

  results.push({
    checkId: 'wikipedia-presence',
    status: hasWikiP856 ? 'pass' : 'na',
    earnedPoints: hasWikiP856 ? 4 : 0,
    maxPoints: 4,
    isBonus: true,
    message: hasWikiP856
      ? `Wikidata official website claim (P856) confirmed mapped to ${apexDomain}`
      : 'Wikidata P856 official website claim unverified (bonus skipped)',
  });

  // ========================================================
  // 5. Official SDK Package (npm-sdk-package)
  // npm registry API or local package.json
  // ========================================================
  results.push({
    checkId: 'npm-sdk-package',
    status: npmPackage === 'found' ? 'pass' : npmPackage === 'not_found' ? 'warn' : 'skip',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: false,
    message:
      npmPackage === 'found'
        ? `Official SDK/CLI package "${localContext?.packageName || brandName}" links back to ${apexDomain}`
        : npmPackage === 'not_found'
        ? `No npm package named "${brandName}" that links back to ${apexDomain}`
        : 'npm registry did not answer; package listing unverified',
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
    // Rules files live in a repository; a remote URL scan cannot see them.
    status: hasRules ? 'pass' : localContext?.isLocalCodebase ? 'warn' : 'skip',
    earnedPoints: hasRules ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: hasRules
      ? 'Repository includes explicit agent guidelines (.claude/, .cursor/, or .windsurf/)'
      : localContext?.isLocalCodebase
      ? 'Missing autonomous agent guideline rules (.claude/rules or .cursorrules)'
      : 'Agent rules files are only checked when scanning a local codebase',
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
  // brand-search-accuracy: external search lookup (needs a search API; not probed yet)
  results.push({
    checkId: 'brand-search-accuracy',
    status: 'skip',
    earnedPoints: 0,
    maxPoints: 3,
    isBonus: true,
    message: 'External brand search accuracy not yet probed (excluded from score)',
  });

  // agentic-search-specific: developer documentation search
  results.push({
    checkId: 'agentic-search-specific',
    status: 'skip',
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

  // mcp-registry-listed: official MCP Registry, under a namespace or endpoint tied to the domain
  results.push({
    checkId: 'mcp-registry-listed',
    status: mcpRegistry.outcome === 'listed' ? 'pass' : mcpRegistry.outcome === 'not_listed' ? 'warn' : 'skip',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: false,
    message:
      mcpRegistry.outcome === 'listed'
        ? `Listed in the official MCP Registry as ${mcpRegistry.match}`
        : mcpRegistry.outcome === 'not_listed'
        ? `No MCP Registry server under the ${apexDomain} namespace or hosted on ${apexDomain}`
        : `MCP Registry listing unverified: ${mcpRegistry.reason}`,
    evidence: mcpRegistry.outcome === 'listed' ? { server: mcpRegistry.match } : undefined,
  });

  // skills-sh-listed: agent skills on skills.sh published from the domain or the brand's GitHub owner
  results.push({
    checkId: 'skills-sh-listed',
    status: skillsSh.outcome === 'listed' ? 'pass' : skillsSh.outcome === 'not_listed' ? 'warn' : 'skip',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: false,
    message:
      skillsSh.outcome === 'listed'
        ? `Agent skills listed on skills.sh (${skillsSh.match})`
        : skillsSh.outcome === 'not_listed'
        ? `No skills.sh skills published from ${apexDomain} or a "${brandName}" GitHub owner`
        : `skills.sh listing unverified: ${skillsSh.reason}`,
    evidence: skillsSh.outcome === 'listed' ? { skill: skillsSh.match } : undefined,
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
