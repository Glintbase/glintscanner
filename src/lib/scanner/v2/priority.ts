/**
 * Crawl URL priority scoring (SPEC-03).
 * Higher score = crawl earlier. Deterministic: score desc, then URL asc.
 */

const WEIGHTS: { pattern: RegExp; weight: number }[] = [
  { pattern: /quickstart|getting-started|get-started/i, weight: 10 },
  { pattern: /install|setup|onboard/i, weight: 8 },
  { pattern: /auth|oauth|api-key|apikey|token|credential/i, weight: 8 },
  { pattern: /webhook/i, weight: 7 },
  { pattern: /\/api|reference|endpoint/i, weight: 6 },
  { pattern: /error|troubleshoot|debug/i, weight: 5 },
  { pattern: /docs|documentation/i, weight: 3 },
  { pattern: /changelog|release/i, weight: 1 },
  { pattern: /llms\.txt|openapi|swagger/i, weight: 9 },
];

export function urlPriorityScore(url: string): number {
  let score = 0;
  for (const { pattern, weight } of WEIGHTS) {
    if (pattern.test(url)) score += weight;
  }
  return score;
}

/** Stable sort: priority desc, then URL asc. */
export function sortUrlsByPriority(urls: string[]): string[] {
  return [...urls].sort((a, b) => {
    const d = urlPriorityScore(b) - urlPriorityScore(a);
    if (d !== 0) return d;
    return a.localeCompare(b);
  });
}

export interface CrawlBudget {
  maxPages: number;
  maxDurationMs: number;
  maxBytesPerResource: number;
}

export const DEFAULT_QUICK_BUDGET: CrawlBudget = {
  maxPages: 15,
  maxDurationMs: 45_000,
  maxBytesPerResource: 2_000_000,
};

export function resolveBudget(profile?: 'quick' | 'deep'): CrawlBudget {
  if (profile === 'deep') {
    return {
      maxPages: 50,
      maxDurationMs: 180_000,
      maxBytesPerResource: 5_000_000,
    };
  }
  // Env overrides for hosted tuning
  const maxPages = Number(process.env.SCAN_MAX_PAGES) || DEFAULT_QUICK_BUDGET.maxPages;
  const maxDurationMs = Number(process.env.SCAN_MAX_DURATION_MS) || DEFAULT_QUICK_BUDGET.maxDurationMs;
  return {
    maxPages: Math.min(Math.max(maxPages, 1), 100),
    maxDurationMs: Math.min(Math.max(maxDurationMs, 5000), 300_000),
    maxBytesPerResource: DEFAULT_QUICK_BUDGET.maxBytesPerResource,
  };
}
