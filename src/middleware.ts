import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Upstash configured when both vars exist
const redisConfigured = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

// Create Upstash ratelimit instances (if configured)
const ratelimit = redisConfigured
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(5, '1 h'),
      prefix: 'glintscan',
    })
  : null;

const leadRatelimit = redisConfigured
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(20, '1 h'),
      prefix: 'glintlead',
    })
  : null;

// Memory fallback settings (configurable via env)
const MEMORY_LIMIT = Number(process.env.MEMORY_LIMIT) || 10;
const MEMORY_LEAD_LIMIT = Number(process.env.MEMORY_LEAD_LIMIT) || 20;
const MEMORY_WINDOW_MS = Number(process.env.MEMORY_WINDOW_MS) || 60 * 60 * 1000;

// Simple in-memory fallback for local/dev (not multi-instance safe)
const memoryHits = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(key: string, limit: number = MEMORY_LIMIT): { success: boolean; remaining: number } {
  const now = Date.now();
  let entry = memoryHits.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + MEMORY_WINDOW_MS };
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

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Rate limit scan API only
  if (path === '/api/scan' || path.startsWith('/api/scan/')) {
    const ip = getIpFromRequest(request);

    // Prefer Upstash when configured. If Upstash call errors, fall back to memory guard.
    if (ratelimit) {
      try {
        const { success, remaining, reset } = await ratelimit.limit(ip);
        if (!success) {
          return NextResponse.json(
            {
              error: 'Rate limit reached. Please try again later.',
              code: 'RATE_LIMITED',
            },
            {
              status: 429,
              headers: {
                'X-RateLimit-Remaining': String(remaining),
                'X-RateLimit-Reset': String(reset),
                'X-RateLimit-Backend': 'upstash',
                'Retry-After': '3600',
              },
            }
          );
        }
      } catch (err) {
        // Log and gracefully degrade to in-memory guard. This avoids hard-failing all traffic
        // if Upstash has a transient outage.
        console.error('Upstash ratelimit error, falling back to memory limiter', { err });

        const { success, remaining } = memoryLimit(`fallback:${ip}`, MEMORY_LIMIT);
        if (!success) {
          return NextResponse.json(
            {
              error: 'Rate limit reached (fallback). Please try again later.',
              code: 'RATE_LIMITED',
            },
            {
              status: 429,
              headers: {
                'X-RateLimit-Remaining': String(remaining),
                'X-RateLimit-Backend': 'memory-fallback',
              },
            }
          );
        }
      }
    } else {
      // Production without Redis: still apply in-memory guard (warn via header)
      const { success, remaining } = memoryLimit(ip, MEMORY_LIMIT);
      if (!success) {
        return NextResponse.json(
          {
            error: 'Rate limit reached. Configure Upstash Redis for distributed limits.',
            code: 'RATE_LIMITED',
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Remaining': String(remaining),
              'X-RateLimit-Backend': 'memory',
            },
          }
        );
      }
    }
  }

  // Rate limit lead capture (email gate) — generous abuse guard
  if (path === '/api/leads') {
    const ip = getIpFromRequest(request);

    if (leadRatelimit) {
      try {
        const { success, remaining, reset } = await leadRatelimit.limit(ip);
        if (!success) {
          return NextResponse.json(
            { error: 'Too many submissions. Please try again later.', code: 'RATE_LIMITED' },
            {
              status: 429,
              headers: {
                'X-RateLimit-Remaining': String(remaining),
                'X-RateLimit-Reset': String(reset),
                'X-RateLimit-Backend': 'upstash',
                'Retry-After': '3600',
              },
            }
          );
        }
      } catch (err) {
        console.error('Upstash lead ratelimit error, falling back to memory limiter', { err });
        const { success, remaining } = memoryLimit(`lead:${ip}`, MEMORY_LEAD_LIMIT);
        if (!success) {
          return NextResponse.json(
            { error: 'Too many submissions. Please try again later.', code: 'RATE_LIMITED' },
            {
              status: 429,
              headers: {
                'X-RateLimit-Remaining': String(remaining),
                'X-RateLimit-Backend': 'memory-fallback',
              },
            }
          );
        }
      }
    } else {
      const { success, remaining } = memoryLimit(`lead:${ip}`, MEMORY_LEAD_LIMIT);
      if (!success) {
        return NextResponse.json(
          { error: 'Too many submissions. Please try again later.', code: 'RATE_LIMITED' },
          {
            status: 429,
            headers: {
              'X-RateLimit-Remaining': String(remaining),
              'X-RateLimit-Backend': 'memory',
            },
          }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
