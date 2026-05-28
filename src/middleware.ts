import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Create a new ratelimiter, that allows 5 requests per 1 hour
// Only initialize if REDIS_URL is present
const redis = process.env.UPSTASH_REDIS_REST_URL 
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(5, '1 h'),
    })
  : null;

export async function middleware(request: NextRequest) {
  // Only apply rate limiting to the scan API endpoint
  if (request.nextUrl.pathname.startsWith('/api/scan')) {
    if (!redis) {
      // If no Redis configured, bypass rate limiting
      return NextResponse.next();
    }

    const ip = request.ip ?? '127.0.0.1';
    const { success, pending, limit, reset, remaining } = await redis.limit(ip);

    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit reached. Please try again later or join the waitlist.' },
        { status: 429 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
