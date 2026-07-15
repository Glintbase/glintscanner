import { DiscoveredSurface } from './types';

// Detects the documentation portal framework/provider based on URL and HTML markers
export function detectFramework(html: string, url: string): string {
  try {
    const lowerUrl = url.toLowerCase();
    
    // 1. Check if the URL belongs to GitHub
    if (lowerUrl.includes('github.com')) {
      return 'GitHub Repo Layout';
    }

    const lowerHtml = html.toLowerCase();

    // 2. Check for Docusaurus
    if (
      lowerHtml.includes('id="__docusaurus"') ||
      lowerHtml.includes('generator" content="docusaurus') ||
      lowerHtml.includes('docusaurus-plugin-content-docs') ||
      lowerHtml.includes('docusaurus.config')
    ) {
      return 'Docusaurus';
    }

    // 3. Check for Mintlify
    if (
      lowerHtml.includes('__next') && (
        lowerHtml.includes('mintlify') || 
        lowerHtml.includes('mint.json') ||
        lowerHtml.includes('assets.mintlify.com')
      )
    ) {
      return 'Mintlify';
    }

    // 4. Check for Nextra
    if (
      lowerHtml.includes('nextra-') ||
      lowerHtml.includes('__nextra')
    ) {
      return 'Nextra';
    }

    // 5. Check for GitBook
    if (
      lowerHtml.includes('content="gitbook') ||
      lowerHtml.includes('generator" content="gitbook') ||
      lowerHtml.includes('gitbook-') ||
      lowerHtml.includes('gitbook.com')
    ) {
      return 'GitBook';
    }

    // 6. Check for ReadMe
    if (
      lowerHtml.includes('generator" content="readme') ||
      lowerHtml.includes('readme.io') ||
      lowerHtml.includes('class="readme-') ||
      lowerHtml.includes('rdme-')
    ) {
      return 'ReadMe';
    }

    // 7. Check for Swagger / Redoc / OpenAPI UI generator
    if (
      lowerHtml.includes('id="swagger-ui"') ||
      lowerHtml.includes('class="swagger-ui"') ||
      lowerHtml.includes('<redoc') ||
      lowerHtml.includes('id="redoc"')
    ) {
      return 'Swagger/OpenAPI UI';
    }

    return 'Custom Docs';
  } catch {
    return 'Custom Docs';
  }
}

export async function detectEcosystemFramework(
  surfaces: DiscoveredSurface[],
  progressCallback?: (log: any) => void
): Promise<string> {
  const emitProgress = (check: string, status: string, message?: string) => {
    if (progressCallback) {
      progressCallback({ type: 'progress', check, status, message });
    }
  };

  emitProgress('framework', 'running', 'Probing target docs HTML structure for framework indicators...');

  // Prioritize checking docs, api, and landing surface URLs
  const docsSurface = surfaces.find(s => s.found && (s.type === 'docs' || s.type === 'api' || s.type === 'landing'));
  
  if (!docsSurface || docsSurface.url.includes('-missing')) {
    emitProgress('framework', 'done', 'Ecosystem framework classification complete (Default: Custom Docs).');
    return 'Custom Docs';
  }

  try {
    const res = await fetch(docsSurface.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Glintscanner-V2/2.0)'
      }
    });

    if (res && res.status === 200) {
      const html = await res.text();
      const detected = detectFramework(html, docsSurface.url);
      emitProgress('framework', 'done', `Detected ecosystem framework signature: ${detected}`);
      return detected;
    }
  } catch (err) {
    console.error('Framework detection request failed:', err);
  }

  // Fallback signature check based on URL hostname
  const simpleDetect = detectFramework('', docsSurface.url);
  emitProgress('framework', 'done', `Ecosystem framework signature classification complete: ${simpleDetect}`);
  return simpleDetect;
}
