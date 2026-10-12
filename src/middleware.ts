import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Memory fallback settings (configurable via env)
const MEMORY_LIMIT = Number(process.env.MEMORY_LIMIT) || 10;
const MEMORY_LEAD_LIMIT = Number(process.env.MEMORY_LEAD_LIMIT) || 20;
const MEMORY_WINDOW_MS = Number(process.env.MEMORY_WINDOW_MS) || 60 * 60 * 1000;

type Duration = Parameters<typeof Ratelimit.slidingWindow>[1];

interface LimitRule {
  /** Upstash key prefix, also used as the memory-limiter namespace. */
  prefix: string;
  matches: (path: string) => boolean;
  limit: number;
  window: Duration;
  memoryLimit: number;
  memoryWindowMs: number;
  message: string;
  retryAfter: string;
}

const RULES: LimitRule[] = [
  {
    // Scans: expensive crawl + probes.
    prefix: 'glintscan',
    matches: (p) => p === '/api/scan' || p.startsWith('/api/scan/'),
    limit: 5,
    window: '1 h',
    memoryLimit: MEMORY_LIMIT,
    memoryWindowMs: MEMORY_WINDOW_MS,
    message: 'Rate limit reached. Please try again later.',
    retryAfter: '3600',
  },
  {
    // Simulations: E2B microVMs + LLM spend.
    prefix: 'glintsim',
    matches: (p) => p === '/api/simulate' || p.startsWith('/api/simulate/'),
    limit: 5,
    window: '1 h',
    memoryLimit: MEMORY_LIMIT,
    memoryWindowMs: MEMORY_WINDOW_MS,
    message: 'Simulation rate limit reached. Please try again later.',
    retryAfter: '3600',
  },
  {
    // Hosted MCP: JSON-RPC traffic, some tools run scans and simulations.
    prefix: 'glintmcp',
    matches: (p) => p === '/api/mcp' || p.startsWith('/api/mcp/'),
    limit: 60,
    window: '1 m',
    memoryLimit: 60,
    memoryWindowMs: 60 * 1000,
    message: 'Rate limit exceeded. Max 60 requests per minute.',
    retryAfter: '60',
  },
  {
    // Lead capture (email gate) — generous abuse guard
    prefix: 'glintlead',
    matches: (p) => p === '/api/leads',
    limit: 20,
    window: '1 h',
    memoryLimit: MEMORY_LEAD_LIMIT,
    memoryWindowMs: MEMORY_WINDOW_MS,
    message: 'Too many submissions. Please try again later.',
    retryAfter: '3600',
  },
];

const upstashLimiters = new Map<string, Ratelimit>();

function getUpstashLimiter(rule: LimitRule): Ratelimit | null {
  const cached = upstashLimiters.get(rule.prefix);
  if (cached) return cached;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  try {
    const limiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(rule.limit, rule.window),
      prefix: rule.prefix,
    });
    upstashLimiters.set(rule.prefix, limiter);
    return limiter;
  } catch (e) {
    console.warn(`Failed to initialize Upstash Redis ratelimit (${rule.prefix}):`, e);
    return null;
  }
}

// Simple in-memory fallback for local/dev (not multi-instance safe)
const memoryHits = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(key: string, limit: number, windowMs: number): { success: boolean; remaining: number } {
  const now = Date.now();

  // Periodically sweep expired keys if memoryHits gets large to prevent memory growth
  if (memoryHits.size > 200) {
    memoryHits.forEach((v, k) => {
      if (now > v.resetAt) {
        memoryHits.delete(k);
      }
    });
  }

  let entry = memoryHits.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    memoryHits.set(key, entry);
  }
  entry.count += 1;
  return {
    success: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
  };
}

function getIpFromRequest(request: NextRequest) {
  // Check common forward headers used on Vercel and other platforms.
  const vf = request.headers.get('x-vercel-forwarded-for');
  const xf = request.headers.get('x-forwarded-for');
  const real = request.headers.get('x-real-ip');
  const forwarded = vf || xf || real;
  return (
    // request.ip may be undefined in edge runtimes; keep as first choice when present
    // (Node runtime sets it sometimes, but not guaranteed for edge)
    (request as any).ip ||
    forwarded?.split(',')[0]?.trim() ||
    '127.0.0.1'
  );
}

function rateLimited(rule: LimitRule, headers: Record<string, string>) {
  return NextResponse.json(
    { error: rule.message, code: 'RATE_LIMITED' },
    { status: 429, headers: { 'Access-Control-Allow-Origin': '*', ...headers } }
  );
}

async function applyRule(rule: LimitRule, ip: string): Promise<NextResponse | null> {
  const upstash = getUpstashLimiter(rule);

  // Prefer Upstash when configured. If Upstash call errors, fall back to memory guard.
  if (upstash) {
    try {
      const { success, remaining, reset } = await upstash.limit(ip);
      if (success) return null;
      return rateLimited(rule, {
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Reset': String(reset),
        'X-RateLimit-Backend': 'upstash',
        'Retry-After': rule.retryAfter,
      });
    } catch (err) {
      // Log and gracefully degrade to in-memory guard. This avoids hard-failing all traffic
      // if Upstash has a transient outage.
      console.error(`Upstash ratelimit error (${rule.prefix}), falling back to memory limiter`, { err });
      const { success, remaining } = memoryLimit(`fallback:${rule.prefix}:${ip}`, rule.memoryLimit, rule.memoryWindowMs);
      if (success) return null;
      return rateLimited(rule, {
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Backend': 'memory-fallback',
      });
    }
  }

  // Without Redis: still apply in-memory guard (per instance only)
  const { success, remaining } = memoryLimit(`${rule.prefix}:${ip}`, rule.memoryLimit, rule.memoryWindowMs);
  if (success) return null;
  return rateLimited(rule, {
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Backend': 'memory',
  });
}

export async function middleware(request: NextRequest) {
  try {
    // CORS preflights are free; don't spend quota on them.
    if (request.method === 'OPTIONS') return NextResponse.next();

    const path = request.nextUrl.pathname;
    const rule = RULES.find((r) => r.matches(path));
    if (!rule) return NextResponse.next();

    const limited = await applyRule(rule, getIpFromRequest(request));
    return limited ?? NextResponse.next();
  } catch (globalErr) {
    console.error('Unhandled middleware error, bypassing:', globalErr);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/api/scan',
    '/api/scan/:path*',
    '/api/simulate',
    '/api/simulate/:path*',
    '/api/mcp',
    '/api/mcp/:path*',
    '/api/leads',
  ],
};
