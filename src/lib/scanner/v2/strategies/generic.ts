import { Strategy, SimulatedAction, ExtractionResult, BaseNode } from '../types';
import { generateHash } from './interface';

export class GenericStrategy implements Strategy {
  type_name = 'generic' as const;

  matches(url: string, pageContent: string): number {
    return 0.1; // Baseline fallback
  }

  interact(url: string, pageContent: string): SimulatedAction[] {
    return [];
  }

  extract(url: string, pageContent: string, actions: SimulatedAction[]): ExtractionResult {
    const titleMatch = pageContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url;

    const descMatch = pageContent.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                      pageContent.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
    const desc = descMatch ? descMatch[1] : '';

    const cleanText = pageContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const hash = generateHash(cleanText);

    const node: BaseNode = {
      id: `page:${hash}`,
      type: 'page',
      source_url: url,
      source_strategy: 'generic',
      title,
      properties: {
        description: desc,
        wordCount: cleanText.split(/\s+/).length,
      },
      content_hash: hash,
      extracted_at: new Date().toISOString(),
      confidence: 1.0,
    };

    return {
      entities: [node],
      relations: [],
    };
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
      hrefs.push(link);
    }

    // Limit to top 5 unique outbound URLs to avoid bloated generic crawls
    return Array.from(new Set(hrefs)).slice(0, 5);
  }
}
