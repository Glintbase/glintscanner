/**
 * Glintbase ARS 3.0 Archetype Classifier & Dynamic Denominator Engine
 * Specification: GLINTBASE_AUDIT_3_0_UPGRADE_SPEC.md (Section 2.2)
 *
 * Archetypes:
 * - api_devtool: Developer APIs, SDKs, CLI tools, SaaS (Base: 85 pts)
 * - docs_kb: Documentation sites, Knowledge Bases (Base: 85 pts)
 * - ecommerce: Transactional stores, paid checkouts (Base: 100 pts)
 * - content_media: Publishers, blogs, corporate portals (Base: 50 pts)
 */

export type SiteArchetype = 'api_devtool' | 'docs_kb' | 'ecommerce' | 'content_media' | 'devtool' | 'saas' | 'publisher';

export interface LayerWeightConfig {
  discovery: number;
  access: number;
  usability: number;
  payments: number;
}

export interface ArchetypeProfile {
  archetype: SiteArchetype;
  canonicalArchetype: 'api_devtool' | 'docs_kb' | 'ecommerce' | 'content_media';
  label: string;
  description: string;
  confidence: number;
  reasons: string[];
  activeLayers: Array<'discovery' | 'access' | 'usability' | 'payments'>;
  layerWeights: LayerWeightConfig;
  baseDenominator: number;
  totalDenominator: number;
  excludedLayers: Array<{ layer: string; reason: string }>;
}

export interface ArchetypeInput {
  url: string;
  kindOverride?: 'product' | 'docs' | 'ecommerce' | 'auto';
  html?: string;
  surfaces?: Array<{ type: string; found: boolean; url?: string }>;
  title?: string;
  metaDescription?: string;
}

const ARS3_BASE_WEIGHTS: Record<'api_devtool' | 'docs_kb' | 'ecommerce' | 'content_media', LayerWeightConfig> = {
  api_devtool: {
    discovery: 20,
    access: 30,
    usability: 35,
    payments: 0,
  },
  docs_kb: {
    discovery: 20,
    access: 30,
    usability: 35,
    payments: 0,
  },
  ecommerce: {
    discovery: 20,
    access: 30,
    usability: 40,
    payments: 10,
  },
  content_media: {
    discovery: 20,
    access: 30,
    usability: 0,
    payments: 0,
  },
};

export function classifyArchetype(input: ArchetypeInput): ArchetypeProfile {
  // Handle explicit kind override
  if (input.kindOverride && input.kindOverride !== 'auto') {
    let canonical: 'api_devtool' | 'docs_kb' | 'ecommerce' | 'content_media' = 'api_devtool';
    if (input.kindOverride === 'docs') canonical = 'docs_kb';
    else if (input.kindOverride === 'ecommerce') canonical = 'ecommerce';
    else if (input.kindOverride === 'product') canonical = 'api_devtool';

    const weights = { ...ARS3_BASE_WEIGHTS[canonical] };
    const baseDenominator = weights.discovery + weights.access + weights.usability + weights.payments;
    return {
      archetype: canonical,
      canonicalArchetype: canonical,
      label: canonical === 'docs_kb' ? 'Documentation / Knowledge Base' : canonical === 'ecommerce' ? 'E-Commerce / Online Merchant' : 'Developer Platform / API',
      description: 'Archetype explicitly set via --kind flag.',
      confidence: 1.0,
      reasons: [`Kind explicitly configured as ${input.kindOverride}`],
      activeLayers: (['discovery', 'access', 'usability', 'payments'] as const).filter(l => weights[l] > 0),
      layerWeights: weights,
      baseDenominator,
      totalDenominator: baseDenominator,
      excludedLayers: weights.payments === 0 ? [{ layer: 'Payments', reason: 'Excluded for non-commerce archetype' }] : [],
    };
  }

  const scores: Record<'api_devtool' | 'docs_kb' | 'ecommerce' | 'content_media', { score: number; reasons: string[] }> = {
    api_devtool: { score: 0, reasons: [] },
    docs_kb: { score: 0, reasons: [] },
    ecommerce: { score: 0, reasons: [] },
    content_media: { score: 0, reasons: [] },
  };

  const lowerUrl = input.url.toLowerCase();
  const text = `${input.title || ''} ${input.metaDescription || ''} ${(input.html || '').slice(0, 8000)}`.toLowerCase();

  // 1. Surface indicators
  if (input.surfaces) {
    const hasOpenAPI = input.surfaces.some((s) => (s.type === 'openapi' || s.type === 'api') && s.found);
    const hasDocs = input.surfaces.some((s) => s.type === 'docs' && s.found);
    const hasLlms = input.surfaces.some((s) => s.type === 'llms_txt' && s.found);
    const hasMcp = input.surfaces.some((s) => s.type === 'mcp' && s.found);

    if (hasOpenAPI) {
      scores.api_devtool.score += 40;
      scores.api_devtool.reasons.push('OpenAPI specification surface detected');
    }
    if (hasDocs) {
      scores.docs_kb.score += 35;
      scores.docs_kb.reasons.push('Dedicated documentation surface detected');
    }
    if (hasLlms || hasMcp) {
      scores.api_devtool.score += 25;
      scores.docs_kb.score += 20;
      scores.api_devtool.reasons.push('AI agent entrypoints (llms.txt / MCP) detected');
    }
  }

  // 2. URL signals
  if (lowerUrl.includes('docs.') || lowerUrl.includes('/docs') || lowerUrl.includes('/documentation') || lowerUrl.includes('/kb')) {
    scores.docs_kb.score += 40;
    scores.docs_kb.reasons.push('URL points directly to documentation/knowledge base hierarchy');
  }
  if (lowerUrl.includes('/api') || lowerUrl.includes('api.')) {
    scores.api_devtool.score += 35;
    scores.api_devtool.reasons.push('URL points directly to API endpoints');
  }
  if (lowerUrl.includes('/shop') || lowerUrl.includes('/store') || lowerUrl.includes('/cart') || lowerUrl.includes('/checkout') || lowerUrl.includes('/pricing')) {
    scores.ecommerce.score += 40;
    scores.ecommerce.reasons.push('URL points to commerce store or checkout');
  }
  if (lowerUrl.includes('/blog') || lowerUrl.includes('/news') || lowerUrl.includes('/article')) {
    scores.content_media.score += 35;
    scores.content_media.reasons.push('URL points to editorial content or blog');
  }

  // 3. E-Commerce signals in text/DOM
  const commerceKeywords = ['add to cart', 'buy now', 'shopping cart', 'checkout', 'free shipping', 'currency', 'sku', 'in stock'];
  const commerceMatches = commerceKeywords.filter((kw) => text.includes(kw));
  if (commerceMatches.length >= 2) {
    scores.ecommerce.score += commerceMatches.length * 15;
    scores.ecommerce.reasons.push(`Found commerce keywords: ${commerceMatches.slice(0, 3).join(', ')}`);
  }
  if (/(\$|€|£|¥)\s*\d+(\.\d{2})?/.test(text) && (text.includes('cart') || text.includes('order'))) {
    scores.ecommerce.score += 25;
    scores.ecommerce.reasons.push('Detected product price tags with cart/order context');
  }

  // 4. DevTool signals in text/DOM
  const devKeywords = ['npm install', 'pip install', 'curl -x', 'api key', 'sdk', 'endpoints', 'webhook', 'quickstart', 'developer documentation'];
  const devMatches = devKeywords.filter((kw) => text.includes(kw));
  if (devMatches.length >= 2) {
    scores.api_devtool.score += devMatches.length * 15;
    scores.api_devtool.reasons.push(`Found developer indicators: ${devMatches.slice(0, 3).join(', ')}`);
  }

  // 5. Publisher signals
  const pubKeywords = ['published on', 'written by', 'author', 'read time', 'min read', 'newsletter', 'editorial'];
  const pubMatches = pubKeywords.filter((kw) => text.includes(kw));
  if (pubMatches.length >= 2) {
    scores.content_media.score += pubMatches.length * 15;
    scores.content_media.reasons.push(`Found editorial publishing indicators: ${pubMatches.slice(0, 3).join(', ')}`);
  }

  // Pick top scoring archetype
  let topArchetype: 'api_devtool' | 'docs_kb' | 'ecommerce' | 'content_media' = 'api_devtool';
  let highestScore = -1;

  for (const [arch, val] of Object.entries(scores) as ['api_devtool' | 'docs_kb' | 'ecommerce' | 'content_media', { score: number; reasons: string[] }][]) {
    if (val.score > highestScore) {
      highestScore = val.score;
      topArchetype = arch;
    }
  }

  if (highestScore <= 0) {
    topArchetype = 'api_devtool';
    scores.api_devtool.reasons.push('Defaulted to Developer Platform based on domain baseline');
  }

  const weights = { ...ARS3_BASE_WEIGHTS[topArchetype] };
  const baseDenominator = weights.discovery + weights.access + weights.usability + weights.payments;

  const labels: Record<'api_devtool' | 'docs_kb' | 'ecommerce' | 'content_media', string> = {
    api_devtool: 'Developer Platform & API',
    docs_kb: 'Documentation / Knowledge Base',
    ecommerce: 'E-Commerce / Online Merchant',
    content_media: 'Content / Media Resource',
  };

  const descriptions: Record<'api_devtool' | 'docs_kb' | 'ecommerce' | 'content_media', string> = {
    api_devtool: 'Optimized for developer onboarding, OpenAPI execution, SDKs, and tool calling.',
    docs_kb: 'Optimized for clean text retrieval, search-oriented MCP tools, and zero-auth knowledge access.',
    ecommerce: 'Evaluates autonomous product discovery, cart operations, and machine commerce (x402/ACP/AP2).',
    content_media: 'Focused on markdown content negotiation, citation integrity, and entity grounding.',
  };

  const activeLayers: Array<'discovery' | 'access' | 'usability' | 'payments'> = [];
  if (weights.discovery > 0) activeLayers.push('discovery');
  if (weights.access > 0) activeLayers.push('access');
  if (weights.usability > 0) activeLayers.push('usability');
  if (weights.payments > 0) activeLayers.push('payments');

  const excludedLayers: Array<{ layer: string; reason: string }> = [];
  if (weights.payments === 0) {
    excludedLayers.push({
      layer: 'Payments',
      reason: `Excluded from denominator for ${labels[topArchetype]} (not an e-commerce storefront).`,
    });
  }
  if (weights.usability === 0) {
    excludedLayers.push({
      layer: 'Usability',
      reason: `Excluded from denominator for ${labels[topArchetype]} (editorial/content only).`,
    });
  }

  const mappedArchetype = topArchetype === 'api_devtool' ? 'devtool' : topArchetype;

  return {
    archetype: mappedArchetype,
    canonicalArchetype: topArchetype,
    label: labels[topArchetype],
    description: descriptions[topArchetype],
    confidence: Math.min(1.0, Math.max(0.6, (highestScore + 20) / 100)),
    reasons: scores[topArchetype].reasons,
    activeLayers,
    layerWeights: weights,
    baseDenominator,
    totalDenominator: baseDenominator,
    excludedLayers,
  };
}
