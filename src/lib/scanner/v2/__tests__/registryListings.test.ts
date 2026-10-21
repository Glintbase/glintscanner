import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fetchModule from '../fetchResource';
import {
  reverseDomain,
  matchMcpRegistryServers,
  matchSkillsShSources,
  MCP_REGISTRY_API,
  SKILLS_SH_SEARCH_API,
} from '../probes/registryListings';
import { probeDiscovery } from '../probes/discovery';

const OFFICIAL = 'io.modelcontextprotocol.registry/official';
const entry = (name: string, remotes: string[] = [], meta: Record<string, unknown> = { status: 'active', isLatest: true }) => ({
  server: { name, remotes: remotes.map((url) => ({ type: 'streamable-http', url })) },
  _meta: { [OFFICIAL]: meta },
});

describe('MCP Registry matching', () => {
  it('reverses domains', () => {
    expect(reverseDomain('stripe.com')).toBe('com.stripe');
    expect(reverseDomain('example.co.uk')).toBe('uk.co.example');
  });

  it('matches a domain-verified namespace, including subdomain namespaces', () => {
    expect(matchMcpRegistryServers([entry('com.stripe/mcp')], 'stripe.com', 'stripe')).toBe('com.stripe/mcp');
    expect(matchMcpRegistryServers([entry('com.stripe.docs/search')], 'stripe.com', 'stripe')).toBe('com.stripe.docs/search');
  });

  it('matches a remote endpoint hosted on the domain, and the brand GitHub namespace', () => {
    expect(matchMcpRegistryServers([entry('io.github.someone/x', ['https://mcp.stripe.com'])], 'stripe.com', 'stripe')).toBe('io.github.someone/x');
    expect(matchMcpRegistryServers([entry('io.github.stripe/agent-toolkit')], 'stripe.com', 'stripe')).toBe('io.github.stripe/agent-toolkit');
  });

  it('does not match third-party servers that merely mention the brand', () => {
    const thirdParty = [
      entry('app.vercel.stripecheckup/stripecheckup', ['https://stripecheckup.vercel.app/api/mcp']),
      entry('eu.nordicmcp/stripe', ['https://nordicmcp.eu/mcp/stripe/{token}']),
      entry('com.stripeclone/mcp'),
      entry('io.github.stripe-fan/stripe'),
    ];
    expect(matchMcpRegistryServers(thirdParty, 'stripe.com', 'stripe')).toBeNull();
  });

  it('ignores deleted and superseded versions', () => {
    expect(matchMcpRegistryServers([entry('com.stripe/mcp', [], { status: 'deleted', isLatest: true })], 'stripe.com', 'stripe')).toBeNull();
    expect(matchMcpRegistryServers([entry('com.stripe/mcp', [], { status: 'active', isLatest: false })], 'stripe.com', 'stripe')).toBeNull();
  });
});

describe('skills.sh matching', () => {
  it('matches domain-hosted skills and the brand GitHub owner', () => {
    expect(matchSkillsShSources([{ id: 'docs.stripe.com/stripe-docs', source: 'docs.stripe.com' }], 'stripe.com', 'stripe')).toBe('docs.stripe.com/stripe-docs');
    expect(matchSkillsShSources([{ id: 'stripe/ai/stripe-best-practices', source: 'stripe/ai' }], 'stripe.com', 'stripe')).toBe('stripe/ai/stripe-best-practices');
  });

  it('does not match third-party skills about the brand', () => {
    const thirdParty = [
      { id: 'caffeinelabs/skills/extension-stripe', source: 'caffeinelabs/skills' },
      { id: 'vercel-labs/emulate/stripe', source: 'vercel-labs/emulate' },
      { id: 'skills.volces.com/byted-stripe', source: 'skills.volces.com' },
      { id: 'notstripe.com/x', source: 'notstripe.com' },
    ];
    expect(matchSkillsShSources(thirdParty, 'stripe.com', 'stripe')).toBeNull();
  });
});

describe('probeDiscovery registry checks', () => {
  afterEach(() => vi.restoreAllMocks());

  function mockRegistries(opts: { registry?: unknown; skills?: unknown; registryDown?: boolean; skillsDown?: boolean }) {
    return vi.spyOn(fetchModule, 'fetchResource').mockImplementation(async (url: string) => {
      const json = (v: unknown) => ({ ok: true, status: 'ok', url, httpStatus: 200, body: JSON.stringify(v) }) as fetchModule.FetchResourceResult;
      const down = { ok: false, status: 'timeout', url, httpStatus: 0 } as fetchModule.FetchResourceResult;
      if (url.startsWith(MCP_REGISTRY_API)) return opts.registryDown ? down : json({ servers: opts.registry ?? [] });
      if (url.startsWith(SKILLS_SH_SEARCH_API)) return opts.skillsDown ? down : json({ skills: opts.skills ?? [] });
      return { ok: false, status: 'unreachable', url, httpStatus: 404 } as fetchModule.FetchResourceResult;
    });
  }
  const statusOf = (checks: { checkId: string; status: string }[], id: string) => checks.find((c) => c.checkId === id)!.status;

  it('passes when the registries list the domain', async () => {
    mockRegistries({
      registry: [entry('com.acme/mcp')],
      skills: [{ id: 'acme/skills/acme-api', source: 'acme/skills' }],
    });
    const { checks } = await probeDiscovery('https://docs.acme.com');
    expect(statusOf(checks, 'mcp-registry-listed')).toBe('pass');
    expect(statusOf(checks, 'skills-sh-listed')).toBe('pass');
  });

  it('warns (scores 0) when the registries answer without a match', async () => {
    mockRegistries({ registry: [entry('io.github.someone/acme')], skills: [{ id: 'x/y/acme', source: 'x/y' }] });
    const { checks } = await probeDiscovery('https://acme.com');
    expect(statusOf(checks, 'mcp-registry-listed')).toBe('warn');
    expect(statusOf(checks, 'skills-sh-listed')).toBe('warn');
  });

  it('skips the npm check when npm does not answer, and warns on a 404', async () => {
    const run = async (npm: Partial<fetchModule.FetchResourceResult>) => {
      vi.restoreAllMocks();
      vi.spyOn(fetchModule, 'fetchResource').mockImplementation(async (url: string) =>
        (url.startsWith('https://registry.npmjs.org/')
          ? { url, ...npm }
          : { ok: false, status: 'unreachable', url, httpStatus: 404 }) as fetchModule.FetchResourceResult
      );
      return statusOf((await probeDiscovery('https://acme.com')).checks, 'npm-sdk-package');
    };
    expect(await run({ ok: false, status: 'timeout', httpStatus: 0 })).toBe('skip');
    expect(await run({ ok: false, status: 'unreachable', httpStatus: 503 })).toBe('skip');
    expect(await run({ ok: false, status: 'unreachable', httpStatus: 404 })).toBe('warn');
    expect(await run({ ok: true, status: 'ok', httpStatus: 200, body: JSON.stringify({ name: 'acme', homepage: 'https://acme.com' }) })).toBe('pass');
  });

  it('skips (excluded from the score) when a registry does not answer', async () => {
    mockRegistries({ registryDown: true, skillsDown: true });
    const { checks } = await probeDiscovery('https://acme.com');
    expect(statusOf(checks, 'mcp-registry-listed')).toBe('skip');
    expect(statusOf(checks, 'skills-sh-listed')).toBe('skip');
  });
});
