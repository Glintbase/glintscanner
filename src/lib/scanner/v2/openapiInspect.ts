/**
 * Static inspection of a parsed OpenAPI / Swagger document.
 * Every signal here is derived from the spec itself, so usability checks can
 * report what the spec actually declares instead of assuming it from existence.
 */

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

export interface OpenApiOperationRef {
  method: string;
  path: string;
  op: any;
}

export interface OpenApiInspection {
  version: string;
  operationCount: number;
  operationIds: { withId: number; duplicates: string[] };
  requestBodies: { total: number; withJsonSchema: number };
  errorResponses: { operationsWithTypedError: number };
  rateLimitHeaders: boolean;
  problemDetails: boolean;
  idempotencyKey: boolean;
  versionedUris: boolean;
  searchEndpoint: boolean;
  cursorPagination: boolean;
  webhooks: boolean;
  curlExamples: boolean;
  codeSamples: boolean;
  isOpenApi31: boolean;
}

export function listOperations(spec: any): OpenApiOperationRef[] {
  const ops: OpenApiOperationRef[] = [];
  const paths = spec?.paths && typeof spec.paths === 'object' ? spec.paths : {};
  for (const [path, item] of Object.entries<any>(paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const method of HTTP_METHODS) {
      if (item[method] && typeof item[method] === 'object') {
        ops.push({ method, path, op: item[method] });
      }
    }
  }
  return ops;
}

function resolveRef(spec: any, node: any, depth = 0): any {
  if (!node || typeof node !== 'object' || depth > 5) return node;
  const ref = node.$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return node;
  const target = ref
    .slice(2)
    .split('/')
    .reduce((acc: any, key: string) => (acc ? acc[key.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined), spec);
  return resolveRef(spec, target, depth + 1);
}

function parametersOf(spec: any, path: string, op: any): any[] {
  const pathItem = spec?.paths?.[path] || {};
  return [...(pathItem.parameters || []), ...(op.parameters || [])].map((p) => resolveRef(spec, p)).filter(Boolean);
}

function responseHasSchema(spec: any, response: any): boolean {
  const res = resolveRef(spec, response);
  if (!res || typeof res !== 'object') return false;
  if (res.schema) return true; // Swagger 2.0
  const content = res.content && typeof res.content === 'object' ? res.content : {};
  return Object.values<any>(content).some((media) => Boolean(media?.schema));
}

export function inspectOpenApi(spec: any): OpenApiInspection {
  const ops = listOperations(spec);
  const raw = JSON.stringify(spec);

  const idCounts = new Map<string, number>();
  let withId = 0;
  for (const { op } of ops) {
    if (typeof op.operationId === 'string' && op.operationId.trim()) {
      withId++;
      idCounts.set(op.operationId, (idCounts.get(op.operationId) || 0) + 1);
    }
  }
  const duplicates = Array.from(idCounts.entries()).filter(([, n]) => n > 1).map(([id]) => id);

  let bodies = 0;
  let bodiesWithSchema = 0;
  let typedErrors = 0;
  let idempotencyKey = false;
  let searchEndpoint = false;
  let cursorPagination = false;

  for (const { method, path, op } of ops) {
    const params = parametersOf(spec, path, op);

    const body = resolveRef(spec, op.requestBody);
    const swaggerBody = params.find((p) => p?.in === 'body');
    if (body || swaggerBody) {
      bodies++;
      const jsonMedia = body?.content?.['application/json'];
      if (jsonMedia?.schema || swaggerBody?.schema) bodiesWithSchema++;
    }

    const responses = op.responses && typeof op.responses === 'object' ? op.responses : {};
    const hasTypedError = Object.entries<any>(responses).some(
      ([code, res]) => (/^[45]/.test(code) || code === 'default') && responseHasSchema(spec, res)
    );
    if (hasTypedError) typedErrors++;

    if (params.some((p) => p?.in === 'header' && /^idempotency-key$/i.test(p?.name || ''))) idempotencyKey = true;

    if (/search|query|find/i.test(path) || (method === 'get' && params.some((p) => p?.in === 'query' && /^(q|query|search|filter)$/i.test(p?.name || '')))) {
      searchEndpoint = true;
    }
    if (params.some((p) => p?.in === 'query' && /^(cursor|after|before|starting_after|ending_before|page_token|pageToken|next_token|continuation)$/i.test(p?.name || ''))) {
      cursorPagination = true;
    }
  }

  const serverUrls: string[] = Array.isArray(spec?.servers) ? spec.servers.map((s: any) => String(s?.url || '')) : [];
  if (typeof spec?.basePath === 'string') serverUrls.push(spec.basePath);
  const versionedUris =
    serverUrls.some((s) => /\/v\d+(\b|\/|$)/i.test(s)) ||
    (ops.length > 0 && ops.filter(({ path }) => /^\/v\d+(\/|$)/i.test(path)).length / ops.length >= 0.5);

  const version = String(spec?.openapi || spec?.swagger || '');

  return {
    version,
    operationCount: ops.length,
    operationIds: { withId, duplicates },
    requestBodies: { total: bodies, withJsonSchema: bodiesWithSchema },
    errorResponses: { operationsWithTypedError: typedErrors },
    rateLimitHeaders: /"(x-)?rate-?limit[-\w]*"|"retry-after"/i.test(raw),
    problemDetails: raw.includes('application/problem+json'),
    idempotencyKey,
    versionedUris,
    searchEndpoint,
    cursorPagination,
    webhooks: Boolean(
      (spec?.webhooks && Object.keys(spec.webhooks).length) ||
      spec?.['x-webhooks'] ||
      ops.some(({ op }) => op.callbacks && Object.keys(op.callbacks).length)
    ),
    curlExamples: /curl\s+(-[a-zA-Z]|https?:|\\)/.test(raw),
    codeSamples: /"x-code-?samples"/i.test(raw),
    isOpenApi31: version.startsWith('3.1'),
  };
}
