/**
 * OpenAPI / Swagger content validation (SPEC-02 / SPEC-03).
 */

export interface OpenAPIOperation {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
}

export interface OpenAPIParseResult {
  valid: boolean;
  reason?: string;
  version?: string;
  title?: string;
  pathCount: number;
  operations: OpenAPIOperation[];
}

function tryParseJson(body: string): any | null {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** Minimal YAML-ish extraction for openapi: and paths: when JSON fails. */
function tryParseYamlLoose(body: string): any | null {
  // Prefer JSON; for YAML only handle simple cases by detecting openapi key + paths block
  if (!/^\s*openapi\s*:/m.test(body) && !/^\s*swagger\s*:/m.test(body)) {
    return null;
  }
  const versionMatch = body.match(/^\s*(?:openapi|swagger)\s*:\s*["']?([^\s"']+)/m);
  const titleMatch = body.match(/^\s*title\s*:\s*["']?(.+?)["']?\s*$/m);
  // Count path keys under paths: (lines starting with / after paths:)
  const pathsIdx = body.search(/^\s*paths\s*:/m);
  const operations: OpenAPIOperation[] = [];
  if (pathsIdx >= 0) {
    const after = body.slice(pathsIdx);
    const pathLine = /^\s+(\/[^\s:]+)\s*:/gm;
    let m;
    const paths = new Set<string>();
    while ((m = pathLine.exec(after)) !== null) {
      paths.add(m[1]);
    }
    Array.from(paths).forEach((p) => {
      operations.push({ method: 'GET', path: p, summary: 'yaml-detected' });
    });
  }
  if (operations.length === 0 && !versionMatch) return null;
  return {
    openapi: versionMatch?.[1],
    info: { title: titleMatch?.[1] },
    paths: Object.fromEntries(operations.map((o) => [o.path, { get: {} }])),
    __yamlLoose: true,
  };
}

export function parseOpenAPI(body: string): OpenAPIParseResult {
  const trimmed = (body || '').trim();
  if (!trimmed) {
    return { valid: false, reason: 'Empty body', pathCount: 0, operations: [] };
  }

  // HTML error pages
  if (/<!doctype html|<html[\s>]/i.test(trimmed.slice(0, 500))) {
    return { valid: false, reason: 'Body is HTML, not OpenAPI', pathCount: 0, operations: [] };
  }

  let doc = tryParseJson(trimmed);
  if (!doc) {
    doc = tryParseYamlLoose(trimmed);
  }
  if (!doc || typeof doc !== 'object') {
    return { valid: false, reason: 'Could not parse JSON/YAML OpenAPI', pathCount: 0, operations: [] };
  }

  const version = doc.openapi || doc.swagger;
  if (!version) {
    return { valid: false, reason: 'Missing openapi/swagger version field', pathCount: 0, operations: [] };
  }

  const paths = doc.paths;
  if (!paths || typeof paths !== 'object' || Object.keys(paths).length === 0) {
    return {
      valid: false,
      reason: 'No paths defined',
      version: String(version),
      title: doc.info?.title,
      pathCount: 0,
      operations: [],
    };
  }

  const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];
  const operations: OpenAPIOperation[] = [];
  for (const [path, item] of Object.entries(paths as Record<string, any>)) {
    if (!item || typeof item !== 'object') continue;
    for (const method of methods) {
      const op = item[method];
      if (op && typeof op === 'object') {
        operations.push({
          method: method.toUpperCase(),
          path,
          operationId: op.operationId,
          summary: op.summary,
        });
      }
    }
    // path item with no methods still counts as a path
    if (!methods.some((m) => item[m])) {
      operations.push({ method: 'GET', path, summary: 'path-only' });
    }
  }

  return {
    valid: operations.length > 0,
    reason: operations.length > 0 ? undefined : 'No operations found under paths',
    version: String(version),
    title: doc.info?.title,
    pathCount: Object.keys(paths).length,
    operations: operations.slice(0, 200),
  };
}
