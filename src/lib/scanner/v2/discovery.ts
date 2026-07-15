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
  return verifyUrlExists(url, 5000);
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
    emitProgress('validation', 'running', `DNS & reachability verification on ${origin}...`);
    // Prefer GET (many CDNs reject HEAD)
    const reach = await fetchResource(origin, { timeoutMs: 6000, maxBytes: 64_000 });
    if (!reach.ok && reach.status !== 'too_large' && reach.httpStatus !== 401 && reach.httpStatus !== 403) {
      emitProgress('validation', 'failed', `Target ${origin} is unreachable.`);
      throw new Error(`Invalid domain or target is unreachable.`);
    }
    emitProgress('validation', 'done', `Reachability verified successfully.`);
  }

  // Landing surface (always recorded)
  if (isSurfaceEnabled('landing')) {
    const landingUrl = isGithubRepo ? origin : origin + '/';
    const landingOk = await verifyUrlExistence(landingUrl);
    surfaces.push({
      type: 'landing',
      url: landingUrl,
      found: landingOk,
      status: landingOk ? 'verified' : 'missing',
      confidence: 'high',
      description: landingOk ? 'Landing / origin surface reachable.' : 'Landing origin unreachable.',
      fix: landingOk ? null : 'Ensure the product origin URL is publicly reachable.',
    });
  }

  // 1. Sitemap Probing
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
      let robotsTxtContent = '';
      const robotsRes = await fetchWithTimeout(`${origin}/robots.txt`);
      if (robotsRes && robotsRes.status === 200) {
        robotsTxtContent = await robotsRes.text().catch(() => '');
        const sitemapMatch = robotsTxtContent.match(/sitemap:\s*(https?:\/\/\S+)/i);
        if (sitemapMatch && sitemapMatch[1]) {
          sitemapUrl = sitemapMatch[1];
          sitemapFound = true;
        }
      }
      if (!sitemapFound) {
        const sitemapRes = await fetchWithTimeout(sitemapUrl, 4000, { method: 'HEAD' });
        if (sitemapRes && sitemapRes.status === 200) {
          sitemapFound = true;
        }
      }
    }
  }

  surfaces.push({
    type: 'sitemap',
    url: sitemapUrl,
    found: sitemapFound,
    status: sitemapFound ? 'verified' : 'missing',
    confidence: 'high',
    description: !isSurfaceEnabled('sitemap') 
      ? 'Scan skipped by user customization.' 
      : (sitemapFound ? 'Sitemap discovered and verified.' : 'No sitemap found.'),
    fix: sitemapFound ? null : 'Publish a sitemap.xml to aid structural discovery for agent crawlers.',
  });

  // 2. Machine Readability Specs (llms.txt, OpenAPI, MCP) — content-validated
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
      let body: string | undefined;
      let hit = await fetchResource(llmsUrl, { timeoutMs: 5000, maxBytes: 500_000 });
      if (!hit.ok || !hit.body) {
        const wkLlmsUrl = `${origin}/.well-known/llms.txt`;
        hit = await fetchResource(wkLlmsUrl, { timeoutMs: 5000, maxBytes: 500_000 });
        if (hit.ok && hit.body) {
          llmsUrl = wkLlmsUrl;
          body = hit.body;
        }
      } else {
        body = hit.body;
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

  surfaces.push({
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
  });

  // Probing llms-full.txt (GET + content validation)
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
      const hit = await fetchResource(llmsFullUrl, { timeoutMs: 5000, maxBytes: 2_000_000 });
      if (hit.ok && hit.body) {
        const parsed = parseLlmsTxt(hit.body, llmsFullUrl);
        if (parsed.valid) llmsFullFound = true;
        else llmsFullInvalid = true;
      }
    }
  }

  surfaces.push({
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
  });

  // OpenAPI Discovery — GET + parse validation
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
      for (const path of openapiPaths) {
        const probeUrl = `${origin}/${path}`;
        const hit = await fetchResource(probeUrl, { timeoutMs: 5000, maxBytes: 2_000_000 });
        if (hit.ok && hit.body) {
          openapiUrl = probeUrl;
          const parsed = parseOpenAPI(hit.body);
          if (parsed.valid) {
            openapiFound = true;
            openapiInvalid = false;
            break;
          }
          openapiInvalid = true;
        }
      }
    }
  }

  surfaces.push({
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
  });

  // Probing MCP configuration — GET
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
      let hit = await fetchResource(mcpUrl, { timeoutMs: 5000, maxBytes: 200_000 });
      if (!hit.ok || !hit.body) {
        const wkMcpUrl = `${origin}/.well-known/mcp.json`;
        hit = await fetchResource(wkMcpUrl, { timeoutMs: 5000, maxBytes: 200_000 });
        if (hit.ok && hit.body) mcpUrl = wkMcpUrl;
      }
      if (hit.ok && hit.body) {
        try {
          const json = JSON.parse(hit.body);
          if (json && typeof json === 'object' && !String(hit.body).trim().startsWith('<')) {
            mcpFound = true;
          }
        } catch {
          /* not json */
        }
      }
    }
  }

  surfaces.push({
    type: 'mcp',
    url: mcpUrl,
    found: mcpFound,
    status: mcpFound ? 'verified' : 'missing',
    confidence: 'high',
    description: !isSurfaceEnabled('mcp')
      ? 'Scan skipped by user customization.'
      : mcpFound
        ? 'Model Context Protocol (mcp.json) configuration discovered and validated as JSON.'
        : 'No discoverable Model Context Protocol (mcp.json) config found.',
    fix: mcpFound
      ? null
      : 'Expose a /mcp.json configuration file describing available agent server tool entrypoints.',
  });

  // 3. HTML / README Content Discovery for links
  let landingHtml = '';
  const hrefs: string[] = [];

  // We always fetch home HTML to classify other links, but we only probe/verify classified links if they are enabled
  if (isGithubRepo) {
    emitProgress('discovery', 'running', 'Fetching and analyzing repository README.md links...');
    const readmeFile = await fetchGithubFile(githubOwner, githubRepo, 'README.md') || await fetchGithubFile(githubOwner, githubRepo, 'readme.md');
    if (readmeFile) {
      landingHtml = readmeFile.content;
      // Match [text](url)
      const mdLinkRegex = /\[[^\]]*\]\((https?:\/\/[^\s)\]]+)\)/gi;
      let mdMatch;
      while ((mdMatch = mdLinkRegex.exec(landingHtml)) !== null) {
        hrefs.push(mdMatch[1]);
      }
      // Match href="url" or href='url'
      const htmlLinkRegex = /href=["'](https?:\/\/[^\s"']+)["']/gi;
      let htmlMatch;
      while ((htmlMatch = htmlLinkRegex.exec(landingHtml)) !== null) {
        hrefs.push(htmlMatch[1]);
      }
    }
  } else {
    emitProgress('discovery', 'running', 'Analyzing homepage HTML links for ecosystem surfaces...');
    const landingRes = await fetchWithTimeout(origin);
    landingHtml = landingRes && landingRes.status === 200 ? await landingRes.text().catch(() => '') : '';
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

  const uniqueLinks = Array.from(new Set(hrefs));

  // Heuristic link classifiers
  const findLink = (keywords: string[]): string | null => {
    for (const link of uniqueLinks) {
      const lower = link.toLowerCase();
      if (keywords.some(kw => lower.includes(kw))) {
        return link;
      }
    }
    return null;
  };

  // Classify GitHub & Verify
  let githubVerified = false;
  const githubUrl = isGithubRepo ? url : findLink(['github.com/']);
  if (isSurfaceEnabled('github')) {
    emitProgress('discovery', 'running', 'Verifying GitHub repository link...');
    githubVerified = isGithubRepo ? true : (githubUrl ? await verifyUrlExistence(githubUrl) : false);
  }
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

  // Classify Docs Root & Verify — seed user URL when docs-like (SPEC-02)
  let docsVerified = false;
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
  if (isSurfaceEnabled('docs')) {
    emitProgress('discovery', 'running', 'Verifying developer documentation link...');
    docsVerified = docsUrl ? await verifyUrlExistence(docsUrl) : false;
    // If user URL is docs-like but link probe failed, still try the input URL
    if (!docsVerified && isDocsLikeUrl(url) && !isGithubRepo) {
      const seed = url.startsWith('http') ? url : `https://${url}`;
      docsVerified = await verifyUrlExistence(seed);
      if (docsVerified) docsUrl = seed;
    }
  }
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

  // Classify API Reference & Verify
  let apiRefVerified = false;
  const apiRefUrl = findLink(['/api-reference', '/reference', '/api-docs', 'api.']);
  if (isSurfaceEnabled('api')) {
    emitProgress('discovery', 'running', 'Verifying API reference link...');
    apiRefVerified = apiRefUrl ? await verifyUrlExistence(apiRefUrl) : false;
  }
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

  // Classify Auth & Verify
  let authVerified = false;
  const authUrl = findLink(['/login', '/signup', '/auth', '/oauth', 'dashboard.']);
  if (isSurfaceEnabled('auth')) {
    emitProgress('discovery', 'running', 'Verifying developer login/signup link...');
    authVerified = authUrl ? await verifyUrlExistence(authUrl) : false;
  }
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

  // Classify Dashboard & Verify
  let dashboardVerified = false;
  const dashboardUrl = findLink(['dashboard.', 'app.', '/dashboard']);
  if (isSurfaceEnabled('dashboard')) {
    emitProgress('discovery', 'running', 'Verifying developer dashboard link...');
    dashboardVerified = dashboardUrl ? await verifyUrlExistence(dashboardUrl) : false;
  }
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

  // Classify Support & Verify
  let supportVerified = false;
  const supportUrl = findLink(['/support', '/help', 'help.', '/contact']);
  if (isSurfaceEnabled('support')) {
    emitProgress('discovery', 'running', 'Verifying support/help center link...');
    supportVerified = supportUrl ? await verifyUrlExistence(supportUrl) : false;
  }
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

  // Classify Blog & Verify
  let blogVerified = false;
  const blogUrl = findLink(['/blog']);
  if (isSurfaceEnabled('blog')) {
    emitProgress('discovery', 'running', 'Verifying company blog link...');
    blogVerified = blogUrl ? await verifyUrlExistence(blogUrl) : false;
  }
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

  // Classify Changelog & Verify
  let changelogVerified = false;
  const changelogUrl = findLink(['/changelog', '/releases']);
  if (isSurfaceEnabled('changelog')) {
    emitProgress('discovery', 'running', 'Verifying changelog link...');
    changelogVerified = changelogUrl ? await verifyUrlExistence(changelogUrl) : false;
  }
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

  // Status page
  let statusVerified = false;
  const statusUrl = findLink(['status.', '/status', 'statuspage']);
  if (isSurfaceEnabled('status')) {
    emitProgress('discovery', 'running', 'Verifying status page link...');
    statusVerified = statusUrl ? await verifyUrlExistence(statusUrl) : false;
  }
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

  // SDK surface
  let sdkVerified = false;
  const sdkUrl = findLink(['/sdk', '/libraries', '/client', '/sdks', 'npmjs.com', 'pypi.org']);
  if (isSurfaceEnabled('sdk')) {
    emitProgress('discovery', 'running', 'Verifying SDK / libraries link...');
    sdkVerified = sdkUrl ? await verifyUrlExistence(sdkUrl) : false;
  }
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
