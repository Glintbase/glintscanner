import { CheckResult, CategoryResult } from './types';
import { FIX_PROMPTS } from '../prompts/fixPrompts';

export async function checkMachine(url: string): Promise<CategoryResult> {
  const base = new URL(url).origin;
  const results: CheckResult[] = [];

  // 1. OpenAPI / Swagger Spec Auto-Discovery (10 pts)
  let openapiFound = false;

  // Probe main page for Link headers first
  const headRes = await fetch(url, { method: 'HEAD' }).catch(() => null);
  if (headRes) {
    const linkHeader = headRes.headers.get('link') || '';
    if (linkHeader.toLowerCase().includes('openapi') || linkHeader.toLowerCase().includes('swagger')) {
      openapiFound = true;
    }
  }

  // Probe common OpenAPI endpoints
  const commonPaths = [
    '/.well-known/openapi.json',
    '/openapi.json',
    '/openapi.yaml',
    '/swagger.json',
    '/swagger.yaml',
    '/api-docs'
  ];

  if (!openapiFound) {
    for (const path of commonPaths) {
      const probe = await fetch(`${base}${path}`, { method: 'HEAD' }).catch(() => null);
      if (probe && probe.status === 200) {
        openapiFound = true;
        break;
      }
    }
  }

  results.push({
    id: 'openapi_discovery',
    label: 'OpenAPI/Swagger Spec Auto-Discovery',
    passed: openapiFound,
    points: openapiFound ? 10 : 0,
    maxPoints: 10,
    fix: openapiFound ? null : 'Expose an OpenAPI or Swagger specification at a standard path (e.g. /openapi.json) or link to it using the "Link" HTTP response header with rel="openapi".'
  });

  // 2. JSON-LD Structured Schema (10 pts)
  let hasJsonLd = false;
  let hasValidType = false;

  const rawHtml = await fetch(url).then(r => r.text()).catch(() => '');
  if (rawHtml.includes('application/ld+json')) {
    hasJsonLd = true;
    
    // Find json-ld blocks and search for types
    const regex = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = regex.exec(rawHtml)) !== null) {
      const content = match[1];
      if (
        content.includes('TechArticle') || 
        content.includes('Guide') || 
        content.includes('APIReference') || 
        content.includes('WebSite') ||
        content.includes('SoftwareApplication')
      ) {
        hasValidType = true;
        break;
      }
    }
  }

  const jsonLdPassed = hasJsonLd && hasValidType;
  results.push({
    id: 'json_ld',
    label: 'JSON-LD Structured Schema (TechArticle / APIReference / Guide)',
    passed: jsonLdPassed,
    points: jsonLdPassed ? 10 : hasJsonLd ? 5 : 0,
    maxPoints: 10,
    fix: jsonLdPassed ? null : 'Embed a <script type="application/ld+json"> block classifying your docs as a TechArticle, Guide, or APIReference, containing semantically enriched metadata.'
  });

  const score = results.reduce((s, r) => s + r.points, 0);

  return {
    category: 'machine',
    score,
    maxScore: 20,
    results
  };
}
