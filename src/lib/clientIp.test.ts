import { afterEach, describe, expect, it, vi } from 'vitest';
import { platformClientIp } from './clientIp';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('platformClientIp', () => {
  it('on Render, uses CF-Connecting-IP and ignores caller-supplied forwarding headers', () => {
    vi.stubEnv('RENDER', 'true');
    const headers = new Headers({
      'cf-connecting-ip': '203.0.113.7',
      'x-forwarded-for': '10.1.2.3, 203.0.113.7',
      'x-vercel-forwarded-for': '10.9.9.9',
    });
    expect(platformClientIp(headers)).toBe('203.0.113.7');
  });

  it('off Render, does not trust CF-Connecting-IP', () => {
    vi.stubEnv('RENDER', '');
    const headers = new Headers({
      'cf-connecting-ip': '10.1.2.3',
      'x-vercel-forwarded-for': '198.51.100.4',
    });
    expect(platformClientIp(headers)).toBe('198.51.100.4');
  });

  it('takes the first hop of a forwarded list and returns null when nothing is set', () => {
    vi.stubEnv('RENDER', '');
    expect(platformClientIp(new Headers({ 'x-forwarded-for': '198.51.100.4, 10.0.0.1' }))).toBe('198.51.100.4');
    expect(platformClientIp(new Headers())).toBeNull();
  });
});
