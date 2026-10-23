import { describe, it, expect } from 'vitest';
import { getAllChecks } from '../probes/registry';
import { measurementFor, EXPLICIT_MEASUREMENTS } from '../probes/measurement';

describe('check measurement kinds', () => {
  const ids = new Set(getAllChecks().map((c) => c.id));

  it('only classifies checks that exist in the registry', () => {
    const unknown = [...EXPLICIT_MEASUREMENTS.keys()].filter((id) => !ids.has(id));
    expect(unknown).toEqual([]);
  });

  it('gives every registered check a measurement kind', () => {
    for (const id of ids) {
      expect(['live', 'content', 'presence', 'declared']).toContain(measurementFor(id));
    }
  });

  it('classifies existence checks as presence, not live', () => {
    expect(measurementFor('openapi-spec')).toBe('presence');
    expect(measurementFor('mcp-server-manifest')).toBe('presence');
    expect(measurementFor('llms-txt-exists')).toBe('presence');
    expect(measurementFor('mcp-error-reporting')).toBe('live');
    expect(measurementFor('api-operation-ids')).toBe('content');
  });
});
