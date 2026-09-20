/** Normalize user input into an absolute https/http URL (or empty string). Strips duplicate schemes like https://https:// */
export function normalizeUrl(input: string): string {
  let trimmed = input.trim();
  if (!trimmed) return '';

  // Extract initial repeated/chained schemes: e.g. "https://https://", "http://https://", "http://"
  const schemeMatches = trimmed.match(/^(https?:\/\/)+/i);
  let scheme = 'https://';
  if (schemeMatches) {
    const rawMatch = schemeMatches[0];
    const individualSchemes = rawMatch.match(/https?:\/\//gi);
    if (individualSchemes && individualSchemes.length === 1 && individualSchemes[0].toLowerCase().startsWith('http://')) {
      scheme = 'http://';
    } else {
      scheme = 'https://';
    }
    trimmed = trimmed.slice(rawMatch.length);
  }

  return `${scheme}${trimmed}`;
}

/**
 * Derive a display company name from a URL (Title Case).
 * e.g. docs.stripe.com → Stripe, github.com/org/repo → Repo
 */
export function deriveCompany(rawUrl: string): string {
  const slug = deriveCompanySlug(rawUrl);
  if (!slug) return 'Unknown';
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/**
 * Derive a URL-safe company slug (lowercase, no spaces).
 * Used for /scan/[slug] routes.
 */
export function deriveCompanySlug(rawUrl: string): string {
  let hostname = rawUrl;
  try {
    hostname = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`).hostname;
  } catch {
    hostname = rawUrl.replace(/^https?:\/\//i, '').split('/')[0];
  }
  hostname = hostname.toLowerCase().replace(/^www\./i, '');
  let company = hostname.split('.')[0] || 'unknown';
  if (['docs', 'www', 'developer', 'dev', 'api'].includes(company)) {
    company = hostname.split('.')[1] || company;
  }
  const githubMatch = rawUrl.match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (githubMatch) {
    company = githubMatch[2]
      .split('/')[0]
      .split('?')[0]
      .split('#')[0]
      .replace(/\.git$/i, '');
  }
  return company.toLowerCase();
}
