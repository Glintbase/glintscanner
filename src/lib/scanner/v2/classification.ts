import { DiscoveredSurface } from './types';

// Helper to probe headers and HTML canonical links
async function classifySingleSurface(surface: DiscoveredSurface): Promise<DiscoveredSurface> {
  if (!surface.found || surface.url.includes('-missing')) {
    return {
      ...surface,
      canonical: false,
      freshness: 'N/A',
      userFacing: surface.type !== 'openapi' && surface.type !== 'llms_txt' && surface.type !== 'llms_full_txt' && surface.type !== 'sitemap',
    };
  }

  const isUserFacing = surface.type !== 'openapi' && surface.type !== 'llms_txt' && surface.type !== 'llms_full_txt' && surface.type !== 'sitemap';
  
  try {
    const res = await fetch(surface.url, { 
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Glintscanner-V2/2.0)'
      }
    });

    if (!res || res.status !== 200) {
      return {
        ...surface,
        canonical: false,
        freshness: 'unknown',
        userFacing: isUserFacing,
      };
    }

    // Check last modified header
    const lastModified = res.headers.get('last-modified') || res.headers.get('date') || 'unknown';

    // Check canonical link in HTML
    const html = await res.text().catch(() => '');
    const canonicalMatch = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    let isCanonical = true;

    if (canonicalMatch && canonicalMatch[1]) {
      const canonicalUrl = canonicalMatch[1];
      try {
        const url1 = new URL(surface.url);
        const url2 = new URL(canonicalUrl);
        // If host or pathname differs significantly, mark as non-canonical duplicate
        isCanonical = url1.hostname === url2.hostname && url1.pathname.replace(/\/$/, '') === url2.pathname.replace(/\/$/, '');
      } catch {
        isCanonical = false;
      }
    }

    return {
      ...surface,
      canonical: isCanonical,
      freshness: lastModified,
      userFacing: isUserFacing,
      description: isCanonical 
        ? `${surface.description} (Canonical Source)` 
        : `${surface.description} (Warning: Points to canonical ${canonicalMatch?.[1] || 'elsewhere'})`,
    };

  } catch {
    return {
      ...surface,
      canonical: false,
      freshness: 'unknown',
      userFacing: isUserFacing,
    };
  }
}

export async function classifySurfaces(
  surfaces: DiscoveredSurface[],
  progressCallback?: (log: any) => void
): Promise<DiscoveredSurface[]> {
  const emitProgress = (check: string, status: string, message?: string) => {
    if (progressCallback) {
      progressCallback({ type: 'progress', check, status, message });
    }
  };

  emitProgress('classification', 'running', 'Classifying discovered ecosystem surfaces...');
  
  const classified: DiscoveredSurface[] = [];
  
  for (const s of surfaces) {
    if (s.found) {
      emitProgress('classification', 'running', `Analyzing metadata for ${s.type.toUpperCase().replace('_', '.')}...`);
    }
    const result = await classifySingleSurface(s);
    classified.push(result);
  }

  emitProgress('classification', 'done', 'Surface metadata classification complete.');
  return classified;
}
