import { describe, it, expect } from 'vitest';
import { normalizeUrl, deriveCompany, deriveCompanySlug, registrableDomain, brandFromHostname } from '../url';

describe('normalizeUrl', () => {
  it('adds https when missing', () => {
    expect(normalizeUrl('docs.stripe.com')).toBe('https://docs.stripe.com');
  });

  it('preserves existing protocol', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  it('strips chained and duplicate protocols', () => {
    expect(normalizeUrl('https://https://glintbase.dev')).toBe('https://glintbase.dev');
    expect(normalizeUrl('http://https://example.com')).toBe('https://example.com');
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

describe('deriveCompanySlug uses the registrable domain', () => {
  it('keeps existing slugs for normal domains', () => {
    expect(deriveCompanySlug('https://stripe.com')).toBe('stripe');
    expect(deriveCompanySlug('https://www.stripe.com')).toBe('stripe');
    expect(deriveCompanySlug('https://docs.stripe.com/api')).toBe('stripe');
    expect(deriveCompanySlug('stripe.com')).toBe('stripe');
    expect(deriveCompanySlug('https://api.acme.co.uk')).toBe('acme');
  });

  it('cannot be hijacked by a subdomain label on another domain', () => {
    expect(deriveCompanySlug('https://stripe.attacker.com')).toBe('attacker');
    expect(deriveCompanySlug('https://docs.stripe.attacker.com/x')).toBe('attacker');
  });

  it('only applies the GitHub repo rule on github.com itself', () => {
    expect(deriveCompanySlug('https://evil.com/?r=github.com/stripe/stripe')).toBe('evil');
    expect(deriveCompanySlug('https://github.com.evil.com/stripe/stripe')).toBe('evil');
    expect(deriveCompanySlug('https://github.com/org/repo.git')).toBe('repo');
    expect(deriveCompanySlug('https://github.com/org/repo?tab=readme#x')).toBe('repo');
    expect(deriveCompanySlug('https://github.com/org')).toBe('github');
  });

  it('produces URL-safe slugs without dots', () => {
    expect(deriveCompanySlug('https://github.com/vercel/next.js')).toBe('next-js');
    expect(deriveCompany('https://github.com/vercel/next.js')).toBe('Next-js');
    expect(deriveCompanySlug('http://127.0.0.1:3000')).toBe('127-0-0-1');
    expect(deriveCompanySlug('https://github.com/vercel/next.js')).not.toContain('.');
  });

  it('treats hosting platforms as public suffixes', () => {
    expect(deriveCompanySlug('https://acme.vercel.app')).toBe('acme');
    expect(deriveCompanySlug('https://docs.acme.netlify.app')).toBe('acme');
    expect(deriveCompanySlug('https://acme.github.io/project')).toBe('acme');
    expect(deriveCompanySlug('https://acme.mintlify.app')).toBe('acme');
    expect(registrableDomain('docs.acme.vercel.app')).toBe('acme.vercel.app');
    expect(brandFromHostname('acme.readthedocs.io')).toBe('acme');
    expect(registrableDomain('www.acme.co.uk')).toBe('acme.co.uk');
  });
});
