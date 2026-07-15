import { Strategy, SimulatedAction, ExtractionResult, BaseNode, BaseEdge } from '../types';
import { generateHash } from './interface';
import { parsePageContent, detectContentKind } from '../parseContent';

const CONCEPT_MATCHERS: [string[], string, string][] = [
  [['auth', 'api key', 'token', 'credential', 'oauth', 'bearer'], 'concept:authentication', 'Authentication'],
  [['quickstart', 'getting started', 'install', 'setup', 'onboard'], 'concept:onboarding', 'Onboarding'],
  [['webhook', 'callback', 'event', 'listener', 'subscribe'], 'concept:webhooks', 'Webhooks'],
  [['error', 'exception', 'troubleshoot', 'diagnose', 'debug'], 'concept:error_handling', 'Error Handling'],
  [['rate limit', 'throttle', 'quota'], 'concept:rate_limiting', 'Rate Limiting'],
  [['pagination', 'cursor', 'offset'], 'concept:pagination', 'Pagination'],
  [['sdk', 'library', 'client library', 'package'], 'concept:sdk_usage', 'SDK Usage'],
  [['endpoint', 'rest', 'graphql', 'grpc'], 'concept:api_endpoints', 'API Endpoints'],
];

export class DocsStrategy implements Strategy {
  type_name = 'docs' as const;

  matches(url: string, pageContent: string): number {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('/docs') || lowerUrl.includes('docs.') || lowerUrl.includes('/documentation')) {
      return 0.9;
    }
    if (pageContent.includes('class="mintlify-') || pageContent.includes('id="__docusaurus')) {
      return 0.95;
    }
    // Markdown docs often have heading structure
    if (detectContentKind(pageContent) === 'markdown' && /^#+\s+/m.test(pageContent)) {
      return 0.7;
    }
    return 0.2;
  }

  interact(url: string, pageContent: string): SimulatedAction[] {
    const actions: SimulatedAction[] = [];
    if (
      pageContent.includes('language-select') ||
      pageContent.includes('tab-button') ||
      pageContent.includes('code-block-header')
    ) {
      actions.push({
        action_type: 'expand',
        target: '.code-block-header button, .tab-button',
        result_snapshot: 'Expanded language tabs to retrieve Python, JS, and cURL snippets.',
      });
    }
    return actions;
  }

  extract(url: string, pageContent: string, actions: SimulatedAction[]): ExtractionResult {
    const entities: BaseNode[] = [];
    const relations: BaseEdge[] = [];

    const parsed = parsePageContent(pageContent, 'Docs Page');
    const title = parsed.title;
    const pageHash = generateHash(parsed.textForMatch || pageContent);

    const pageNode: BaseNode = {
      id: `docs:${pageHash}`,
      type: 'page',
      source_url: url,
      source_strategy: 'docs',
      title,
      properties: {
        wordCount: parsed.wordCount,
        contentKind: parsed.contentKind,
      },
      content_hash: pageHash,
      extracted_at: new Date().toISOString(),
      confidence: 1.0,
    };
    entities.push(pageNode);

    const textToMatch = [title, ...parsed.headings, parsed.textForMatch.slice(0, 2000)]
      .join(' ')
      .toLowerCase();

    for (const [keywords, conceptId, conceptLabel] of CONCEPT_MATCHERS) {
      if (keywords.some((kw) => textToMatch.includes(kw))) {
        const matchedHeading =
          parsed.headings.find((h) => keywords.some((kw) => h.toLowerCase().includes(kw))) || title;

        const conceptNode: BaseNode = {
          id: conceptId,
          type: 'concept',
          source_url: url,
          source_strategy: 'docs',
          title: conceptLabel,
          properties: {
            detectedFrom: title,
            evidence: {
              source_url: url,
              heading: matchedHeading,
              snippet: matchedHeading.slice(0, 200),
            },
            synthetic: false,
          },
          extracted_at: new Date().toISOString(),
          confidence: 0.9,
        };
        entities.push(conceptNode);

        relations.push({
          id: `rel:${pageHash}:${conceptId}`,
          from_id: pageNode.id,
          to_id: conceptId,
          relation: 'documents',
          source_url: url,
          properties: {},
        });
      }
    }

    // Prefer pre-extracted code blocks from dual parser
    const codeBlocks = parsed.codeBlocks.length > 0 ? parsed.codeBlocks : [];

    codeBlocks.slice(0, 5).forEach((block) => {
      const codeHash = generateHash(block.code);
      const codeNode: BaseNode = {
        id: `code:${codeHash}`,
        type: 'code_example',
        source_url: url,
        source_strategy: 'docs',
        title: `${block.lang.toUpperCase()} Sample`,
        properties: {
          lang: block.lang,
          snippet_hash: codeHash,
        },
        content_hash: codeHash,
        extracted_at: new Date().toISOString(),
        confidence: 1.0,
      };
      entities.push(codeNode);

      relations.push({
        id: `rel:${pageHash}:${codeHash}`,
        from_id: pageNode.id,
        to_id: codeNode.id,
        relation: 'example_of',
        source_url: url,
        properties: {},
      });
    });

    return { entities, relations };
  }

  get_next_urls(url: string, pageContent: string): string[] {
    const hrefs: string[] = [];
    const origin = new URL(url).origin;
    const kind = detectContentKind(pageContent);

    if (kind === 'markdown') {
      // [text](url) and bare https links
      const mdLink = /\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/gi;
      let m;
      while ((m = mdLink.exec(pageContent)) !== null) {
        let link = m[2];
        if (link.startsWith('/')) link = `${origin}${link}`;
        if (link.includes('/docs') || link.includes('docs.')) hrefs.push(link);
      }
    } else {
      const linkRegex = /href=["'](https?:\/\/[^\s"']+|[^\s"'>]+)["']/gi;
      let match;
      while ((match = linkRegex.exec(pageContent)) !== null) {
        let link = match[1];
        if (link.startsWith('/')) {
          link = `${origin}${link}`;
        } else if (!link.startsWith('http')) {
          link = `${origin}/${link}`;
        }
        if (link.includes('/docs') || link.includes('docs.')) {
          hrefs.push(link);
        }
      }
    }

    return Array.from(new Set(hrefs)).slice(0, 15);
  }
}
