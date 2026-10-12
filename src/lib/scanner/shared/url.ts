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

/** Lowercase and reduce to URL-safe slug characters ([a-z0-9-_]). */
function toSlugSafe(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Derive a URL-safe company slug (lowercase, no spaces, no dots).
 * Used for /scan/[slug] routes and as the persistence key (company_slug).
 *
 * The slug comes from the registrable domain (eTLD+1), never from the first
 * hostname label, so stripe.attacker.com -> "attacker" (not "stripe").
 * Hosting platforms (vercel.app, github.io, ...) count as public suffixes:
 * acme.vercel.app -> "acme". Only URLs on exactly github.com use the repo name.
 */
export function deriveCompanySlug(rawUrl: string): string {
  const input = (rawUrl || '').trim();
  let hostname = '';
  let pathname = '';
  try {
    const parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    hostname = parsed.hostname;
    pathname = parsed.pathname;
  } catch {
    const rest = input.replace(/^https?:\/\//i, '');
    hostname = rest.split(/[/?#]/)[0].split('@').pop()!.split(':')[0];
    pathname = rest.slice(rest.split(/[/?#]/)[0].length).split(/[?#]/)[0];
  }
  hostname = hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  if (!hostname) return 'unknown';

  if (hostname === 'github.com') {
    const [, , repo] = pathname.split('/');
    if (repo) {
      const repoSlug = toSlugSafe(repo.replace(/\.git$/i, ''));
      if (repoSlug) return repoSlug;
    }
  }

  // IP literals have no brand: keep the whole address, dot-free.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':') || hostname.startsWith('[')) {
    return toSlugSafe(hostname) || 'unknown';
  }

  return toSlugSafe(brandFromHostname(hostname)) || 'unknown';
}

// Common two-label public suffixes. Not a full Public Suffix List, but covers the
// country-code registrations we see in scans (example.co.uk, example.com.au, ...)
// plus multi-tenant hosting platforms.
const TWO_LABEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk',
  'com.au', 'net.au', 'org.au',
  'co.jp', 'ne.jp', 'or.jp',
  'com.br', 'com.cn', 'com.mx', 'com.ar', 'com.tr', 'com.sg', 'com.hk', 'com.tw',
  'co.in', 'co.kr', 'co.nz', 'co.za', 'co.il', 'co.id',
  // Hosting platforms where each customer gets a subdomain: the customer label
  // is the brand (acme.vercel.app -> acme), not the platform.
  'vercel.app', 'netlify.app', 'github.io', 'pages.dev', 'workers.dev', 'herokuapp.com',
  'notion.site', 'web.app', 'firebaseapp.com', 'onrender.com', 'fly.dev', 'azurewebsites.net',
  'cloudfront.net', 'amplifyapp.com', 'gitbook.io', 'readthedocs.io', 'mintlify.app',
]);

/** Registrable domain (eTLD+1) for a hostname: docs.stripe.com -> stripe.com, api.acme.co.uk -> acme.co.uk */
export function registrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  return TWO_LABEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

/** Brand label of a hostname: docs.stripe.com -> stripe, api.acme.co.uk -> acme */
export function brandFromHostname(hostname: string): string {
  return registrableDomain(hostname).split('.')[0] || hostname;
}
