/**
 * MCP session file cache — persists scan results so re-runs are fast.
 * Writes to .glintbase/cache/{domain-hash}.json in the user's cwd.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ScanSession } from './session.js';

const CACHE_DIR = '.glintbase/cache';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  url: string;
  timestamp: number;
  score: { score: number; version: string } | null;
  surfaceCount: number;
  pageCount: number;
  nodeCount: number;
}

function domainHash(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return createHash('sha256').update(hostname).digest('hex').slice(0, 12);
  } catch {
    return createHash('sha256').update(url).digest('hex').slice(0, 12);
  }
}

function getCachePath(url: string): string {
  return join(process.cwd(), CACHE_DIR, `${domainHash(url)}.json`);
}

/**
 * Check if a valid cache entry exists for this URL (< 1 hour old).
 */
export function getCachedSession(url: string): CacheEntry | null {
  try {
    const cachePath = getCachePath(url);
    if (!existsSync(cachePath)) return null;

    const raw = readFileSync(cachePath, 'utf-8');
    const entry: CacheEntry = JSON.parse(raw);

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * Write a cache entry after score calculation.
 */
export function cacheSession(session: ScanSession): void {
  if (!session.url || !session.score) return;

  try {
    const cacheDir = join(process.cwd(), CACHE_DIR);
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    const entry: CacheEntry = {
      url: session.url,
      timestamp: Date.now(),
      score: session.score ? { score: session.score.score, version: session.score.version } : null,
      surfaceCount: session.surfaces?.length || 0,
      pageCount: session.pages?.length || 0,
      nodeCount: session.graph?.nodes?.length || 0,
    };

    writeFileSync(getCachePath(session.url), JSON.stringify(entry, null, 2));
  } catch {
    // Cache write failure is non-fatal
  }
}

/**
 * Check if cache is fresh for a URL. Returns cache info or null.
 */
export function checkCacheFreshness(url: string): { cached: boolean; age?: number; score?: number } {
  const entry = getCachedSession(url);
  if (!entry) return { cached: false };
  return {
    cached: true,
    age: Date.now() - entry.timestamp,
    score: entry.score?.score,
  };
}
