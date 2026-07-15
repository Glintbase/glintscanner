import { describe, it, expect } from 'vitest';
import { validateScanUrl, policyToErrorCode } from '../urlPolicy';
import { validateScanRequest } from '../scanRequest';

describe('validateScanUrl (SPEC-01 SSRF)', () => {
  it('accepts public https URLs', () => {
    const r = validateScanUrl('docs.stripe.com', { allowHttp: false });
    expect(r.ok).toBe(true);
    expect(r.url).toBe('https://docs.stripe.com/');
  });

  it('blocks localhost and loopback', () => {
    expect(validateScanUrl('http://127.0.0.1/').code).toBe('SSRF_BLOCKED');
    expect(validateScanUrl('http://localhost:3000').code).toBe('SSRF_BLOCKED');
    expect(validateScanUrl('http://[::1]/').code).toBe('SSRF_BLOCKED');
  });

  it('blocks private and link-local ranges', () => {
    expect(validateScanUrl('http://10.0.0.5/').code).toBe('SSRF_BLOCKED');
    expect(validateScanUrl('http://192.168.1.1/').code).toBe('SSRF_BLOCKED');
    expect(validateScanUrl('http://172.16.0.1/').code).toBe('SSRF_BLOCKED');
    expect(validateScanUrl('http://169.254.169.254/latest/meta-data/').code).toBe(
      'SSRF_BLOCKED'
    );
  });

  it('blocks credentials in URL', () => {
    expect(validateScanUrl('https://user:pass@example.com/').code).toBe(
      'CREDENTIALS_FORBIDDEN'
    );
  });

  it('blocks non-standard ports', () => {
    expect(validateScanUrl('https://example.com:444/').code).toBe('PORT_NOT_ALLOWED');
  });

  it('requires https in production-like mode', () => {
    const r = validateScanUrl('http://example.com', { allowHttp: false });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('SCHEME_NOT_ALLOWED');
  });

  it('maps policy codes for API', () => {
    expect(policyToErrorCode('SSRF_BLOCKED')).toBe('SSRF_BLOCKED');
    expect(policyToErrorCode('EMPTY')).toBe('INVALID_URL');
  });
});

describe('validateScanRequest', () => {
  it('rejects missing url', () => {
    const r = validateScanRequest({});
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });

  it('rejects SSRF targets', () => {
    const r = validateScanRequest({ url: 'http://127.0.0.1' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('SSRF_BLOCKED');
  });

  it('accepts valid scan body', () => {
    const r = validateScanRequest({
      url: 'https://docs.example.com',
      options: { enabledSurfaces: ['docs', 'llms_txt'], profile: 'quick' },
    });
    expect(r.ok).toBe(true);
    expect(r.data?.url).toContain('docs.example.com');
    expect(r.data?.enabledSurfaces).toEqual(['docs', 'llms_txt']);
  });

  it('rejects unknown surface types', () => {
    const r = validateScanRequest({
      url: 'https://docs.example.com',
      options: { enabledSurfaces: ['not_a_surface'] },
    });
    expect(r.ok).toBe(false);
  });
});
