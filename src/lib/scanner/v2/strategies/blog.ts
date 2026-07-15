import { Strategy, SimulatedAction, ExtractionResult, BaseNode, BaseEdge } from '../types';
import { generateHash } from './interface';

export class BlogStrategy implements Strategy {
  type_name = 'blog' as const;

  matches(url: string, pageContent: string): number {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('/blog') || lowerUrl.includes('/article') || /\/\d{4}\/\d{2}\//.test(lowerUrl)) {
      return 0.85;
    }
    if (pageContent.includes('schema.org/BlogPosting') || pageContent.includes('schema.org/Article')) {
      return 0.9;
    }
    return 0.15;
  }

  interact(url: string, pageContent: string): SimulatedAction[] {
    const actions: SimulatedAction[] = [];
    if (pageContent.includes('read-more') || pageContent.includes('continue-reading') || pageContent.includes('load-comments')) {
      actions.push({
        action_type: 'click',
        target: '.read-more, button:contains("Comments")',
        result_snapshot: 'Triggered expansion of full article text and comments.',
      });
    }
    return actions;
  }

  extract(url: string, pageContent: string, actions: SimulatedAction[]): ExtractionResult {
    const entities: BaseNode[] = [];
    const relations: BaseEdge[] = [];

    const titleMatch = pageContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Blog Article';

    const cleanText = pageContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const articleHash = generateHash(cleanText);

    // 1. Create Article Node (type 'page' in the UI/base schema)
    const articleNode: BaseNode = {
      id: `article:${articleHash}`,
      type: 'page',
      source_url: url,
      source_strategy: 'blog',
      title,
      properties: {
        blogArticle: true,
        wordCount: cleanText.split(/\s+/).length,
      },
      content_hash: articleHash,
      extracted_at: new Date().toISOString(),
      confidence: 1.0,
    };
    entities.push(articleNode);

    // 2. Extract Author (if present)
    const authorMatch = pageContent.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i) ||
                        pageContent.match(/author["']:\s*["']([^"']+)["']/i) ||
                        pageContent.match(/class=["']author-name["'][^>]*>([^<]+)/i);
    if (authorMatch) {
      const authorName = authorMatch[1].trim();
      const authorHash = generateHash(authorName);
      const authorNode: BaseNode = {
        id: `author:${authorHash}`,
        type: 'concept',
        source_url: url,
        source_strategy: 'blog',
        title: authorName,
        properties: {
          role: 'Author',
        },
        extracted_at: new Date().toISOString(),
        confidence: 0.85,
      };
      entities.push(authorNode);

      // Connect Article to Author
      relations.push({
        id: `rel:${articleHash}:author:${authorHash}`,
        from_id: articleNode.id,
        to_id: authorNode.id,
        relation: 'authored_by',
        source_url: url,
        properties: {},
      });
    }

    // 3. Connect to any standard concepts mentioned in the post
    const textToLower = title.toLowerCase() + ' ' + cleanText.toLowerCase().slice(0, 1000);
    const concepts = [
      { id: 'concept:authentication', label: 'Authentication', keywords: ['auth', 'api key', 'security', 'login'] },
      { id: 'concept:webhooks', label: 'Webhooks', keywords: ['webhook', 'callback', 'listener', 'events'] },
      { id: 'concept:sdk_usage', label: 'SDK Usage', keywords: ['sdk', 'library', 'npm', 'gemini'] }
    ];

    concepts.forEach(c => {
      if (c.keywords.some(kw => textToLower.includes(kw))) {
        const conceptNode: BaseNode = {
          id: c.id,
          type: 'concept',
          source_url: url,
          source_strategy: 'blog',
          title: c.label,
          properties: {},
          extracted_at: new Date().toISOString(),
          confidence: 0.7,
        };
        entities.push(conceptNode);

        relations.push({
          id: `rel:${articleHash}:${c.id}`,
          from_id: articleNode.id,
          to_id: c.id,
          relation: 'mentions',
          source_url: url,
          properties: {},
        });
      }
    });

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
      // Follow related posts shallowly (only 1 hop of blog directories)
      if (link.includes('/blog/') || link.includes('/posts/')) {
        hrefs.push(link);
      }
    }

    return Array.from(new Set(hrefs)).slice(0, 4);
  }
}
