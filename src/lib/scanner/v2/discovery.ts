import { DiscoveredSurface, ScanV2Report } from './types';
import { fetchResource, verifyUrlExists } from './fetchResource';
import { parseLlmsTxt } from './parseLlmsTxt';
import { parseOpenAPI } from './parseOpenAPI';

// Timeout fetch helper (legacy wrapper — prefer fetchResource for new code)
async function fetchWithTimeout(url: string, timeoutMs = 5000, options: RequestInit = {}): Promise<Response | null> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Glintscanner-V2/2.0)',
        ...options.headers,
      },
    });
    return response;
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

async function verifyUrlExistence(url: string | null): Promise<boolean> {
  return verifyUrlExists(url, 2500);
}

async function fetchGithubFile(owner: string, repo: string, path: string): Promise<{ content: string; url: string } | null> {
  const branches = ['main', 'master'];
  for (const branch of branches) {
    const fileUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    const res = await fetchResource(fileUrl, { timeoutMs: 5000, maxBytes: 2_000_000 });
    if (res.ok && res.body != null) {
      return { content: res.body, url: fileUrl };
    }
  }
  return null;
}

function isDocsLikeUrl(raw: string): boolean {
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    return (
      host.startsWith('docs.') ||
      host.includes('docs.') ||
      path.includes('/docs') ||
      path.includes('/documentation') ||
      path.includes('/api-reference') ||
      host.includes('gitbook') ||
      host.includes('readme.io') ||
      host.includes('mintlify')
    );
  } catch {
    return false;
  }
}

export async function discoverEcosystem(
  url: string, 
  progressCallback?: (log: any) => void,
  enabledSurfaces?: string[]
): Promise<ScanV2Report> {
  const surfaces: DiscoveredSurface[] = [];

  const emitProgress = (check: string, status: string, message?: string) => {
    if (progressCallback) {
      progressCallback({ type: 'progress', check, status, message });
    }
  };

  const isSurfaceEnabled = (type: string): boolean => {
    if (!enabledSurfaces || enabledSurfaces.length === 0) return true;
    return enabledSurfaces.includes(type);
  };

  // Detect GitHub URL
  const githubMatch = url.match(/github\.com\/([^/]+)\/([^/]+)/i);
  const isGithubRepo = !!githubMatch;
  let githubOwner = '';
  let githubRepo = '';
  if (githubMatch) {
    githubOwner = githubMatch[1];
    githubRepo = githubMatch[2].split('/')[0].split('?')[0].split('#')[0].replace(/\.git$/i, '');
  }

  const origin = isGithubRepo ? `https://github.com/${githubOwner}/${githubRepo}` : new URL(url).origin;

  if (isGithubRepo) {
    emitProgress('validation', 'running', `DNS & reachability verification on GitHub repository ${origin}...`);
    const reachProbe = await fetchWithTimeout(origin, 6000, { method: 'GET' });
    if (!reachProbe || reachProbe.status !== 200) {
      emitProgress('validation', 'failed', `GitHub repository ${origin} is unreachable or private.`);
      throw new Error(`Invalid GitHub repository or target is unreachable/private.`);
    }
    emitProgress('validation', 'done', `Reachability verified successfully.`);
  } else {
    emitProgress('validation', 'running', `DNS & reachability verification on ${url}...`);
    // Prefer GET on full input URL first, fallback to origin
    let reach = await fetchResource(url, { timeoutMs: 8000, maxBytes: 64_000 });
    if (!reach.ok && url !== origin) {
      const originReach = await fetchResource(origin, { timeoutMs: 8000, maxBytes: 64_000 });
      if (originReach.ok) reach = originReach;
    }
    const isSuccessStatus = reach.ok || reach.status === 'too_large' || [200, 301, 302, 307, 308, 401, 403].includes(reach.httpStatus ?? 0);
    if (!isSuccessStatus) {
      emitProgress('validation', 'failed', `Target ${url} is unreachable.`);
      throw new Error(`Invalid domain or target is unreachable.`);
    }
    emitProgress('validation', 'done', `Reachability verified successfully.`);
  }

  // ─── Parallel Batch 1: Machine Specs & Homepage HTML ─────────────────────
  const probeLanding = async (): Promise<DiscoveredSurface | null> => {
    if (!isSurfaceEnabled('landing')) return null;
    const landingUrl = isGithubRepo ? origin : origin + '/';
    const landingOk = await verifyUrlExistence(landingUrl);
    return {
      type: 'landing',
      url: landingUrl,
      found: landingOk,
      status: landingOk ? 'verified' : 'missing',
      confidence: 'high',
      description: landingOk ? 'Landing / origin surface reachable.' : 'Landing origin unreachable.',
      fix: landingOk ? null : 'Ensure the product origin URL is publicly reachable.',
    };
  };

  const probeSitemap = async (): Promise<DiscoveredSurface> => {
    let sitemapFound = false;
    let sitemapUrl = isGithubRepo ? `${origin}/blob/main/sitemap.xml` : `${origin}/sitemap.xml`;

    if (isSurfaceEnabled('sitemap')) {
      if (isGithubRepo) {
        emitProgress('discovery', 'running', 'Searching for sitemap.xml in repository root...');
        const sitemapFile = await fetchGithubFile(githubOwner, githubRepo, 'sitemap.xml');
        if (sitemapFile) {
          sitemapFound = true;
          sitemapUrl = sitemapFile.url;
        }
      } else {
        emitProgress('discovery', 'running', 'Searching robots.txt and sitemaps...');
        const [robotsRes, sitemapRes] = await Promise.all([
          fetchWithTimeout(`${origin}/robots.txt`, 2500),
          fetchWithTimeout(sitemapUrl, 2500, { method: 'HEAD' }),
        ]);
        if (robotsRes && robotsRes.status === 200) {
          const robotsTxtContent = await robotsRes.text().catch(() => '');
          const sitemapMatch = robotsTxtContent.match(/sitemap:\s*(https?:\/\/\S+)/i);
          if (sitemapMatch && sitemapMatch[1]) {
            sitemapUrl = sitemapMatch[1];
            sitemapFound = true;
          }
        }
        if (!sitemapFound && sitemapRes && sitemapRes.status === 200) {
          sitemapFound = true;
        }
      }
    }

    return {
      type: 'sitemap',
      url: sitemapUrl,
      found: sitemapFound,
      status: sitemapFound ? 'verified' : 'missing',
      confidence: 'high',
      description: !isSurfaceEnabled('sitemap') 
        ? 'Scan skipped by user customization.' 
        : (sitemapFound ? 'Sitemap discovered and verified.' : 'No sitemap found.'),
      fix: sitemapFound ? null : 'Publish a sitemap.xml to aid structural discovery for agent crawlers.',
    };
  };

  const probeLlmsTxt = async (): Promise<DiscoveredSurface> => {
    let llmsFound = false;
    let llmsInvalid = false;
    let llmsQuality: DiscoveredSurface['quality'];
    let llmsUrl = isGithubRepo ? `${origin}/blob/main/llms.txt` : `${origin}/llms.txt`;

    if (isSurfaceEnabled('llms_txt')) {
      emitProgress('discovery', 'running', 'Probing and validating llms.txt...');
      if (isGithubRepo) {
        const llmsFile =
          (await fetchGithubFile(githubOwner, githubRepo, 'llms.txt')) ||
          (await fetchGithubFile(githubOwner, githubRepo, '.well-known/llms.txt'));
        if (llmsFile) {
          llmsUrl = llmsFile.url;
          const parsed = parseLlmsTxt(llmsFile.content, llmsUrl);
          if (parsed.valid) {
            llmsFound = true;
            llmsQuality = parsed.quality;
          } else {
            llmsInvalid = true;
            llmsQuality = 'invalid';
          }
        }
      } else {
        const wkLlmsUrl = `${origin}/.well-known/llms.txt`;
        const [hitRoot, hitWk] = await Promise.all([
          fetchResource(llmsUrl, { timeoutMs: 2500, maxBytes: 500_000 }),
          fetchResource(wkLlmsUrl, { timeoutMs: 2500, maxBytes: 500_000 }),
        ]);

        let body: string | undefined;
        if (hitRoot.ok && hitRoot.body) {
          body = hitRoot.body;
        } else if (hitWk.ok && hitWk.body) {
          llmsUrl = wkLlmsUrl;
          body = hitWk.body;
        }

        if (body) {
          const parsed = parseLlmsTxt(body, llmsUrl);
          if (parsed.valid) {
            llmsFound = true;
            llmsQuality = parsed.quality;
          } else {
            llmsInvalid = true;
            llmsQuality = 'invalid';
          }
        }
      }
    }

    return {
      type: 'llms_txt',
      url: llmsUrl,
      found: llmsFound,
      status: llmsFound ? 'verified' : llmsInvalid ? 'invalid' : 'missing',
      confidence: 'high',
      quality: llmsQuality,
      description: !isSurfaceEnabled('llms_txt')
        ? 'Scan skipped by user customization.'
        : llmsFound
          ? `Canonical llms.txt validated (${llmsQuality || 'good'}).`
          : llmsInvalid
            ? 'llms.txt present but failed content validation (empty, HTML error page, or too thin).'
            : 'Missing canonical /llms.txt directory.',
      fix: llmsFound
        ? null
        : 'Implement a /llms.txt file with Markdown summaries and links to guide AI crawlers.',
    };
  };

  const probeLlmsFullTxt = async (): Promise<DiscoveredSurface> => {
    let llmsFullFound = false;
    let llmsFullInvalid = false;
    let llmsFullUrl = isGithubRepo ? `${origin}/blob/main/llms-full.txt` : `${origin}/llms-full.txt`;

    if (isSurfaceEnabled('llms_full_txt')) {
      emitProgress('discovery', 'running', 'Probing llms-full.txt...');
      if (isGithubRepo) {
        const llmsFullFile = await fetchGithubFile(githubOwner, githubRepo, 'llms-full.txt');
        if (llmsFullFile) {
          llmsFullUrl = llmsFullFile.url;
          const parsed = parseLlmsTxt(llmsFullFile.content, llmsFullUrl);
          if (parsed.valid) llmsFullFound = true;
          else llmsFullInvalid = true;
        }
      } else {
        const hit = await fetchResource(llmsFullUrl, { timeoutMs: 2500, maxBytes: 1_000_000 });
        if (hit.ok && hit.body) {
          const parsed = parseLlmsTxt(hit.body, llmsFullUrl);
          if (parsed.valid) llmsFullFound = true;
          else llmsFullInvalid = true;
        }
      }
    }

    return {
      type: 'llms_full_txt',
      url: llmsFullUrl,
      found: llmsFullFound,
      status: llmsFullFound ? 'verified' : llmsFullInvalid ? 'invalid' : 'missing',
      confidence: 'high',
      description: !isSurfaceEnabled('llms_full_txt')
        ? 'Scan skipped by user customization.'
        : llmsFullFound
          ? 'Consolidated documentation file (llms-full.txt) validated.'
          : llmsFullInvalid
            ? 'llms-full.txt found but failed content validation.'
            : 'Missing consolidated docs index.',
      fix: llmsFullFound
        ? null
        : 'Create /llms-full.txt containing the full text of your docs to allow single-shot retrieval.',
    };
  };

  const probeOpenApi = async (): Promise<DiscoveredSurface> => {
    let openapiFound = false;
    let openapiInvalid = false;
    let openapiUrl = isGithubRepo ? `${origin}/blob/main/openapi.json` : `${origin}/openapi.json`;
    const openapiPaths = [
      'openapi.json',
      'openapi.yaml',
      'openapi.yml',
      'swagger.json',
      '.well-known/openapi.json',
    ];

    if (isSurfaceEnabled('openapi')) {
      emitProgress('discovery', 'running', 'Probing and validating OpenAPI specifications...');
      if (isGithubRepo) {
        for (const path of openapiPaths) {
          const openapiFile = await fetchGithubFile(githubOwner, githubRepo, path);
          if (openapiFile) {
            openapiUrl = openapiFile.url;
            const parsed = parseOpenAPI(openapiFile.content);
            if (parsed.valid) {
              openapiFound = true;
              break;
            }
            openapiInvalid = true;
          }
        }
      } else {
        const results = await Promise.all(
          openapiPaths.map(async (path) => {
            const probeUrl = `${origin}/${path}`;
            const hit = await fetchResource(probeUrl, { timeoutMs: 2500, maxBytes: 1_000_000 });
            if (hit.ok && hit.body) {
              const parsed = parseOpenAPI(hit.body);
              return { probeUrl, valid: parsed.valid };
            }
            return { probeUrl, valid: false };
          })
        );
        const match = results.find((r) => r.valid);
        if (match) {
          openapiFound = true;
          openapiUrl = match.probeUrl;
          openapiInvalid = false;
        } else if (results.some((r) => r.probeUrl)) {
          openapiInvalid = results.some((r) => !r.valid);
        }
      }
    }

    return {
      type: 'openapi',
      url: openapiUrl,
      found: openapiFound,
      status: openapiFound ? 'verified' : openapiInvalid ? 'invalid' : 'missing',
      confidence: 'high',
      description: !isSurfaceEnabled('openapi')
        ? 'Scan skipped by user customization.'
        : openapiFound
          ? 'Machine-readable OpenAPI spec parsed and validated.'
          : openapiInvalid
            ? 'OpenAPI-like URL found but body is not a valid OpenAPI document.'
            : 'No standard OpenAPI specification found.',
      fix: openapiFound
        ? null
        : 'Expose a valid OpenAPI spec at /openapi.json (with paths) for automatic client generation.',
    };
  };

  const probeMcp = async (): Promise<DiscoveredSurface> => {
    let mcpFound = false;
    let mcpUrl = isGithubRepo ? `${origin}/blob/main/mcp.json` : `${origin}/mcp.json`;

    if (isSurfaceEnabled('mcp')) {
      emitProgress('discovery', 'running', 'Probing for MCP configurations...');
      if (isGithubRepo) {
        const mcpFile =
          (await fetchGithubFile(githubOwner, githubRepo, 'mcp.json')) ||
          (await fetchGithubFile(githubOwner, githubRepo, '.well-known/mcp.json'));
        if (mcpFile) {
          try {
            const json = JSON.parse(mcpFile.content);
            if (json && typeof json === 'object') {
              mcpFound = true;
              mcpUrl = mcpFile.url;
            }
          } catch {
            /* invalid json */
          }
        }
      } else {
        const candidatePaths = [
          `${origin}/mcp.json`,
          `${origin}/.well-known/mcp.json`,
          `${origin}/.well-known/mcp/server-card.json`,
          `${origin}/.well-known/mcp/manifest.json`,
          `${origin}/api/mcp`,
          `${origin}/mcp`,
          `${origin}/v1/mcp`,
          `${origin}/api/v1/mcp`,
          `${origin}/sse`,
          `${origin}/mcp/sse`,
        ];

        const hits = await Promise.all(
          candidatePaths.map((p) =>
            fetchResource(p, {
              timeoutMs: 2500,
              maxBytes: 200_000,
              headers: { Accept: 'application/json, text/event-stream' },
              allowErrorBody: true,
            })
          )
        );

        for (const hit of hits) {
          if (hit.ok || hit.httpStatus === 200 || hit.httpStatus === 401) {
            // Streamable HTTP / SSE detection
            if (hit.contentType?.toLowerCase().includes('text/event-stream') || hit.headers?.['mcp-session-id'] || hit.headers?.['mcp-protocol-version']) {
              mcpFound = true;
              mcpUrl = hit.url;
              break;
            }
            if (hit.body && !String(hit.body).trim().startsWith('<')) {
              try {
                const json = JSON.parse(hit.body);
                if (json && typeof json === 'object') {
                  mcpFound = true;
                  mcpUrl = hit.url;
                  break;
                }
              } catch {
                if (hit.body.includes('"jsonrpc"') || hit.body.includes('"capabilities"')) {
                  mcpFound = true;
                  mcpUrl = hit.url;
                  break;
                }
              }
            }
          }
        }
      }
    }

    return {
      type: 'mcp',
      url: mcpUrl,
      found: mcpFound,
      status: mcpFound ? 'verified' : 'missing',
      confidence: 'high',
      description: !isSurfaceEnabled('mcp')
        ? 'Scan skipped by user customization.'
        : mcpFound
          ? 'Model Context Protocol (MCP) server or configuration discovered and validated.'
          : 'No discoverable Model Context Protocol config or live server found.',
      fix: mcpFound
        ? null
        : 'Expose a /mcp.json configuration file or streamable HTTP /sse /api/mcp endpoint describing available agent tools.',
    };
  };

  const fetchLandingHtml = async (): Promise<string[]> => {
    const hrefs: string[] = [];
    if (isGithubRepo) {
      emitProgress('discovery', 'running', 'Fetching and analyzing repository README.md links...');
      const readmeFile = (await fetchGithubFile(githubOwner, githubRepo, 'README.md')) || (await fetchGithubFile(githubOwner, githubRepo, 'readme.md'));
      if (readmeFile) {
        const landingHtml = readmeFile.content;
        const mdLinkRegex = /\[[^\]]*\]\((https?:\/\/[^\s)\]]+)\)/gi;
        let mdMatch;
        while ((mdMatch = mdLinkRegex.exec(landingHtml)) !== null) {
          hrefs.push(mdMatch[1]);
        }
        const htmlLinkRegex = /href=["'](https?:\/\/[^\s"']+)["']/gi;
        let htmlMatch;
        while ((htmlMatch = htmlLinkRegex.exec(landingHtml)) !== null) {
          hrefs.push(htmlMatch[1]);
        }
      }
    } else {
      emitProgress('discovery', 'running', 'Analyzing homepage HTML links for ecosystem surfaces...');
      const landingRes = await fetchWithTimeout(origin, 3000);
      const landingHtml = landingRes && landingRes.status === 200 ? await landingRes.text().catch(() => '') : '';
      const linkRegex = /href=["'](https?:\/\/[^\s"']+|[^\s"'>]+)["']/gi;
      let match;
      while ((match = linkRegex.exec(landingHtml)) !== null) {
        let link = match[1];
        if (link.startsWith('/')) {
          link = `${origin}${link}`;
        } else if (!link.startsWith('http')) {
          link = `${origin}/${link}`;
        }
        hrefs.push(link);
      }
    }
    return Array.from(new Set(hrefs));
  };

  // Run Batch 1: Machine Specs & Homepage Link Harvest in Parallel
  const [
    landingSurface,
    sitemapSurface,
    llmsTxtSurface,
    llmsFullTxtSurface,
    openapiSurface,
    mcpSurface,
    uniqueLinks,
  ] = await Promise.all([
    probeLanding(),
    probeSitemap(),
    probeLlmsTxt(),
    probeLlmsFullTxt(),
    probeOpenApi(),
    probeMcp(),
    fetchLandingHtml(),
  ]);

  if (landingSurface) surfaces.push(landingSurface);
  surfaces.push(sitemapSurface);
  surfaces.push(llmsTxtSurface);
  surfaces.push(llmsFullTxtSurface);
  surfaces.push(openapiSurface);
  surfaces.push(mcpSurface);

  // ─── Parallel Batch 2: Ecosystem Surface Link Verifications ────────────────
  const findLink = (keywords: string[]): string | null => {
    for (const link of uniqueLinks) {
      const lower = link.toLowerCase();
      if (keywords.some((kw) => lower.includes(kw))) {
        return link;
      }
    }
    return null;
  };

  // Classify URLs upfront
  const githubUrl = isGithubRepo ? url : findLink(['github.com/']);
  let docsUrl =
    findLink(['/docs', '/documentation', 'docs.', 'gitbook.io', 'docusaurus', 'readme.io', 'mintlify']) ||
    null;
  if (!docsUrl && isDocsLikeUrl(url) && !isGithubRepo) {
    try {
      docsUrl = url.startsWith('http') ? url : `https://${url}`;
    } catch {
      docsUrl = null;
    }
  }
  const apiRefUrl = findLink(['/api-reference', '/reference', '/api-docs', 'api.']);
  const authUrl = findLink(['/login', '/signup', '/auth', '/oauth', 'dashboard.']);
  const dashboardUrl = findLink(['dashboard.', 'app.', '/dashboard']);
  const supportUrl = findLink(['/support', '/help', 'help.', '/contact']);
  const blogUrl = findLink(['/blog']);
  const changelogUrl = findLink(['/changelog', '/releases']);
  const statusUrl = findLink(['status.', '/status', 'statuspage']);
  const sdkUrl = findLink(['/sdk', '/libraries', '/client', '/sdks', 'npmjs.com', 'pypi.org']);

  // Run all 10 surface link existence checks concurrently in parallel!
  emitProgress('discovery', 'running', 'Verifying ecosystem links in parallel...');
  const [
    githubVerified,
    docsVerified,
    apiRefVerified,
    authVerified,
    dashboardVerified,
    supportVerified,
    blogVerified,
    changelogVerified,
    statusVerified,
    sdkVerified,
  ] = await Promise.all([
    isSurfaceEnabled('github') ? (isGithubRepo ? Promise.resolve(true) : (githubUrl ? verifyUrlExistence(githubUrl) : Promise.resolve(false))) : Promise.resolve(false),
    isSurfaceEnabled('docs') ? (docsUrl ? verifyUrlExistence(docsUrl) : Promise.resolve(false)) : Promise.resolve(false),
    isSurfaceEnabled('api') ? (apiRefUrl ? verifyUrlExistence(apiRefUrl) : Promise.resolve(false)) : Promise.resolve(false),
    isSurfaceEnabled('auth') ? (authUrl ? verifyUrlExistence(authUrl) : Promise.resolve(false)) : Promise.resolve(false),
    isSurfaceEnabled('dashboard') ? (dashboardUrl ? verifyUrlExistence(dashboardUrl) : Promise.resolve(false)) : Promise.resolve(false),
    isSurfaceEnabled('support') ? (supportUrl ? verifyUrlExistence(supportUrl) : Promise.resolve(false)) : Promise.resolve(false),
    isSurfaceEnabled('blog') ? (blogUrl ? verifyUrlExistence(blogUrl) : Promise.resolve(false)) : Promise.resolve(false),
    isSurfaceEnabled('changelog') ? (changelogUrl ? verifyUrlExistence(changelogUrl) : Promise.resolve(false)) : Promise.resolve(false),
    isSurfaceEnabled('status') ? (statusUrl ? verifyUrlExistence(statusUrl) : Promise.resolve(false)) : Promise.resolve(false),
    isSurfaceEnabled('sdk') ? (sdkUrl ? verifyUrlExistence(sdkUrl) : Promise.resolve(false)) : Promise.resolve(false),
  ]);

  surfaces.push({
    type: 'github',
    url: githubUrl || `${origin}/github-missing`,
    found: githubVerified,
    status: githubVerified ? (isGithubRepo ? 'verified' : 'detected') : 'missing',
    confidence: githubVerified ? 'high' : 'low',
    description: !isSurfaceEnabled('github') 
      ? 'Scan skipped by user customization.' 
      : (githubVerified ? 'Linked GitHub repository verified.' : 'No valid public repository links found.'),
    fix: githubVerified ? null : 'Link your public GitHub repository on the homepage to supply code context to agents.',
  });

  surfaces.push({
    type: 'docs',
    url: docsUrl || `${origin}/docs`,
    found: docsVerified,
    status: docsVerified ? 'detected' : 'missing',
    confidence: docsVerified ? 'high' : 'low',
    description: !isSurfaceEnabled('docs')
      ? 'Scan skipped by user customization.'
      : docsVerified
        ? 'Documentation landing page verified.'
        : 'No valid documentation links detected.',
    fix: docsVerified ? null : 'Add a clearly visible link to your developer docs on the homepage.',
  });

  surfaces.push({
    type: 'api',
    url: apiRefVerified ? apiRefUrl! : (docsVerified ? docsUrl! : `${origin}/api-reference`),
    found: apiRefVerified,
    status: apiRefVerified ? 'detected' : 'missing',
    confidence: apiRefVerified ? 'high' : 'low',
    description: !isSurfaceEnabled('api') 
      ? 'Scan skipped by user customization.' 
      : (apiRefVerified ? 'Dedicated API Reference page verified.' : 'No separate API Reference link validated.'),
    fix: apiRefVerified ? null : 'Publish a dedicated API Reference link to describe raw endpoints clearly.',
  });

  surfaces.push({
    type: 'auth',
    url: authUrl || `${origin}/login`,
    found: authVerified,
    status: authVerified ? 'detected' : 'missing',
    confidence: 'medium',
    description: !isSurfaceEnabled('auth') 
      ? 'Scan skipped by user customization.' 
      : (authVerified ? 'Authentication or login portal link verified.' : 'Could not locate reachable developer login or console.'),
    fix: authVerified ? null : 'Ensure login and API key provisioning screens are discoverable for automated credential setups.',
  });

  surfaces.push({
    type: 'dashboard',
    url: dashboardVerified ? dashboardUrl! : (authVerified ? authUrl! : `${origin}/dashboard`),
    found: dashboardVerified,
    status: dashboardVerified ? 'detected' : 'missing',
    confidence: 'medium',
    description: !isSurfaceEnabled('dashboard') 
      ? 'Scan skipped by user customization.' 
      : (dashboardVerified ? 'Developer application dashboard verified.' : 'No reachable app console detected.'),
    fix: dashboardVerified ? null : 'Ensure a links dashboard is provided for developer keys and workspace management.',
  });

  surfaces.push({
    type: 'support',
    url: supportUrl || `${origin}/support`,
    found: supportVerified,
    status: supportVerified ? 'detected' : 'missing',
    confidence: 'medium',
    description: !isSurfaceEnabled('support') 
      ? 'Scan skipped by user customization.' 
      : (supportVerified ? 'Help center or support portal verified.' : 'No valid support links found.'),
    fix: supportVerified ? null : 'Provide help/support links so agents can retrieve troubleshooting logs.',
  });

  surfaces.push({
    type: 'blog',
    url: blogUrl || `${origin}/blog`,
    found: blogVerified,
    status: blogVerified ? 'detected' : 'missing',
    confidence: 'medium',
    description: !isSurfaceEnabled('blog') 
      ? 'Scan skipped by user customization.' 
      : (blogVerified ? 'Company blog verified.' : 'No active blog detected.'),
    fix: null,
  });

  surfaces.push({
    type: 'changelog',
    url: changelogUrl || `${origin}/changelog`,
    found: changelogVerified,
    status: changelogVerified ? 'detected' : 'missing',
    confidence: 'medium',
    description: !isSurfaceEnabled('changelog')
      ? 'Scan skipped by user customization.'
      : changelogVerified
        ? 'Developer changelog verified.'
        : 'No active changelog found.',
    fix: changelogVerified ? null : 'Publish a changelog so agents can verify API changes and version updates.',
  });

  surfaces.push({
    type: 'status',
    url: statusUrl || `${origin}/status`,
    found: statusVerified,
    status: statusVerified ? 'detected' : 'missing',
    confidence: 'medium',
    description: !isSurfaceEnabled('status')
      ? 'Scan skipped by user customization.'
      : statusVerified
        ? 'System status page verified.'
        : 'No status page detected.',
    fix: statusVerified ? null : 'Link a public status page for runtime reliability signals.',
  });

  surfaces.push({
    type: 'sdk',
    url: sdkUrl || `${origin}/sdk`,
    found: sdkVerified,
    status: sdkVerified ? 'detected' : 'missing',
    confidence: 'medium',
    description: !isSurfaceEnabled('sdk')
      ? 'Scan skipped by user customization.'
      : sdkVerified
        ? 'SDK / client libraries surface verified.'
        : 'No dedicated SDK documentation link detected.',
    fix: sdkVerified ? null : 'Publish SDK install guides (npm/pip) linked from docs or homepage.',
  });

  // Secondary MCP verification from ecosystem links
  const mcpSurfaceEntry = surfaces.find((s) => s.type === 'mcp');
  if (mcpSurfaceEntry && !mcpSurfaceEntry.found && isSurfaceEnabled('mcp')) {
    const mcpCandidateLink = findLink(['/mcp', '/sse', 'mcp.json', 'server-card.json']);
    if (mcpCandidateLink) {
      const verified = await verifyUrlExistence(mcpCandidateLink);
      if (verified) {
        mcpSurfaceEntry.found = true;
        mcpSurfaceEntry.url = mcpCandidateLink;
        mcpSurfaceEntry.status = 'verified';
        mcpSurfaceEntry.description = 'Model Context Protocol (MCP) entrypoint discovered and verified via ecosystem link.';
        mcpSurfaceEntry.fix = null;
      }
    }
  }

  // Update status for disabled surfaces to 'skipped' and ensure found is false
  for (const s of surfaces) {
    if (!isSurfaceEnabled(s.type)) {
      s.status = 'skipped';
      s.found = false;
    }
  }

  // 4. Calculate Agent Readiness Index (V2 Score out of 100)
  emitProgress('scoring', 'running', 'Synthesizing Agent Readiness Index...');
  
  const SURFACE_WEIGHTS: Record<string, number> = {
    llms_txt: 20,
    llms_full_txt: 10,
    openapi: 20,
    sitemap: 15,
    github: 15,
    docs: 10,
    api: 5,
    auth: 5,
  };

  let scannedScore = 0;
  let maxPossibleScore = 0;

  for (const s of surfaces) {
    const weight = SURFACE_WEIGHTS[s.type];
    if (weight !== undefined && isSurfaceEnabled(s.type)) {
      maxPossibleScore += weight;
      if (s.found) {
        scannedScore += weight;
      }
    }
  }

  const score = maxPossibleScore > 0 
    ? Math.round((scannedScore / maxPossibleScore) * 100) 
    : 0;

  emitProgress('scoring', 'done', `Index generated: ${score}/100.`);

  return {
    url,
    score,
    surfaces,
  };
}
