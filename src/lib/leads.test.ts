import { describe, it, expect } from 'vitest';
import { validateLeadEmail, MAX_EMAIL_LENGTH } from './leads';

describe('validateLeadEmail', () => {
  it('accepts a valid email and normalizes it', () => {
    const result = validateLeadEmail('  Dev@Company.COM ');
    expect(result.ok).toBe(true);
    expect(result.email).toBe('dev@company.com');
  });

  it('accepts plus-addressed and subdomain emails', () => {
    expect(validateLeadEmail('a+tag@mail.example.co').ok).toBe(true);
    expect(validateLeadEmail('first.last@sub.domain.io').ok).toBe(true);
  });

  it('rejects non-string input', () => {
    expect(validateLeadEmail(undefined).ok).toBe(false);
    expect(validateLeadEmail(null).ok).toBe(false);
    expect(validateLeadEmail(42).ok).toBe(false);
    expect(validateLeadEmail({}).ok).toBe(false);
  });

  it('rejects empty and whitespace-only input', () => {
    expect(validateLeadEmail('').ok).toBe(false);
    expect(validateLeadEmail('   ').ok).toBe(false);
  });

  it('rejects malformed addresses', () => {
    expect(validateLeadEmail('not-an-email').ok).toBe(false);
    expect(validateLeadEmail('missing@tld').ok).toBe(false);
    expect(validateLeadEmail('@nouser.com').ok).toBe(false);
    expect(validateLeadEmail('spaces in@mail.com').ok).toBe(false);
    expect(validateLeadEmail('user@.com').ok).toBe(false);
  });

  it('rejects oversized emails', () => {
    const local = 'a'.repeat(MAX_EMAIL_LENGTH);
    const result = validateLeadEmail(`${local}@example.com`);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too long/i);
  });

  it('accepts an email exactly at the length cap', () => {
    const local = 'a'.repeat(MAX_EMAIL_LENGTH - '@example.com'.length);
    const result = validateLeadEmail(`${local}@example.com`);
    expect(result.ok).toBe(true);
  });
});
