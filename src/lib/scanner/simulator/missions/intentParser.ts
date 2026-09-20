/**
 * Enterprise Intent Parser for Glintbase Flight Simulator.
 * Decomposes natural language agent prompts into structured action verbs,
 * semantic entity clusters, and parameter mappings with deep failure diagnostics.
 */

import type { IntentFailureMode } from '../types';

export type { IntentFailureMode };

export interface ParsedIntent {
  rawPrompt: string;
  actionVerb: string;
  targetEntity: string;
  expandedTokens: string[];
  isMutating: boolean;
  requiresAuth: boolean;
  matchedTool?: {
    name: string;
    description: string;
    inputSchema?: any;
    confidence: number;
    matchMethod: 'exact' | 'semantic_synonym' | 'heuristic';
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
  };
  matchedPath?: {
    method: string;
    path: string;
    confidence: number;
    matchMethod: 'exact' | 'semantic_synonym' | 'heuristic';
  };
  failureDiagnostics?: {
    mode: IntentFailureMode;
    message: string;
    expectedPattern: string;
    remediationHint: string;
    closestMatches?: string[];
  };
}

const READ_VERBS = ['get', 'read', 'fetch', 'list', 'search', 'query', 'find', 'check', 'show', 'view', 'inspect', 'verify'];
const WRITE_VERBS = ['create', 'add', 'post', 'insert', 'update', 'modify', 'patch', 'delete', 'remove', 'drop', 'charge', 'pay', 'send', 'trigger'];

const DOMAIN_SYNONYMS: Record<string, string[]> = {
  auth: ['token', 'login', 'key', 'session', 'credential', 'oauth', 'apikey', 'jwt', 'authenticate', 'authorize', 'secret', 'sso', 'bearer'],
  user: ['account', 'customer', 'profile', 'member', 'client', 'subscriber', 'identity', 'org', 'organization', 'tenant'],
  payment: ['billing', 'charge', 'invoice', 'checkout', 'stripe', 'subscription', 'refund', 'transaction', 'cost', 'pay', 'wallet', 'credit', 'payout', 'pricing'],
  order: ['cart', 'purchase', 'receipt', 'item', 'shipment', 'delivery', 'fulfillment', 'order', 'package'],
  status: ['health', 'ping', 'info', 'version', 'readiness', 'metrics', 'alive', 'heartbeat', 'diagnostics'],
  webhook: ['event', 'notification', 'hook', 'callback', 'listener', 'subscription', 'alert', 'dispatch', 'trigger'],
  resource: ['item', 'record', 'data', 'document', 'entity', 'asset', 'file', 'content', 'post', 'article'],
  analytics: ['telemetry', 'logs', 'metrics', 'events', 'stats', 'usage', 'traffic', 'tracking'],
};

export class IntentParser {
  /**
   * Expands tokens with domain-specific synonyms.
   */
  static expandTokens(tokens: string[]): string[] {
    const expanded = new Set(tokens);
    for (const t of tokens) {
      for (const [canonical, syns] of Object.entries(DOMAIN_SYNONYMS)) {
        if (t === canonical || syns.includes(t)) {
          expanded.add(canonical);
          for (const s of syns) expanded.add(s);
        }
      }
    }
    return Array.from(expanded);
  }

  /**
   * Parses a natural language intent against discovered tools and OpenAPI routes.
   */
  static parse(
    prompt: string,
    availableTools: Array<{ name: string; description: string; inputSchema?: any }> = [],
    openApiRoutes: Array<{ method: string; path: string; summary?: string }> = []
  ): ParsedIntent {
    const tokens = prompt.toLowerCase().replace(/[^a-z0-9_\s-]/g, ' ').split(/\s+/).filter(Boolean);

    // 1. Identify primary verb
    let actionVerb = 'get';
    for (const token of tokens) {
      if (READ_VERBS.includes(token)) {
        actionVerb = token;
        break;
      }
      if (WRITE_VERBS.includes(token)) {
        actionVerb = token;
        break;
      }
    }

    const isMutating = WRITE_VERBS.includes(actionVerb);
    const requiresAuth = tokens.some(t => ['auth', 'authenticate', 'oauth', 'token', 'key', 'secret', 'secure'].includes(t)) || isMutating;

    // 2. Identify target entity (remaining nouns)
    const entityTokens = tokens.filter(
      t => t !== actionVerb && !['the', 'a', 'an', 'to', 'for', 'in', 'on', 'at', 'with', 'from', 'my', 'all', 'and'].includes(t)
    );
    const expandedTokens = IntentParser.expandTokens(entityTokens);
    const targetEntity = entityTokens.join('_') || 'resource';

    // 3. Match against MCP tools
    let bestTool: ParsedIntent['matchedTool'] | undefined;
    let highestToolScore = 0;

    for (const tool of availableTools) {
      let score = 0;
      let isExact = false;
      let entityMatched = false;
      const toolNameLower = tool.name.toLowerCase();
      const toolDescLower = (tool.description || '').toLowerCase();

      for (const token of entityTokens) {
        if (toolNameLower.includes(token)) {
          score += 3;
          isExact = true;
          entityMatched = true;
        }
        if (toolDescLower.includes(token)) {
          score += 1.5;
          entityMatched = true;
        }
      }

      // Check expanded synonyms
      for (const token of expandedTokens) {
        if (!entityTokens.includes(token)) {
          if (toolNameLower.includes(token)) {
            score += 2;
            entityMatched = true;
          }
          if (toolDescLower.includes(token)) {
            score += 1;
            entityMatched = true;
          }
        }
      }

      // Action verb bonus ONLY if entity was matched
      if (entityMatched && toolNameLower.includes(actionVerb)) {
        score += 1.5;
      }

      if (entityMatched && score > highestToolScore) {
        highestToolScore = score;
        bestTool = {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          confidence: Math.min(score / (entityTokens.length + 1), 1.0),
          matchMethod: isExact ? 'exact' : score > 2 ? 'semantic_synonym' : 'heuristic',
          readOnlyHint: (tool as any).readOnlyHint,
          destructiveHint: (tool as any).destructiveHint,
        };
      }
    }

    // 4. Match against OpenAPI routes
    let bestPath: ParsedIntent['matchedPath'] | undefined;
    let highestPathScore = 0;

    for (const route of openApiRoutes) {
      let score = 0;
      let isExact = false;
      let entityMatched = false;
      const pathLower = route.path.toLowerCase();
      const summaryLower = (route.summary || '').toLowerCase();

      for (const token of entityTokens) {
        if (pathLower.includes(token)) {
          score += 3;
          isExact = true;
          entityMatched = true;
        }
        if (summaryLower.includes(token)) {
          score += 1.5;
          entityMatched = true;
        }
      }

      // Check expanded synonyms
      for (const token of expandedTokens) {
        if (!entityTokens.includes(token)) {
          if (pathLower.includes(token)) {
            score += 2;
            entityMatched = true;
          }
          if (summaryLower.includes(token)) {
            score += 1;
            entityMatched = true;
          }
        }
      }

      // Method bonus ONLY if entity was matched
      if (entityMatched) {
        if (isMutating && route.method !== 'GET') score += 1.5;
        if (!isMutating && route.method === 'GET') score += 1.5;
      }

      if (entityMatched && score > highestPathScore) {
        highestPathScore = score;
        bestPath = {
          method: route.method,
          path: route.path,
          confidence: Math.min(score / (entityTokens.length + 1), 1.0),
          matchMethod: isExact ? 'exact' : score > 2 ? 'semantic_synonym' : 'heuristic',
        };
      }
    }

    // 5. Diagnostics if no match found
    let failureDiagnostics: ParsedIntent['failureDiagnostics'] | undefined;
    if (highestToolScore < 1 && highestPathScore < 1) {
      const candidates: string[] = [];
      for (const tool of availableTools) {
        candidates.push(tool.name);
      }
      for (const route of openApiRoutes) {
        candidates.push(`${route.method} ${route.path}`);
      }

      const closestMatches = candidates
        .map(cand => {
          let candScore = 0;
          const candLower = cand.toLowerCase();
          for (const t of expandedTokens) {
            if (candLower.includes(t)) candScore += 2;
          }
          return { cand, score: candScore };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(c => c.cand);

      failureDiagnostics = {
        mode: 'INTENT_UNMATCHED_ENDPOINT',
        message: `No matching MCP tool or OpenAPI endpoint found for intent: "${prompt}" (unmatched keywords: [${entityTokens.join(', ')}]).` +
          (closestMatches.length > 0 ? ` Did you mean: ${closestMatches.join(', ')}?` : ''),
        expectedPattern: `Expected tool or path containing ${targetEntity} or related domain endpoints`,
        remediationHint: `Expose an endpoint or MCP tool for "${targetEntity}" in /api/mcp or openapi.json.`,
        closestMatches: closestMatches.length > 0 ? closestMatches : undefined,
      };
    }

    return {
      rawPrompt: prompt,
      actionVerb,
      targetEntity,
      expandedTokens,
      isMutating,
      requiresAuth,
      matchedTool: highestToolScore >= 1 ? bestTool : undefined,
      matchedPath: highestPathScore >= 1 ? bestPath : undefined,
      failureDiagnostics,
    };
  }
}
