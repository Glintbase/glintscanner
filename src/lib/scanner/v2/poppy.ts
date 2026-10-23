/**
 * Personal Agent Protocol discovery document (`/.well-known/poppy.json`, draft 0.2).
 * https://personalagentprotocol.org/docs/spec, section 3.
 *
 * Checked: required fields (`protocol_version`, `organization.name`, `organization.domain`),
 * `organization.domain` equals the serving host, `auth` present when `agent` / `apis` /
 * `web.browser_session_endpoint` need it, HTTPS URLs, and, when `auth.issuer` is set, both
 * consistency rules against the issuer's RFC 8414 metadata: `issuer` matches exactly and
 * `poppy_domains` includes the domain.
 */

import { fetchResource } from './fetchResource';

export interface PoppyFinding {
  url: string;
  valid: boolean;
  problems: string[];
  protocolVersion?: string;
  issuer?: string;
}

function parseJson(body?: string): any {
  if (!body) return null;
  try {
    return JSON.parse(body.trim());
  } catch {
    return null;
  }
}

const isHttps = (v: unknown) => typeof v === 'string' && /^https:\/\//i.test(v);

/** RFC 8414 §3: metadata lives at /.well-known/oauth-authorization-server, before any issuer path. */
export function authServerMetadataUrl(issuer: string): string | undefined {
  try {
    const u = new URL(issuer);
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.origin}/.well-known/oauth-authorization-server${path}`;
  } catch {
    return undefined;
  }
}

/** Structural problems with a poppy.json document served by `host`. */
export function validatePoppyDocument(doc: any, host: string): string[] {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['not a JSON object'];
  const problems: string[] = [];
  if (typeof doc.protocol_version !== 'string' || !/^\d+\.\d+$/.test(doc.protocol_version)) problems.push('protocol_version');
  const org = doc.organization;
  if (typeof org?.name !== 'string' || !org.name.trim()) problems.push('organization.name');
  if (typeof org?.domain !== 'string') problems.push('organization.domain');
  else if (org.domain.toLowerCase() !== host.toLowerCase()) problems.push(`organization.domain is ${org.domain}, not ${host}`);
  if (!doc.agent && !doc.apis && !doc.web) problems.push('one of agent, apis or web');
  const needsAuth = Boolean(doc.agent || doc.apis || doc.feedback || doc.web?.browser_session_endpoint);
  if (needsAuth && !doc.auth) problems.push('auth (required with agent, apis, feedback or a browser session endpoint)');
  if (doc.auth && !isHttps(doc.auth.issuer)) problems.push('auth.issuer (HTTPS URL)');
  if (doc.apis !== undefined) {
    if (!Array.isArray(doc.apis)) problems.push('apis (array)');
    else if (doc.apis.some((a: any) => !['openapi', 'mcp'].includes(a?.type) || !isHttps(a?.url))) problems.push('apis entries (type openapi|mcp, HTTPS url)');
  }
  if (doc.web?.browser_session_endpoint !== undefined && !isHttps(doc.web.browser_session_endpoint)) {
    problems.push('web.browser_session_endpoint (HTTPS URL)');
  }
  return problems;
}

export async function findPoppyDocument(origin: string): Promise<PoppyFinding | undefined> {
  const url = `${origin}/.well-known/poppy.json`;
  const res = await fetchResource(url, { timeoutMs: 3500, maxBytes: 200_000, headers: { Accept: 'application/json' } });
  if (!res.ok || !res.body) return undefined;
  const doc = parseJson(res.body);
  // A 200 that isn't JSON at all (an SPA shell, say) is not a poppy.json.
  if (!doc) return undefined;

  let host = new URL(origin).hostname;
  try {
    host = new URL(res.url || url).hostname;
  } catch {
    /* keep origin host */
  }
  const problems = validatePoppyDocument(doc, host);

  const issuer: string | undefined = isHttps(doc?.auth?.issuer) ? doc.auth.issuer : undefined;
  if (issuer && !problems.some((p) => p.startsWith('organization.domain'))) {
    const metaUrl = authServerMetadataUrl(issuer);
    const metaRes = metaUrl ? await fetchResource(metaUrl, { timeoutMs: 3500, maxBytes: 200_000 }) : undefined;
    const meta = metaRes?.ok ? parseJson(metaRes.body) : null;
    if (!meta) {
      problems.push(`issuer metadata not found at ${metaUrl}`);
    } else {
      if (meta.issuer !== issuer) problems.push('issuer metadata "issuer" does not match auth.issuer');
      const domains: unknown = meta.poppy_domains;
      const domain = String(doc.organization.domain).toLowerCase();
      if (!Array.isArray(domains) || !domains.some((d) => typeof d === 'string' && d.toLowerCase() === domain)) {
        problems.push(`issuer metadata poppy_domains does not include ${domain}`);
      }
    }
  }

  return {
    url,
    valid: problems.length === 0,
    problems,
    protocolVersion: typeof doc?.protocol_version === 'string' ? doc.protocol_version : undefined,
    issuer,
  };
}
