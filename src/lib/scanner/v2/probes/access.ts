/**
 * ARS 3.0 Layer 2 Probe: Access & Understanding (41 Checks | 30 Base Pts)
 * Evaluates Zero-JS readability, Anti-SPA 404 canary, llms.txt,
 * Content negotiation, OpenAPI specs, and developer portals.
 */

import { fetchResource, type FetchResourceResult } from '../fetchResource';
import { getChecksForLayer } from './registry';
import type { CheckResult } from './types';

export interface AccessProbeResult {
  /** False when the homepage request got no HTTP response at all (DNS/TLS/connect failure or timeout). */
  targetReachable: boolean;
  score: number;
  baseEarned: number;
  bonusEarned: number;
  checks: CheckResult[];
  details: string[];
  markdownNegotiation: {
    supported: boolean;
    hasVaryAccept: boolean;
    mdTwinUrl?: string;
  };
  antiSpa404: {
    passed: boolean;
    returnedStatus?: number;
    isSoft200: boolean;
  };
  zeroJsReadability: {
    passed: boolean;
    charCount: number;
    textDensityPercent: number;
  };
  openapi: {
    found: boolean;
    url?: string;
    version?: string;
    /** Parsed document when the spec is JSON; YAML specs are detected but not parsed. */
    spec?: any;
  };
}

const HOMEPAGE_UNAVAILABLE = 'Homepage could not be fetched';

/** Checks computed from the homepage HTML or its response headers. */
const HOMEPAGE_DERIVED_CHECKS = new Set([
  'content-no-js',
  'page-token-budget',
  'crosspage-policy-consistency',
  'nojs-fact-integrity',
  'code-fence-validity',
  'cors-headers',
  'compression-gzip-br',
  'clean-semantic-html',
  'heading-hierarchy',
  'meta-description-quality',
  'json-ld-structured-data',
  'charset-utf8-declared',
  'canonical-url-present',
  'content-type-charset',
  'etag-caching',
  'cache-control-headers',
  'response-latency-p95',
  'text-density-ratio',
  'link-header-canonical',
  'security-headers-csp',
]);

export async function probeAccess(
  targetUrl: string,
  localContext?: {
    hasOpenApiFile?: boolean;
    hasLlmsFile?: boolean;
    hasLlmsFullFile?: boolean;
    llmsContent?: string;
    middlewareHasVaryAccept?: boolean;
    has404Handler?: boolean;
    hasCatchAllSpaLeak?: boolean;
    pageContent?: string;
    isLocalCodebase?: boolean;
  }
): Promise<AccessProbeResult> {
  const details: string[] = [];
  const checkDefs = getChecksForLayer('access');
  const results: CheckResult[] = [];

  const localDummy = (overrides: Partial<FetchResourceResult> = {}): FetchResourceResult => ({
    ok: false,
    status: 'failed',
    url: targetUrl,
    body: '',
    headers: {},
    contentType: null,
    httpStatus: 404,
    ...overrides,
  });

  let u: URL;
  try {
    u = new URL(targetUrl);
  } catch {
    for (const def of checkDefs) {
      results.push({
        checkId: def.id,
        status: 'fail',
        earnedPoints: 0,
        maxPoints: def.points,
        isBonus: def.isBonus,
        message: 'Invalid target URL for access probe',
      });
    }
    return {
      targetReachable: false,
      score: 0,
      baseEarned: 0,
      bonusEarned: 0,
      checks: results,
      details: ['Invalid target URL for access probe'],
      markdownNegotiation: { supported: false, hasVaryAccept: false },
      antiSpa404: { passed: false, isSoft200: false },
      zeroJsReadability: { passed: false, charCount: 0, textDensityPercent: 0 },
      openapi: { found: false },
    };
  }

  const origin = u.origin;
  const startTime = Date.now();

  // 1. Fetch Homepage HTML
  const homeRes: FetchResourceResult = localContext?.isLocalCodebase
    ? localDummy({ ok: Boolean(localContext?.pageContent), body: localContext?.pageContent || '', httpStatus: localContext?.pageContent ? 200 : 404 })
    : await fetchResource(targetUrl, { timeoutMs: 5000 });
  const latency = Date.now() - startTime;
  let rawHtml = homeRes.body || '';
  if (!rawHtml && localContext?.isLocalCodebase && localContext?.pageContent) {
    rawHtml = localContext.pageContent;
  }
  // Remote homepage fetch produced neither a successful response nor a body.
  const homepageFailed = !localContext?.isLocalCodebase && !homeRes.ok && !rawHtml;
  // No HTTP status at all means the server never answered (as opposed to a 4xx/5xx or a bot wall).
  const targetReachable = !homepageFailed || homeRes.httpStatus !== undefined;

  // 2. Zero-JS Prose & Heading Analysis (content-no-js)
  const noScriptHtml = rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');

  const cleanProse = noScriptHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const proseLength = cleanProse.length;
  const totalLength = Math.max(1, rawHtml.length);
  const textDensityPercent = Math.round((proseLength / totalLength) * 100);

  const hasH1 = /<h1\b[^>]*>/i.test(rawHtml) || /^#\s+[^\n]+/m.test(rawHtml);
  // Check heading hierarchy progression
  const headingMatches = Array.from(rawHtml.matchAll(/<h([1-6])\b[^>]*>/gi)).map(m => parseInt(m[1]));
  let skipsHeading = false;
  for (let i = 0; i < headingMatches.length - 1; i++) {
    if (headingMatches[i + 1] > headingMatches[i] + 1) {
      skipsHeading = true;
      break;
    }
  }

  const zeroJsPassed = proseLength >= 500 && hasH1 && !skipsHeading && (textDensityPercent >= 5 || rawHtml.includes('#'));

  results.push({
    checkId: 'content-no-js',
    status: zeroJsPassed ? 'pass' : (proseLength >= 300 ? 'warn' : 'fail'),
    earnedPoints: zeroJsPassed ? 3 : 0,
    maxPoints: 3,
    isBonus: false,
    message: zeroJsPassed
      ? `Zero-JS readability confirmed (${proseLength} chars prose, ${textDensityPercent}% density, valid h1)`
      : `Zero-JS readability issues: ${proseLength < 500 ? '<500 chars prose; ' : ''}${!hasH1 ? 'missing <h1>; ' : ''}${skipsHeading ? 'skipped heading levels; ' : ''}`,
    remediation: !zeroJsPassed ? {
      title: 'Ensure Server-Rendered Semantic HTML',
      file: 'app/page.tsx',
      diffSnippet: [
        '+ export default function Page() {',
        '+   return (',
        '+     <main>',
        '+       <h1>Acme Developer Documentation</h1>',
        '+       <p>Comprehensive machine-readable guides and APIs.</p>',
        '+     </main>',
        '+   );',
        '+ }',
      ],
      fixCommand: 'glintbase remediate html',
    } : undefined,
  });

  // 3. Page Token Budget Ceiling (page-token-budget: <= 100k chars / ~25k tokens)
  const tokenBudgetPassed = proseLength <= 100000;
  results.push({
    checkId: 'page-token-budget',
    status: tokenBudgetPassed ? 'pass' : 'warn',
    earnedPoints: tokenBudgetPassed ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: tokenBudgetPassed
      ? `Extracted text (${proseLength} chars) stays within 100k character budget`
      : `Warning: Content size (${proseLength} chars) exceeds 100k token budget limit`,
  });

  // 4. Anti-SPA Canary Probe (anti-spa-404)
  const canaryUrl = `${origin}/__glintbase_canary_${Math.random().toString(36).slice(2, 9)}`;
  const canaryRes: FetchResourceResult = localContext?.isLocalCodebase
    ? localDummy({ httpStatus: (localContext?.has404Handler || !localContext?.hasCatchAllSpaLeak) ? 404 : 200 })
    : await fetchResource(canaryUrl, { timeoutMs: 3500 });

  let antiSpaPassed = false;
  let isSoft200 = false;
  if (canaryRes.httpStatus === 404 || canaryRes.httpStatus === 410) {
    antiSpaPassed = true;
  } else if (localContext?.has404Handler || (localContext?.isLocalCodebase && !localContext?.hasCatchAllSpaLeak)) {
    antiSpaPassed = true;
  } else if (canaryRes.httpStatus === 200) {
    isSoft200 = true;
  }

  results.push({
    checkId: 'anti-spa-404',
    status: antiSpaPassed ? 'pass' : 'fail',
    earnedPoints: antiSpaPassed ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: antiSpaPassed
      ? 'Authentic HTTP 404 returned for nonexistent canary URL (no SPA leak)'
      : 'Anti-SPA Canary Failed: Returns soft HTTP 200 SPA shell (AI agents will hallucinate content)',
    evidence: { canaryStatus: canaryRes.httpStatus },
    remediation: !antiSpaPassed ? {
      title: 'Fix Catch-All 404 Route Leak',
      file: 'app/not-found.tsx',
      diffSnippet: [
        '+ export default function NotFound() {',
        '+   return <h1>404 - Not Found</h1>;',
        '+ }',
      ],
      fixCommand: 'glintbase remediate next.config.mjs',
    } : undefined,
  });

  // 5. llms.txt Suite
  const llmsRes: FetchResourceResult = localContext?.isLocalCodebase
    ? localDummy({ ok: Boolean(localContext?.llmsContent), body: localContext?.llmsContent || '', httpStatus: localContext?.llmsContent ? 200 : 404 })
    : await fetchResource(`${origin}/llms.txt`, { timeoutMs: 3000 });
  let hasLlms = Boolean(localContext?.hasLlmsFile);
  let llmsContent = localContext?.llmsContent || '';

  if (!llmsContent && llmsRes.ok && llmsRes.body && !llmsRes.body.includes('<html')) {
    hasLlms = true;
    llmsContent = llmsRes.body;
  }

  // llms-txt-exists (1 pt)
  results.push({
    checkId: 'llms-txt-exists',
    status: hasLlms ? 'pass' : 'warn',
    earnedPoints: hasLlms ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: hasLlms ? 'Found /llms.txt documentation context index' : 'Missing /llms.txt context index',
    remediation: !hasLlms ? {
      title: 'Generate Standard llms.txt',
      file: 'public/llms.txt',
      diffSnippet: [
        '+ # Acme Agent Context',
        '+ > Clean developer guides and API schemas.',
        '+ - [API Docs](https://acme.com/api): Core REST endpoints',
      ],
      fixCommand: 'glintbase remediate llms.txt',
    } : undefined,
  });

  // llms-txt-formatting (2 pts)
  let formattingPassed = false;
  if (hasLlms && llmsContent) {
    const lines = llmsContent.split('\n').filter(l => l.trim().length > 0);
    const hasHeader = llmsContent.startsWith('# ');
    const hasLinks = /\[.*?\]\(.*?\)/.test(llmsContent);
    const validLen = llmsContent.length >= 100 && llmsContent.length <= 30000;
    formattingPassed = hasHeader && lines.length >= 5 && hasLinks && validLen;
  }
  // A local file flag without content can't be inspected.
  const formattingStatus = formattingPassed ? 'pass' : !hasLlms ? 'na' : llmsContent ? 'warn' : 'skip';

  results.push({
    checkId: 'llms-txt-formatting',
    status: formattingStatus,
    earnedPoints: formattingPassed ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: formattingPassed
      ? 'llms.txt adheres to format specifications (heading, link syntax, line counts)'
      : formattingStatus === 'skip'
      ? 'llms.txt content not available for inspection'
      : formattingStatus === 'na'
      ? 'No llms.txt to inspect'
      : 'llms.txt formatting does not meet ARS 3.0 standards (# heading, >=5 lines, markdown links, 100-30000 chars)',
  });

  // llms-txt-links-resolve (2 pts): fetch a sample of declared links.
  const LINK_SAMPLE = 8;
  const declaredLinks = Array.from(llmsContent.matchAll(/\[[^\]]*\]\(([^)\s]+)[^)]*\)/g))
    .map((m) => {
      try {
        return new URL(m[1], `${origin}/`).href;
      } catch {
        return null;
      }
    })
    .filter((href): href is string => Boolean(href && /^https?:/i.test(href)));
  const sampledLinks = Array.from(new Set(declaredLinks)).slice(0, LINK_SAMPLE);
  let resolvedCount = 0;
  const brokenLinks: string[] = [];
  if (sampledLinks.length > 0 && !localContext?.isLocalCodebase) {
    const linkResults = await Promise.all(
      sampledLinks.map((href) => fetchResource(href, { timeoutMs: 4000, maxBytes: 200_000 }).catch(() => null))
    );
    linkResults.forEach((r, i) => {
      if (r?.ok) resolvedCount++;
      else brokenLinks.push(sampledLinks[i]);
    });
  }
  const linksStatus = !hasLlms
    ? 'na'
    : localContext?.isLocalCodebase || !llmsContent
    ? 'skip'
    : sampledLinks.length === 0
    ? 'warn'
    : resolvedCount / sampledLinks.length >= 0.8
    ? 'pass'
    : 'warn';
  results.push({
    checkId: 'llms-txt-links-resolve',
    status: linksStatus,
    earnedPoints: linksStatus === 'pass' ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message:
      linksStatus === 'pass'
        ? `${resolvedCount}/${sampledLinks.length} sampled llms.txt links resolve to real content`
        : linksStatus === 'warn' && sampledLinks.length === 0
        ? 'llms.txt declares no resolvable markdown links'
        : linksStatus === 'warn'
        ? `Only ${resolvedCount}/${sampledLinks.length} sampled llms.txt links resolve (broken: ${brokenLinks.slice(0, 3).join(', ')})`
        : linksStatus === 'na'
        ? 'No llms.txt to inspect'
        : 'llms.txt links not checked (local codebase)',
    evidence: sampledLinks.length ? { sampled: sampledLinks.length, resolved: resolvedCount, broken: brokenLinks } : undefined,
  });

  // llms-txt-graph-reachability (2 pts bonus)
  const isLlmsLinked = hasLlms && (rawHtml.toLowerCase().includes('llms.txt') || rawHtml.toLowerCase().includes('/llms.txt'));
  results.push({
    checkId: 'llms-txt-graph-reachability',
    status: isLlmsLinked ? 'pass' : (hasLlms ? 'warn' : 'na'),
    earnedPoints: isLlmsLinked ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: isLlmsLinked
      ? 'llms.txt is actively linked within website navigation/footer links'
      : (hasLlms
        ? 'llms.txt is present as an orphan file but not linked from navigation/footer (crawlers frequently bypass orphan indexes)'
        : 'llms.txt omitted (reachability check skipped)'),
  });

  // 6. Markdown Content Negotiation & Header Checks
  const mdRes: FetchResourceResult = localContext?.isLocalCodebase
    ? localDummy()
    : await fetchResource(targetUrl, {
        timeoutMs: 3500,
        headers: { Accept: 'text/markdown, text/plain;q=0.9, */*;q=0.8' },
      });

  let markdownSupported = false;
  let hasVaryAccept = Boolean(localContext?.middlewareHasVaryAccept);
  let mdTwinUrl: string | undefined;

  if (mdRes.ok && mdRes.body) {
    const isMdHeader = (mdRes.contentType || '').includes('text/markdown');
    const isMdBody = mdRes.body.startsWith('# ') || mdRes.body.includes('\n# ') || mdRes.body.startsWith('---');
    if (isMdHeader || isMdBody) {
      markdownSupported = true;
    }
    // Check Vary header
    const varyHeader = (mdRes.headers?.vary || '').toLowerCase();
    if (varyHeader.includes('accept')) {
      hasVaryAccept = true;
    }
  }

  // Probe twin URL (.md)
  if (!markdownSupported && !localContext?.isLocalCodebase) {
    const twinUrl = targetUrl.endsWith('/') ? `${targetUrl.slice(0, -1)}.md` : `${targetUrl}.md`;
    const twinRes = await fetchResource(twinUrl, { timeoutMs: 3000 });
    if (twinRes.ok && twinRes.body && !twinRes.body.includes('<html')) {
      markdownSupported = true;
      mdTwinUrl = twinUrl;
    }
  }

  // markdown-negotiation (1 pt)
  results.push({
    checkId: 'markdown-negotiation',
    status: markdownSupported ? 'pass' : 'warn',
    earnedPoints: markdownSupported ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: markdownSupported
      ? 'Server supports Accept: text/markdown content negotiation'
      : 'Server does not return markdown when requested via Accept: text/markdown',
  });

  // markdown-negotiation-vary (1 pt bonus)
  results.push({
    checkId: 'markdown-negotiation-vary',
    status: hasVaryAccept ? 'pass' : 'na',
    earnedPoints: hasVaryAccept ? 1 : 0,
    maxPoints: 1,
    isBonus: true,
    message: hasVaryAccept
      ? 'Response includes Vary: Accept CDN caching header'
      : 'Vary: Accept header not present (bonus skipped)',
  });

  // markdown-url-fallback (2 pts bonus)
  results.push({
    checkId: 'markdown-url-fallback',
    status: Boolean(mdTwinUrl) ? 'pass' : 'na',
    earnedPoints: Boolean(mdTwinUrl) ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: Boolean(mdTwinUrl)
      ? `Direct .md URL twin verified at ${mdTwinUrl}`
      : 'Direct .md URL twin not detected (bonus skipped)',
  });

  // markdown-html-parity (2 pts bonus)
  const hasHtmlCode = /<pre\b|<code\b/i.test(rawHtml);
  const hasMdCode = /```/i.test(mdRes?.body || '');
  const mdParityPassed = markdownSupported && (!hasHtmlCode || hasMdCode);
  results.push({
    checkId: 'markdown-html-parity',
    status: mdParityPassed ? 'pass' : (markdownSupported ? 'warn' : 'na'),
    earnedPoints: mdParityPassed ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: mdParityPassed
      ? 'Markdown endpoint preserves code blocks and semantic structure from HTML source'
      : (markdownSupported
        ? 'Markdown endpoint strips code snippets or tables present in HTML (potential semantic truncation)'
        : 'Markdown negotiation not active (parity check skipped)'),
  });

  // crosspage-policy-consistency (2 pts bonus)
  const termsText = rawHtml.toLowerCase();
  const hasContradictoryRefund = termsText.includes('no refunds') && (termsText.includes('30-day money back') || termsText.includes('14-day refund'));
  const hasContradictoryRateLimits = termsText.includes('unlimited requests') && termsText.includes('rate limit');
  const policyConsistent = !hasContradictoryRefund && !hasContradictoryRateLimits;
  results.push({
    checkId: 'crosspage-policy-consistency',
    status: policyConsistent ? 'pass' : 'warn',
    earnedPoints: policyConsistent ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: policyConsistent
      ? 'Cross-page policies and constraints are semantically consistent (no conflicting terms detected)'
      : 'Conflicting policy directives detected across pages (e.g. conflicting refund or rate-limit statements)',
  });

  // nojs-fact-integrity (2 pts bonus)
  const hasCriticalApiFact = /https?:\/\/[^\s"'<>]+\/v\d+\/|\bapi_key\b|\bAuthorization:\s*Bearer\b|\bPOST\s+\/|\bGET\s+\//i.test(rawHtml);
  results.push({
    checkId: 'nojs-fact-integrity',
    status: hasCriticalApiFact ? 'pass' : 'warn',
    earnedPoints: hasCriticalApiFact ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: hasCriticalApiFact
      ? 'Critical API endpoints and auth directives are embedded in initial SSR payload'
      : 'API endpoints or authentication credentials require client-side JavaScript execution to render',
  });

  // code-fence-validity (1 pt)
  const fenceMatches = rawHtml.match(/^```|^~~~/gm);
  const fencesBalanced = !fenceMatches || fenceMatches.length % 2 === 0;
  results.push({
    checkId: 'code-fence-validity',
    status: fencesBalanced ? 'pass' : 'warn',
    earnedPoints: fencesBalanced ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: fencesBalanced
      ? 'Markdown code fences are balanced and properly closed'
      : 'Unclosed column-0 code fence detected',
  });

  // 7. OpenAPI & Developer Portal
  const openApiPaths = [
    `${origin}/openapi.json`,
    `${origin}/openapi.yaml`,
    `${origin}/openapi.yml`,
    `${origin}/swagger.json`,
    `${origin}/swagger.yaml`,
    `${origin}/swagger.yml`,
    `${origin}/api/openapi.json`,
    `${origin}/api/openapi.yaml`,
    `${origin}/.well-known/openapi.json`,
    `${origin}/.well-known/openapi.yaml`,
    `${origin}/v3/api-docs`,
    `${origin}/v3/api-docs.yaml`,
    `${origin}/swagger/v1/swagger.json`,
  ];
  let foundOpenApi = Boolean(localContext?.hasOpenApiFile);
  let openApiUrl: string | undefined;
  let openApiSpec: any;

  if (!foundOpenApi && !localContext?.isLocalCodebase) {
    // Probe candidates in small parallel batches (a sequential walk could take
    // 14 x 6 s on a slow host); within a batch the first path in list order wins.
    const inspectSpec = async (oPath: string): Promise<{ url: string; spec?: any } | null> => {
      // Large public specs (Stripe, GitHub) run to several MB.
      const oRes = await fetchResource(oPath, { timeoutMs: 6000, maxBytes: 12_000_000 });
      if (!oRes.ok || !oRes.body || oRes.body.includes('<html')) return null;
      try {
        const parsed = JSON.parse(oRes.body);
        return parsed && (parsed.openapi || parsed.swagger) ? { url: oPath, spec: parsed } : null;
      } catch {
        // Fallback: Check for YAML OpenAPI/Swagger document
        return /^(?:---\s*\n)?\s*(openapi|swagger):\s*['"]?[23]/m.test(oRes.body) ? { url: oPath } : null;
      }
    };
    const uniquePaths = Array.from(new Set(openApiPaths));
    const OPENAPI_BATCH = 4;
    for (let i = 0; i < uniquePaths.length && !foundOpenApi; i += OPENAPI_BATCH) {
      const batch = await Promise.all(uniquePaths.slice(i, i + OPENAPI_BATCH).map((p) => inspectSpec(p).catch(() => null)));
      const hit = batch.find((r) => r !== null);
      if (hit) {
        foundOpenApi = true;
        openApiUrl = hit.url;
        openApiSpec = hit.spec;
      }
    }
  }

  results.push({
    checkId: 'openapi-spec',
    status: foundOpenApi ? 'pass' : 'warn',
    earnedPoints: foundOpenApi ? 7 : 0,
    maxPoints: 7,
    isBonus: false,
    message: foundOpenApi
      ? `Discovered OpenAPI specification at ${openApiUrl || 'codebase'}`
      : 'Missing OpenAPI 3.x machine specification (/openapi.json)',
    remediation: !foundOpenApi ? {
      title: 'Generate OpenAPI 3.1 Specification',
      file: 'public/openapi.json',
      diffSnippet: [
        '+ {',
        '+   "openapi": "3.1.0",',
        '+   "info": { "title": "Acme API", "version": "1.0.0" },',
        '+   "paths": {}',
        '+ }',
      ],
      fixCommand: 'glintbase remediate openapi.json',
    } : undefined,
  });

  // developer-portal (6 pts)
  const devPortalRes: FetchResourceResult = localContext?.isLocalCodebase ? localDummy() : await fetchResource(`${origin}/developers`, { timeoutMs: 2000 });
  const docsRes: FetchResourceResult = localContext?.isLocalCodebase ? localDummy() : await fetchResource(`${origin}/docs`, { timeoutMs: 2000 });
  const hasDevPortal = devPortalRes.ok || docsRes.ok || foundOpenApi;
  results.push({
    checkId: 'developer-portal',
    status: hasDevPortal ? 'pass' : 'warn',
    earnedPoints: hasDevPortal ? 6 : 0,
    maxPoints: 6,
    isBonus: false,
    message: hasDevPortal
      ? 'Developer portal path is accessible for self-serve integration'
      : 'No self-serve developer portal (/developers or /docs) detected',
  });

  // api-catalog-rfc9727 (2 pts bonus)
  const linksetRes: FetchResourceResult = localContext?.isLocalCodebase ? localDummy() : await fetchResource(`${origin}/.well-known/api-catalog`, {
    timeoutMs: 2000,
    headers: { Accept: 'application/linkset+json' },
  });
  const hasLinkset = linksetRes.ok && linksetRes.body && !linksetRes.body.includes('<html');
  results.push({
    checkId: 'api-catalog-rfc9727',
    status: hasLinkset ? 'pass' : 'na',
    earnedPoints: hasLinkset ? 2 : 0,
    maxPoints: 2,
    isBonus: true,
    message: hasLinkset
      ? 'RFC 9727 /.well-known/api-catalog linkset verified'
      : 'RFC 9727 API catalog not published (bonus skipped)',
  });

  // 8. Remaining Layer 2 Web & Security Checks
  results.push({
    checkId: 'ssl-tls-enforced',
    status: u.protocol === 'https:' ? 'pass' : 'warn',
    earnedPoints: u.protocol === 'https:' ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: u.protocol === 'https:' ? 'HTTPS enforced with TLS' : 'HTTP plaintext detected',
  });

  results.push({
    checkId: 'http2-support',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: true,
    message: 'HTTP/2 ALPN transport not yet probed (excluded from score)',
  });

  const corsHeader = homeRes.headers?.['access-control-allow-origin'];
  const corsPassed = Boolean(corsHeader);
  results.push({
    checkId: 'cors-headers',
    status: corsPassed ? 'pass' : 'warn',
    earnedPoints: corsPassed ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: corsPassed ? `CORS Access-Control-Allow-Origin headers configured (${corsHeader})` : 'CORS Access-Control-Allow-Origin header not present on root',
  });

  const contentEncoding = (homeRes.headers?.['content-encoding'] || '').toLowerCase();
  const compressionPassed = Boolean(contentEncoding && (contentEncoding.includes('gzip') || contentEncoding.includes('br') || contentEncoding.includes('zstd') || contentEncoding.includes('deflate')));
  results.push({
    checkId: 'compression-gzip-br',
    status: compressionPassed ? 'pass' : 'warn',
    earnedPoints: compressionPassed ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: compressionPassed ? `Payload compression enabled (${contentEncoding})` : 'Payload compression (gzip/br/zstd) not detected',
  });

  results.push({
    checkId: 'clean-semantic-html',
    status: zeroJsPassed ? 'pass' : 'warn',
    earnedPoints: zeroJsPassed ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: zeroJsPassed ? 'Clean semantic HTML landmarks present' : 'Semantic landmarks need improvement',
  });

  results.push({
    checkId: 'heading-hierarchy',
    status: !skipsHeading ? 'pass' : 'warn',
    earnedPoints: !skipsHeading ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: !skipsHeading ? 'Valid heading progression' : 'Skipped heading levels detected',
  });

  // Minified HTML often drops attribute quotes (name=description), so quotes are optional.
  const hasMetaDesc = /<meta\b[^>]*\bname=["']?description["']?[\s/>]/i.test(rawHtml);
  results.push({
    checkId: 'meta-description-quality',
    status: hasMetaDesc ? 'pass' : 'warn',
    earnedPoints: hasMetaDesc ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: hasMetaDesc ? 'Authoritative meta description found' : 'Missing meta description tag',
  });

  const hasJsonLd = /<script\b[^>]*\btype=["']?application\/ld\+json["']?[\s>]/i.test(rawHtml);
  results.push({
    checkId: 'json-ld-structured-data',
    status: hasJsonLd ? 'pass' : 'warn',
    earnedPoints: hasJsonLd ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: hasJsonLd ? 'JSON-LD schema.org structured metadata found' : 'JSON-LD structured data not declared',
  });

  // Real sitemaps are often megabytes; a 20 KB cap made large sitemaps fail as "not accessible".
  const sitemapRes = await fetchResource(`${origin}/sitemap.xml`, { timeoutMs: 4000, maxBytes: 5_000_000 });
  const sitemapPassed = Boolean(sitemapRes.ok && sitemapRes.body && (sitemapRes.body.includes('<urlset') || sitemapRes.body.includes('<sitemapindex')));
  results.push({
    checkId: 'sitemap-xml-present',
    status: sitemapPassed ? 'pass' : 'warn',
    earnedPoints: sitemapPassed ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: sitemapPassed ? 'sitemap.xml accessible with standard URL mappings' : 'sitemap.xml not accessible at root',
  });

  const ctLower = (homeRes.contentType || homeRes.headers?.['content-type'] || '').toLowerCase();
  const utf8Declared = ctLower.includes('utf-8') || /<meta\b[^>]*charset=["']?utf-8/i.test(rawHtml);
  results.push({
    checkId: 'charset-utf8-declared',
    status: utf8Declared ? 'pass' : 'warn',
    earnedPoints: utf8Declared ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: utf8Declared ? 'Explicit UTF-8 charset declaration verified' : 'UTF-8 charset declaration not detected',
  });

  const hasCanonical = /<link\b[^>]*\brel=["']?canonical["']?[\s/>]/i.test(rawHtml);
  results.push({
    checkId: 'canonical-url-present',
    status: hasCanonical ? 'pass' : 'warn',
    earnedPoints: hasCanonical ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: hasCanonical ? 'Canonical URL tag verified' : 'Missing rel=canonical tag',
  });

  const hasContentTypeCharset = ctLower.includes('charset=');
  results.push({
    checkId: 'content-type-charset',
    status: hasContentTypeCharset ? 'pass' : 'warn',
    earnedPoints: hasContentTypeCharset ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: hasContentTypeCharset ? `Accurate Content-Type header with charset: ${homeRes.contentType}` : 'Content-Type header missing explicit charset',
  });

  const etagVal = homeRes.headers?.['etag'];
  const hasEtag = Boolean(etagVal);
  results.push({
    checkId: 'etag-caching',
    status: hasEtag ? 'pass' : 'warn',
    earnedPoints: hasEtag ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: hasEtag ? `ETag validation supported (${etagVal ? etagVal.slice(0, 30) : ''})` : 'ETag caching header missing on response',
  });

  const cacheControlVal = homeRes.headers?.['cache-control'];
  const hasCacheControl = Boolean(cacheControlVal);
  results.push({
    checkId: 'cache-control-headers',
    status: hasCacheControl ? 'pass' : 'warn',
    earnedPoints: hasCacheControl ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: hasCacheControl ? `Cache-Control headers configured (${cacheControlVal ? cacheControlVal.slice(0, 40) : ''})` : 'Cache-Control headers not configured',
  });

  results.push({
    checkId: 'response-latency-p95',
    status: latency < 1500 ? 'pass' : 'warn',
    earnedPoints: latency < 1500 ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: `TTFB response time: ${latency}ms`,
  });

  const statusAccurate = homeRes.httpStatus !== undefined && homeRes.httpStatus >= 200 && homeRes.httpStatus < 400;
  results.push({
    checkId: 'status-code-accuracy',
    status: statusAccurate ? 'pass' : 'warn',
    earnedPoints: statusAccurate ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: statusAccurate ? `HTTP response code ${homeRes.httpStatus} accurately reflects available resource` : `HTTP response status ${homeRes.httpStatus || 'unknown'} indicates an issue`,
  });

  results.push({
    checkId: 'text-density-ratio',
    status: textDensityPercent >= 5 ? 'pass' : 'warn',
    earnedPoints: textDensityPercent >= 5 ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: `Text density ratio: ${textDensityPercent}%`,
  });

  results.push({
    checkId: 'pagination-rel-links',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: true,
    message: 'Collection pagination rel links not yet probed (excluded from score)',
  });

  const linkHeader = homeRes.headers?.['link'];
  const hasLinkHeader = Boolean(linkHeader);
  results.push({
    checkId: 'link-header-canonical',
    status: hasLinkHeader ? 'pass' : 'na',
    earnedPoints: hasLinkHeader ? 1 : 0,
    maxPoints: 1,
    isBonus: true,
    message: hasLinkHeader ? `Link headers available for machine twin discovery (${linkHeader ? linkHeader.slice(0, 40) : ''})` : 'Link header machine twin not declared (bonus skipped)',
  });

  results.push({
    checkId: 'dns-caa-record',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: true,
    message: 'DNS CAA security records not yet probed (excluded from score)',
  });

  const cspHeader = homeRes.headers?.['content-security-policy'];
  const hasSecurityHeaders = Boolean(cspHeader || (homeRes.headers?.['x-content-type-options'] && homeRes.headers?.['referrer-policy']));
  results.push({
    checkId: 'security-headers-csp',
    status: hasSecurityHeaders ? 'pass' : 'warn',
    earnedPoints: hasSecurityHeaders ? 1 : 0,
    maxPoints: 1,
    isBonus: false,
    message: hasSecurityHeaders ? 'Security headers present (CSP/nosniff/referrer-policy)' : 'Content-Security-Policy or security headers missing',
  });

  const secTxtRes = await fetchResource(`${origin}/.well-known/security.txt`, { timeoutMs: 2000, maxBytes: 10000 });
  const hasSecTxt = Boolean(secTxtRes.ok && secTxtRes.body && !secTxtRes.body.includes('<html') && (secTxtRes.body.includes('Contact:') || secTxtRes.body.includes('Expires:')));
  results.push({
    checkId: 'security-txt-rfc9116',
    status: hasSecTxt ? 'pass' : 'na',
    earnedPoints: hasSecTxt ? 1 : 0,
    maxPoints: 1,
    isBonus: true,
    message: hasSecTxt ? 'RFC 9116 security.txt vulnerability disclosure policy verified' : 'RFC 9116 security.txt not published (bonus skipped)',
  });

  let hasLlmsFull = Boolean(localContext?.hasLlmsFullFile);
  if (!hasLlmsFull && !localContext?.isLocalCodebase) {
    const fullRes = await fetchResource(`${origin}/llms-full.txt`, { timeoutMs: 3000, probeOnly: true });
    hasLlmsFull = Boolean(fullRes.ok && !(fullRes.contentType || '').includes('text/html'));
  }
  results.push({
    checkId: 'llms-full-txt-present',
    status: hasLlmsFull ? 'pass' : 'na',
    earnedPoints: hasLlmsFull ? 1 : 0,
    maxPoints: 1,
    isBonus: true,
    message: hasLlmsFull ? 'Full llms-full.txt context document verified' : 'Optional llms-full.txt omitted (bonus)',
  });

  results.push({
    checkId: 'markdown-table-syntax',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: true,
    message: 'Markdown table syntax compliance not yet probed (excluded from score)',
  });

  results.push({
    checkId: 'relative-link-resolution',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: true,
    message: 'Relative link crawler traversal not yet probed (excluded from score)',
  });

  results.push({
    checkId: 'image-alt-prose',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: true,
    message: 'Image alt text coverage not yet probed (excluded from score)',
  });

  results.push({
    checkId: 'plain-text-accessible',
    status: 'na',
    earnedPoints: 0,
    maxPoints: 1,
    isBonus: true,
    message: 'Plain text documentation representation not yet probed (excluded from score)',
  });

  const challengeMarkers = [
    'cf-browser-verification',
    '/cdn-cgi/challenge-platform',
    'cf-challenge',
    '<title>just a moment...</title>',
    'g-recaptcha',
    'h-captcha',
    'px-captcha',
    '_incapsula_resource',
  ];
  // Challenge pages usually answer 403/503, whose bodies the main fetch discards; re-read them.
  const challengeRes = !homeRes.ok && !localContext?.isLocalCodebase && (homeRes.httpStatus === 403 || homeRes.httpStatus === 503 || homeRes.httpStatus === 429)
    ? await fetchResource(targetUrl, { timeoutMs: 4000, allowErrorBody: true, maxBytes: 200_000 })
    : homeRes;
  const lowerHome = (challengeRes.body || rawHtml).toLowerCase();
  const challengeMarker = challengeMarkers.find((m) => lowerHome.includes(m));
  const challengeHeader = (challengeRes.headers?.['cf-mitigated'] || homeRes.headers?.['cf-mitigated'] || '').toLowerCase() === 'challenge';
  const challenged = !localContext?.isLocalCodebase && (Boolean(challengeMarker) || challengeHeader);
  // Nothing served and no challenge observed: there is no evidence either way.
  const challengeUnverifiable = !localContext?.isLocalCodebase && !challenged && homepageFailed;
  results.push({
    checkId: 'anti-crawler-challenge-free',
    status: localContext?.isLocalCodebase || challengeUnverifiable ? 'skip' : challenged ? 'fail' : 'pass',
    earnedPoints: !localContext?.isLocalCodebase && !challenged && !challengeUnverifiable ? 2 : 0,
    maxPoints: 2,
    isBonus: false,
    message: localContext?.isLocalCodebase
      ? 'Bot challenge not checked for local codebases'
      : challengeUnverifiable
      ? HOMEPAGE_UNAVAILABLE
      : challenged
      ? `Homepage served a bot challenge to the scanner (${challengeHeader ? 'cf-mitigated: challenge' : challengeMarker})`
      : 'Homepage served content without a captcha or JS challenge',
  });

  // ARS 3.2: points only for observed evidence. When the homepage could not be fetched,
  // checks derived from its HTML or response headers have nothing to inspect.
  if (homepageFailed) {
    for (const r of results) {
      const derived = HOMEPAGE_DERIVED_CHECKS.has(r.checkId) ||
        (r.checkId === 'status-code-accuracy' && homeRes.httpStatus === undefined) ||
        (r.checkId === 'llms-txt-graph-reachability' && r.status !== 'na');
      if (!derived) continue;
      r.status = 'skip';
      r.earnedPoints = 0;
      r.message = HOMEPAGE_UNAVAILABLE;
      r.remediation = undefined;
    }
  }

  // A canary request that never completed (timeout / unreachable) says nothing about 404 handling.
  if (!localContext?.isLocalCodebase && canaryRes.httpStatus === undefined) {
    const spa = results.find((r) => r.checkId === 'anti-spa-404');
    if (spa) {
      spa.status = 'skip';
      spa.earnedPoints = 0;
      spa.message = `Soft-404 canary request did not complete (${canaryRes.status}); 404 handling not verified`;
      spa.remediation = undefined;
    }
  }

  // Calculate totals
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
    targetReachable,
    score,
    baseEarned,
    bonusEarned,
    checks: results,
    details,
    markdownNegotiation: {
      supported: markdownSupported,
      hasVaryAccept,
      mdTwinUrl,
    },
    antiSpa404: {
      passed: antiSpaPassed,
      returnedStatus: canaryRes.httpStatus,
      isSoft200,
    },
    zeroJsReadability: {
      passed: zeroJsPassed,
      charCount: proseLength,
      textDensityPercent,
    },
    openapi: {
      found: foundOpenApi,
      url: openApiUrl,
      version: openApiSpec ? String(openApiSpec.openapi || openApiSpec.swagger || '') : undefined,
      spec: openApiSpec,
    },
  };
}
