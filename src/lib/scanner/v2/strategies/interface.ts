import { Strategy, SimulatedAction, ExtractionResult } from '../types';

export interface ScrapeOptions {
  render_mode?: 'static' | 'playwright' | 'static_fallback';
  render_degraded?: boolean;
}

export function generateHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

// Check content health for dynamic render escalation
export function isContentSuspicious(html: string, wordCount: number, type: 'docs' | 'blog' | 'product' | 'repo' | 'generic'): boolean {
  if (wordCount < 150) {
    return true; // Word count is suspiciously thin
  }
  if (html.includes('<div id="root"></div>') || html.includes('<div id="app"></div>')) {
    return true; // React/Vue mount points are empty (no static server-side HTML)
  }
  if (type === 'product') {
    // Check if standard product fields (price, add to cart, shop) are completely missing in static html
    const hasPrice = /\$\d+(\.\d{2})?|price|cents/i.test(html);
    const hasAddToCart = /add to cart|add to bag|buy now|buy-button/i.test(html);
    if (!hasPrice || !hasAddToCart) {
      return true;
    }
  }
  return false;
}
