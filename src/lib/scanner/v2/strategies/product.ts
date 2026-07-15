import { Strategy, SimulatedAction, ExtractionResult, BaseNode, BaseEdge } from '../types';
import { generateHash } from './interface';

export class ProductStrategy implements Strategy {
  type_name = 'product' as const;

  matches(url: string, pageContent: string): number {
    const lowerUrl = url.toLowerCase();
    if (
      lowerUrl.includes('/product') || 
      lowerUrl.includes('/shop') || 
      lowerUrl.includes('/pricing') || 
      lowerUrl.includes('/item')
    ) {
      return 0.85;
    }
    if (pageContent.includes('schema.org/Product') || pageContent.includes('class="product-form')) {
      return 0.95;
    }
    return 0.15;
  }

  interact(url: string, pageContent: string): SimulatedAction[] {
    const actions: SimulatedAction[] = [];
    if (pageContent.includes('price-selector') || pageContent.includes('variant-option') || pageContent.includes('details-tab')) {
      actions.push({
        action_type: 'hover',
        target: '.variant-option, .price-selector',
        result_snapshot: 'Hovered over variant selectors to trigger price updates.',
      });
    }
    return actions;
  }

  extract(url: string, pageContent: string, actions: SimulatedAction[]): ExtractionResult {
    const entities: BaseNode[] = [];
    const relations: BaseEdge[] = [];

    const titleMatch = pageContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Product page';

    const cleanText = pageContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const productHash = generateHash(cleanText);

    // Heuristically detect price
    const priceRegex = /\$\d+(?:\.\d{2})?/gi;
    const priceMatches = cleanText.match(priceRegex);
    const priceVal = priceMatches && priceMatches.length > 0 ? priceMatches[0] : 'N/A';

    // Heuristically detect degraded mode
    const isDegraded = priceVal === 'N/A' || cleanText.length < 500;

    // 1. Create Product Node (mapped to 'concept' type in base graph)
    const productNode: BaseNode = {
      id: `product:${productHash}`,
      type: 'concept',
      source_url: url,
      source_strategy: 'product',
      title,
      properties: {
        price: priceVal,
        currency: 'USD',
        isProduct: true,
        render_mode: isDegraded ? 'static_fallback' : 'static',
        render_degraded: isDegraded,
      },
      content_hash: productHash,
      extracted_at: new Date().toISOString(),
      confidence: isDegraded ? 0.6 : 1.0,
    };
    entities.push(productNode);

    // 2. Extract variant nodes if price points are found
    if (priceMatches && priceMatches.length > 1) {
      priceMatches.slice(1, 4).forEach((vPrice, idx) => {
        const variantHash = generateHash(vPrice + '-' + idx);
        const variantNode: BaseNode = {
          id: `variant:${variantHash}`,
          type: 'concept',
          source_url: url,
          source_strategy: 'product',
          title: `${title} - Option ${idx + 1}`,
          properties: {
            price: vPrice,
            isVariant: true,
          },
          content_hash: variantHash,
          extracted_at: new Date().toISOString(),
          confidence: 0.9,
        };
        entities.push(variantNode);

        // Connect variant to product
        relations.push({
          id: `rel:${productHash}:variant:${variantHash}`,
          from_id: variantNode.id,
          to_id: productNode.id,
          relation: 'variant_of',
          source_url: url,
          properties: {},
        });
      });
    }

    return { entities, relations };
  }

  get_next_urls(url: string, pageContent: string): string[] {
    const hrefs: string[] = [];
    const linkRegex = /href=["'](https?:\/\/[^\s"']+|[^\s"'>]+)["']/gi;
    let match;
    const origin = new URL(url).origin;

    while ((match = linkRegex.exec(pageContent)) !== null) {
      let link = match[1];
      if (link.startsWith('/')) {
        link = `${origin}${link}`;
      } else if (!link.startsWith('http')) {
        link = `${origin}/${link}`;
      }
      // Follow related/pricing/shop references shallowly (cap depth)
      if (link.includes('/product') || link.includes('/pricing') || link.includes('/shop')) {
        hrefs.push(link);
      }
    }

    return Array.from(new Set(hrefs)).slice(0, 3);
  }
}
