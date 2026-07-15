/**
 * Scan request validation (SPEC-07) — lightweight schema without zod dependency.
 */

import { validateScanUrl, policyToErrorCode, type UrlPolicyResult } from './urlPolicy';

export interface ScanRequestBody {
  url: string;
  options?: {
    enabledSurfaces?: string[];
    profile?: 'quick' | 'deep';
  };
}

export interface ScanRequestValidation {
  ok: boolean;
  status: number;
  error?: string;
  code?: string;
  data?: {
    url: string;
    enabledSurfaces?: string[];
    profile: 'quick' | 'deep';
  };
  policy?: UrlPolicyResult;
}

const SURFACE_ALLOWLIST = new Set([
  'landing',
  'docs',
  'api',
  'sdk',
  'github',
  'support',
  'blog',
  'changelog',
  'status',
  'auth',
  'dashboard',
  'openapi',
  'llms_txt',
  'llms_full_txt',
  'sitemap',
  'mcp',
]);

export function validateScanRequest(body: unknown): ScanRequestValidation {
  if (body === null || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'JSON body is required', code: 'INVALID_URL' };
  }

  const b = body as Record<string, unknown>;
  if (typeof b.url !== 'string') {
    return { ok: false, status: 400, error: 'url must be a string', code: 'INVALID_URL' };
  }

  const policy = validateScanUrl(b.url);
  if (!policy.ok || !policy.url) {
    return {
      ok: false,
      status: 400,
      error: policy.message || 'Invalid URL',
      code: policyToErrorCode(policy.code),
      policy,
    };
  }

  let enabledSurfaces: string[] | undefined;
  let profile: 'quick' | 'deep' = 'quick';

  if (b.options !== undefined) {
    if (typeof b.options !== 'object' || b.options === null) {
      return { ok: false, status: 400, error: 'options must be an object', code: 'INVALID_URL' };
    }
    const opt = b.options as Record<string, unknown>;
    if (opt.enabledSurfaces !== undefined) {
      if (!Array.isArray(opt.enabledSurfaces)) {
        return {
          ok: false,
          status: 400,
          error: 'options.enabledSurfaces must be an array',
          code: 'INVALID_URL',
        };
      }
      enabledSurfaces = [];
      for (const s of opt.enabledSurfaces) {
        if (typeof s !== 'string') {
          return {
            ok: false,
            status: 400,
            error: 'enabledSurfaces entries must be strings',
            code: 'INVALID_URL',
          };
        }
        if (!SURFACE_ALLOWLIST.has(s)) {
          return {
            ok: false,
            status: 400,
            error: `Unknown surface type: ${s}`,
            code: 'INVALID_URL',
          };
        }
        enabledSurfaces.push(s);
      }
    }
    if (opt.profile !== undefined) {
      if (opt.profile !== 'quick' && opt.profile !== 'deep') {
        return {
          ok: false,
          status: 400,
          error: 'options.profile must be quick or deep',
          code: 'INVALID_URL',
        };
      }
      profile = opt.profile;
    }
  }

  return {
    ok: true,
    status: 200,
    data: {
      url: policy.url,
      enabledSurfaces,
      profile,
    },
    policy,
  };
}
