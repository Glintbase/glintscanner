import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// 5 scan requests per IP per hour when Redis is configured
const redisConfigured = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

const ratelimit = redisConfigured
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(5, '1 h'),
      prefix: 'glintscan',
    })
  : null;

// Simple in-memory fallback for local/dev (not multi-instance safe)
const memoryHits = new Map<string, { count: number; resetAt: number }>();
const MEMORY_LIMIT = 10;
const MEMORY_WINDOW_MS = 60 * 60 * 1000;

function memoryLimit(ip: string): { success: boolean; remaining: number } {
  const now = Date.now();
  let entry = memoryHits.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + MEMORY_WINDOW_MS };
    memoryHits.set(ip, entry);
  }
  entry.count += 1;
  return {
    success: entry.count <= MEMORY_LIMIT,
    remaining: Math.max(0, MEMORY_LIMIT - entry.count),
  };
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Rate limit scan API only
  if (path === '/api/scan' || path.startsWith('/api/scan/')) {
    const ip =
      request.ip ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    if (ratelimit) {
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
              'Retry-After': '3600',
            },
          }
        );
      }
    } else {
      // Production without Redis: still apply in-memory guard (warn via header)
      const { success, remaining } = memoryLimit(ip);
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

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
