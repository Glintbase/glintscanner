import { describe, it, expect } from 'vitest';
import { classifyArchetype } from '../archetype';

describe('Archetype Classifier & Dynamic Denominator', () => {
  it('classifies developer platform from OpenAPI and docs surfaces', () => {
    const result = classifyArchetype({
      url: 'https://stripe.com/docs',
      surfaces: [
        { type: 'openapi', found: true, url: 'https://stripe.com/openapi.json' },
        { type: 'docs', found: true, url: 'https://stripe.com/docs' },
        { type: 'llms_txt', found: true, url: 'https://stripe.com/llms.txt' },
      ],
      html: '<h1>Stripe Developer Documentation</h1><p>npm install stripe and use your api key</p>',
    });

    expect(result.archetype).toBe('devtool');
    expect(result.activeLayers).toContain('discovery');
    expect(result.activeLayers).toContain('access');
    expect(result.activeLayers).toContain('usability');
    expect(result.activeLayers).not.toContain('payments');
    expect(result.totalDenominator).toBe(85);
    expect(result.excludedLayers.length).toBeGreaterThan(0);
    expect(result.excludedLayers[0].layer).toBe('Payments');
  });

  it('classifies e-commerce site with cart and price signals', () => {
    const result = classifyArchetype({
      url: 'https://shop.example.com/products/sneakers',
      html: '<div>$120.00</div><button>Add to cart</button><a href="/checkout">Checkout</a><p>In stock, free shipping</p>',
    });

    expect(result.archetype).toBe('ecommerce');
    expect(result.activeLayers).toContain('payments');
    expect(result.layerWeights.payments).toBe(10);
    expect(result.totalDenominator).toBe(100);
  });

  it('classifies editorial publication with articles and author metadata', () => {
    const result = classifyArchetype({
      url: 'https://blog.techmagazine.com/2026/09/ai-revolution',
      html: '<article><h1>The AI Revolution</h1><p>Written by Jane Doe. Published on Sept 4, 2026. 5 min read.</p></article>',
    });

    expect(['publisher', 'content_media']).toContain(result.archetype);
    expect(result.activeLayers).not.toContain('payments');
  });
});

describe('archetype overrides', () => {
  it('normalizes canonical names and legacy aliases, rejects unknown values', async () => {
    const { normalizeArchetypeOverride } = await import('../archetype');
    expect(normalizeArchetypeOverride(undefined)).toBe('auto');
    expect(normalizeArchetypeOverride('auto')).toBe('auto');
    expect(normalizeArchetypeOverride('content_media')).toBe('content_media');
    expect(normalizeArchetypeOverride('docs')).toBe('docs_kb');
    expect(normalizeArchetypeOverride('product')).toBe('api_devtool');
    expect(normalizeArchetypeOverride('ai-native')).toBeNull();
    expect(normalizeArchetypeOverride({})).toBeNull();
  });

  it('applies a content_media override with its own weights (not api_devtool)', () => {
    const result = classifyArchetype({ url: 'https://example.com', kindOverride: 'content_media' });
    expect(result.canonicalArchetype).toBe('content_media');
    expect(result.layerWeights.usability).toBe(0);
    expect(result.activeLayers).not.toContain('usability');
  });
});
