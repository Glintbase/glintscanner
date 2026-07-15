/**
 * llms.txt content validation (SPEC-02 / SPEC-03).
 */

export interface LlmsParseResult {
  valid: boolean;
  reason?: string;
  textLength: number;
  links: string[];
  sections: string[];
  quality: 'empty' | 'thin' | 'good';
}

const MIN_CHARS = 40;

function looksLikeHtmlErrorPage(body: string): boolean {
  const sample = body.slice(0, 2000).toLowerCase();
  if (sample.includes('<!doctype html') || sample.includes('<html')) {
    // Real llms.txt should be plain text / markdown, not a full HTML shell
    if (sample.includes('<head') || sample.includes('<body')) return true;
  }
  return false;
}

export function parseLlmsTxt(body: string, baseUrl?: string): LlmsParseResult {
  const text = (body || '').trim();
  if (text.length < MIN_CHARS) {
    return {
      valid: false,
      reason: `Body shorter than ${MIN_CHARS} characters`,
      textLength: text.length,
      links: [],
      sections: [],
      quality: 'empty',
    };
  }

  if (looksLikeHtmlErrorPage(text)) {
    return {
      valid: false,
      reason: 'Body looks like an HTML page, not llms.txt',
      textLength: text.length,
      links: [],
      sections: [],
      quality: 'empty',
    };
  }

  const sections: string[] = [];
  const headingRe = /^#+\s+(.+)$/gm;
  let m;
  while ((m = headingRe.exec(text)) !== null) {
    sections.push(m[1].trim());
  }

  const links: string[] = [];
  const mdLink = /\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/gi;
  while ((m = mdLink.exec(text)) !== null) {
    let href = m[2];
    if (href.startsWith('/') && baseUrl) {
      try {
        href = new URL(href, baseUrl).href;
      } catch {
        /* keep relative */
      }
    }
    links.push(href);
  }
  const bareUrl = /https?:\/\/[^\s)<>"']+/gi;
  while ((m = bareUrl.exec(text)) !== null) {
    links.push(m[0].replace(/[.,;]+$/, ''));
  }

  const uniqueLinks = Array.from(new Set(links));
  const quality: LlmsParseResult['quality'] =
    text.length < 120 && uniqueLinks.length === 0 ? 'thin' : 'good';

  return {
    valid: true,
    textLength: text.length,
    links: uniqueLinks,
    sections,
    quality,
  };
}
