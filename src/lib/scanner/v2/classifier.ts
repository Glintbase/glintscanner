import { ClassificationSignal } from './types';

const CONFIDENCE_THRESHOLD = 0.6;

// Helper to strip HTML tags for text analysis
function cleanText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export class Classifier {
  classifyHeuristics(url: string, html: string): ClassificationSignal[] {
    const signals: ClassificationSignal[] = [
      { strategy_type: 'repo', confidence: 0.0, reasons: [] },
      { strategy_type: 'docs', confidence: 0.0, reasons: [] },
      { strategy_type: 'blog', confidence: 0.0, reasons: [] },
      { strategy_type: 'product', confidence: 0.0, reasons: [] },
    ];

    const repo = signals[0];
    const docs = signals[1];
    const blog = signals[2];
    const product = signals[3];

    const lowerUrl = url.toLowerCase();

    // 1. URL Path Pattern Heuristics
    if (lowerUrl.includes('github.com/') || lowerUrl.includes('gitlab.com/')) {
      repo.confidence += 0.8;
      repo.reasons.push('URL points to a known code repository host');
    }
    if (
      lowerUrl.includes('/docs') || 
      lowerUrl.includes('/documentation') || 
      lowerUrl.includes('docs.') || 
      lowerUrl.includes('/reference') || 
      lowerUrl.includes('/api-docs') ||
      lowerUrl.includes('/api-reference')
    ) {
      docs.confidence += 0.5;
      docs.reasons.push('URL path contains documentation keywords');
    }
    if (
      lowerUrl.includes('/blog') || 
      lowerUrl.includes('/article') || 
      lowerUrl.includes('/posts') || 
      /\/\d{4}\/\d{2}\//.test(lowerUrl) // Matches /2025/07/ etc.
    ) {
      blog.confidence += 0.6;
      blog.reasons.push('URL matches standard blog or article path structures');
    }
    if (
      lowerUrl.includes('/product') || 
      lowerUrl.includes('/shop') || 
      lowerUrl.includes('/pricing') || 
      lowerUrl.includes('/item') || 
      lowerUrl.includes('/checkout') || 
      lowerUrl.includes('/cart')
    ) {
      product.confidence += 0.5;
      product.reasons.push('URL contains e-commerce or product keywords');
    }

    // 2. Meta Tags (og:type, og:site_name)
    const ogTypeMatch = html.match(/<meta\s+property=["']og:type["']\s+content=["']([^"']+)["']/i) ||
                        html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:type["']/i);
    if (ogTypeMatch) {
      const typeVal = ogTypeMatch[1].toLowerCase();
      if (typeVal === 'product') {
        product.confidence += 0.4;
        product.reasons.push('OpenGraph type is explicitly "product"');
      } else if (typeVal === 'article' || typeVal === 'blog') {
        blog.confidence += 0.4;
        blog.reasons.push(`OpenGraph type is explicitly "${typeVal}"`);
      }
    }

    // 3. Structured Data (<script type="application/ld+json">)
    const ldJsonRegex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = ldJsonRegex.exec(html)) !== null) {
      try {
        const jsonContent = match[1].trim();
        if (jsonContent.includes('"@type": "Product"') || jsonContent.includes('"@type":"Product"')) {
          product.confidence += 0.5;
          product.reasons.push('JSON-LD schema contains Product type');
        }
        if (jsonContent.includes('"@type": "Article"') || jsonContent.includes('"@type": "BlogPosting"') || jsonContent.includes('"@type":"Article"') || jsonContent.includes('"@type":"BlogPosting"')) {
          blog.confidence += 0.5;
          blog.reasons.push('JSON-LD schema contains Article or BlogPosting type');
        }
        if (jsonContent.includes('"@type": "SoftwareSourceCode"') || jsonContent.includes('"@type":"SoftwareSourceCode"')) {
          repo.confidence += 0.6;
          repo.reasons.push('JSON-LD schema contains SoftwareSourceCode type');
        }
      } catch {}
    }

    // 4. DOM Fingerprints
    if (
      html.includes('class="mintlify-') || 
      html.includes('id="__docusaurus') || 
      html.includes('class="gitbook-root') || 
      html.includes('id="gitbook-') || 
      html.includes('class="readme-') || 
      html.includes('id="mintlify-')
    ) {
      docs.confidence += 0.6;
      docs.reasons.push('DOM fingerprint matches a known developer documentation framework');
    }
    if (
      html.includes('class="shopify-') || 
      html.includes('id="shopify-') || 
      html.includes('class="product-form') || 
      html.includes('class="add-to-cart') || 
      html.includes('class="woocommerce-')
    ) {
      product.confidence += 0.6;
      product.reasons.push('DOM structure matches an e-commerce or product catalog pattern');
    }
    if (
      html.includes('class="repository-content') || 
      html.includes('class="file-wrap') || 
      html.includes('id="repo-content-')
    ) {
      repo.confidence += 0.7;
      repo.reasons.push('DOM contains repository file browser elements');
    }

    // Normalize confidence values to stay in [0.0, 1.0] range
    return signals.map(s => ({
      ...s,
      confidence: Math.min(1.0, s.confidence),
    }));
  }

  async classify(url: string, html: string): Promise<ClassificationSignal[]> {
    return this.classifyHeuristics(url, html);
  }
}
