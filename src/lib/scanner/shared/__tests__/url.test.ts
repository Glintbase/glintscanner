import { describe, it, expect } from 'vitest';
import { normalizeUrl, deriveCompany, deriveCompanySlug } from '../url';

describe('normalizeUrl', () => {
  it('adds https when missing', () => {
    expect(normalizeUrl('docs.stripe.com')).toBe('https://docs.stripe.com');
  });

  it('preserves existing protocol', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  it('returns empty for blank input', () => {
    expect(normalizeUrl('   ')).toBe('');
  });
});

describe('deriveCompany / slug', () => {
  it('strips docs subdomain', () => {
    expect(deriveCompanySlug('https://docs.stripe.com')).toBe('stripe');
    expect(deriveCompany('https://docs.stripe.com')).toBe('Stripe');
  });

  it('uses github repo name', () => {
    expect(deriveCompanySlug('https://github.com/org/cool-repo')).toBe('cool-repo');
  });
});
