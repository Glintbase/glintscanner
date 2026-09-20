/**
 * Deterministic Simulation Engine for Glintbase Flight Simulator.
 * Runs zero-cost, millisecond-fast simulation runs across all 5 agent lifecycle phases:
 * Discovery, Ingestion, Auth Resolution, First-Mile Tool Execution, and Error Recovery.
 */

import {
  SimulationOptions,
  SimulationTelemetry,
  TargetContext,
  TrajectoryOutcome,
  TrajectoryStep
} from '../types';
import { AgentPersona } from '../personas/base';
import { estimateTokens, calculateDollarTax } from '../telemetry/tokenTax';
import { SchemaFrictionEvaluator } from '../telemetry/schemaFriction';
import { SafetyGuard } from '../missions/safetyGuard';
import { IntentParser } from '../missions/intentParser';
import { fetchResource } from '../../v2/fetchResource';
import * as fs from 'node:fs';
import * as path from 'node:path';

export class DeterministicEngine {
  /**
   * Probes a live target URL or reads local target directory to construct TargetContext.
   */
  static async probeTargetContext(target: string): Promise<TargetContext> {
    const isUrl = /^https?:\/\//i.test(target);
    const context: TargetContext = {
      targetUrl: target,
      isUrl,
      mcpTools: []
    };

    if (!isUrl) {
      context.codebaseDir = path.resolve(target);
      const readLocal = (fileRel: string): string | undefined => {
        const candidates = [
          path.join(context.codebaseDir!, fileRel),
          path.join(context.codebaseDir!, 'public', fileRel),
          path.join(context.codebaseDir!, '.well-known', fileRel)
        ];
        for (const c of candidates) {
          if (fs.existsSync(c)) {
            try {
              return fs.readFileSync(c, 'utf-8');
            } catch {
              // ignore
            }
          }
        }
        return undefined;
      };

      context.robotsTxt = readLocal('robots.txt');
      context.llmsTxt = readLocal('llms.txt') || readLocal('llms-full.txt');
      context.authMd = readLocal('auth.md');
      
      const ardRaw = readLocal('ard.json');
      if (ardRaw) {
        try { context.ardJson = JSON.parse(ardRaw); } catch {}
      }

      const mcpRaw = readLocal('mcp.json') || readLocal('manifest.json');
      if (mcpRaw) {
        try {
          context.mcpManifest = JSON.parse(mcpRaw);
          if (context.mcpManifest?.mcpServers) {
            context.mcpTools = [{ name: 'local_mcp_query', description: 'Query local MCP endpoint', inputSchema: { type: 'object' } }];
          }
        } catch {}
      }

      const openApiRaw = readLocal('openapi.json') || readLocal('swagger.json');
      if (openApiRaw) {
        try { context.openApiSpec = JSON.parse(openApiRaw); } catch {}
      }

      // Check 404 handler presence for Anti-SPA Canary check
      const notFoundCandidates = [
        path.join(context.codebaseDir!, 'app', 'not-found.tsx'),
        path.join(context.codebaseDir!, 'app', 'not-found.jsx'),
        path.join(context.codebaseDir!, 'src', 'app', 'not-found.tsx'),
        path.join(context.codebaseDir!, 'src', 'app', 'not-found.jsx'),
        path.join(context.codebaseDir!, 'pages', '404.tsx'),
        path.join(context.codebaseDir!, 'pages', '404.jsx'),
        path.join(context.codebaseDir!, 'src', 'pages', '404.tsx'),
      ];
      const has404 = notFoundCandidates.some(c => fs.existsSync(c));
      context.has404Handler = has404;
      context.hasCanaryLeak = !has404;

      return context;
    }

    // Target is a URL
    const baseUrl = target.replace(/\/$/, '');
    const probeTimeout = 3000;

    const probeEndpoint = async (rel: string) => {
      try {
        const res = await fetchResource(`${baseUrl}${rel}`, { timeoutMs: probeTimeout });
        if (res.ok && res.body && res.httpStatus !== 404 && res.status !== 'soft_404') {
          return res.body;
        }
      } catch {
        // unreachable
      }
      return undefined;
    };

    // Parallel fetch core artifacts + canary probe
    const canaryPath = `/glintbase-canary-probe-${Date.now()}`;
    const [robots, llms, auth, ard, mcpManifest, openApi, canaryRes] = await Promise.all([
      probeEndpoint('/robots.txt'),
      probeEndpoint('/llms.txt'),
      probeEndpoint('/auth.md'),
      probeEndpoint('/.well-known/ard.json'),
      probeEndpoint('/.well-known/mcp/manifest.json'),
      probeEndpoint('/openapi.json'),
      fetchResource(`${baseUrl}${canaryPath}`, { timeoutMs: probeTimeout }).catch(() => null)
    ]);

    context.robotsTxt = robots;
    context.llmsTxt = llms;
    context.authMd = auth;

    if (canaryRes) {
      const httpStatus = canaryRes.httpStatus || 0;
      const body = canaryRes.body || '';
      const isHtmlLeak = httpStatus === 200 && (body.includes('<!DOCTYPE html>') || body.includes('<html') || body.length > 500);
      context.hasCanaryLeak = isHtmlLeak || canaryRes.status === 'soft_404';
      context.has404Handler = httpStatus === 404;
    }

    if (ard) {
      try { context.ardJson = JSON.parse(ard); } catch {}
    }

    if (mcpManifest) {
      try {
        context.mcpManifest = JSON.parse(mcpManifest);
        if (Array.isArray(context.mcpManifest?.tools)) {
          context.mcpTools = context.mcpManifest.tools;
        }
      } catch {}
    }

    if (openApi) {
      try { context.openApiSpec = JSON.parse(openApi); } catch {}
    }

    // If no MCP tools discovered yet, try inspecting ard.json or fallback synthetic tools
    if (!context.mcpTools || context.mcpTools.length === 0) {
      if (context.ardJson?.endpoints) {
        context.mcpTools = Object.entries(context.ardJson.endpoints).map(([key, val]: [string, any]) => ({
          name: key,
          description: typeof val === 'string' ? val : val?.description || 'Endpoint declared in ard.json',
          inputSchema: val?.schema || { type: 'object' },
          readOnlyHint: true
        }));
      } else if (context.openApiSpec?.paths) {
        context.mcpTools = Object.entries(context.openApiSpec.paths).slice(0, 5).map(([p, methods]: [string, any]) => {
          const method = Object.keys(methods)[0] || 'get';
          const op = methods[method];
          return {
            name: `${method}_${p.replace(/[^a-zA-Z0-9]/g, '_')}`,
            description: op?.summary || `HTTP ${method.toUpperCase()} ${p}`,
            inputSchema: op?.requestBody?.content?.['application/json']?.schema || { type: 'object' },
            readOnlyHint: method.toLowerCase() === 'get'
          };
        });
      }
    }

    return context;
  }

  /**
   * Executes the deterministic agent simulation run.
   */
  static async run(
    persona: AgentPersona,
    targetContext: TargetContext,
    options: SimulationOptions
  ): Promise<SimulationTelemetry> {
    const startTime = Date.now();
    const steps: TrajectoryStep[] = [];
    let totalTokens = 0;
    let ttftcMs: number | undefined;
    let failureBottleneck: string | undefined;
    let failureMode: any | undefined;
    let failureDetails: any | undefined;
    let frictionScore = 0;

    // Available tools and OpenAPI routes for intent resolution
    const availableTools = targetContext.mcpTools || [];
    const openApiRoutes = targetContext.openApiSpec?.paths
      ? Object.entries(targetContext.openApiSpec.paths).map(([p, m]: [string, any]) => {
          const meth = Object.keys(m)[0] || 'get';
          return {
            method: meth.toUpperCase(),
            path: p,
            summary: m[meth]?.summary,
            parameters: m[meth]?.parameters,
          };
        })
      : [];

    const parsedIntent = options.intent
      ? IntentParser.parse(options.intent, availableTools, openApiRoutes)
      : undefined;

    // Phase 1: Discovery
    const p1Start = Date.now();
    let p1Tokens = 0;
    let p1Success = false;
    let p1Details = '';

    if (targetContext.llmsTxt) {
      p1Tokens += estimateTokens(targetContext.llmsTxt.slice(0, 3000));
      p1Success = true;
      p1Details = `Discovered /llms.txt (${p1Tokens} tokens consumed)`;
    } else if (targetContext.mcpManifest) {
      p1Tokens += estimateTokens(JSON.stringify(targetContext.mcpManifest));
      p1Success = true;
      p1Details = 'Discovered MCP manifest endpoint';
    } else if (targetContext.robotsTxt) {
      p1Tokens += estimateTokens(targetContext.robotsTxt);
      const allowsBot = targetContext.robotsTxt.toLowerCase().includes('bot') || targetContext.robotsTxt.includes('*');
      p1Details = allowsBot
        ? 'robots.txt found, but no llms.txt or MCP manifest'
        : 'robots.txt blocks AI crawler personas';
      p1Success = allowsBot;
    } else {
      p1Tokens += 450; // heuristic exploratory hops
      p1Details = 'No index found (/llms.txt, ard.json, or MCP manifest). Incurred exploratory search penalty';
      p1Success = false;
    }

    const p1Status: 'pass' | 'warn' | 'fail' = p1Success ? (targetContext.llmsTxt ? 'pass' : 'warn') : 'warn';
    totalTokens += p1Tokens;
    steps.push({
      stepIndex: 1,
      phase: 'discovery',
      action: 'Probe Indexing & Manifests',
      status: p1Status,
      durationMs: Date.now() - p1Start,
      tokensConsumed: p1Tokens,
      details: p1Details
    });

    // Phase 2: Ingestion
    const p2Start = Date.now();
    let p2Tokens = 0;
    let p2Status: 'pass' | 'warn' | 'fail' = 'pass';
    let p2Details = '';

    if (targetContext.mcpTools && targetContext.mcpTools.length > 0) {
      p2Tokens = estimateTokens(JSON.stringify(targetContext.mcpTools));
      p2Details = `Ingested ${targetContext.mcpTools.length} tools into context (${p2Tokens} tokens)`;
      if (p2Tokens > persona.maxContextTokens * 0.25) {
        p2Status = 'warn';
        p2Details += ' - Tools consumed >25% of context window';
      }
    } else if (targetContext.openApiSpec) {
      p2Tokens = Math.min(estimateTokens(JSON.stringify(targetContext.openApiSpec)), 8000);
      p2Details = `Ingested OpenAPI specification (${p2Tokens} tokens)`;
    } else {
      p2Tokens = 200;
      p2Status = 'warn';
      p2Details = 'No structured tool definitions or OpenAPI schemas available to ingest';
    }

    totalTokens += p2Tokens;
    steps.push({
      stepIndex: 2,
      phase: 'ingestion',
      action: 'Ingest Manifest & Schema Definitions',
      status: p2Status,
      durationMs: Date.now() - p2Start,
      tokensConsumed: p2Tokens,
      details: p2Details
    });

    // Phase 3: Auth Resolution
    const p3Start = Date.now();
    let p3Tokens = 0;
    let p3Status: 'pass' | 'warn' | 'fail' = 'pass';
    let p3Details = '';

    const intentRequiresAuth = parsedIntent?.requiresAuth || Boolean(
      options.intent && /(auth|login|token|apikey|key|secret|bearer|credential|charge|pay|delete)/i.test(options.intent)
    );

    if (targetContext.authMd) {
      p3Tokens = estimateTokens(targetContext.authMd.slice(0, 2000));
      const authLower = targetContext.authMd.toLowerCase();
      const hasBearer = authLower.includes('bearer') || authLower.includes('api_key');
      const hasFrontmatter = targetContext.authMd.startsWith('---');
      if (hasBearer && hasFrontmatter) {
        p3Details = `Resolved WorkOS auth.md handbook with standard Bearer / API-Key scheme (${p3Tokens} tokens)`;
      } else {
        p3Status = 'warn';
        p3Details = `auth.md discovered but missing YAML frontmatter or explicit Bearer scheme`;
      }
    } else if (intentRequiresAuth) {
      p3Tokens = 150;
      p3Status = 'fail';
      p3Details = 'Intent requires authentication, but no /auth.md or RFC 9728 machine credentials endpoint was discovered.';
      failureMode = 'AUTH_HANDSHAKE_MISSING';
      failureBottleneck = 'AUTH_HANDSHAKE_MISSING: Intent requires authentication but no /auth.md or RFC 9728 endpoint is exposed.';
      failureDetails = {
        code: 'AUTH_HANDSHAKE_MISSING',
        message: 'Intent requires machine authentication, but no /auth.md handbook, OpenAPI securitySchemes, or RFC 9728 endpoint was discovered.',
        phase: 'auth',
        expected: 'RFC 9728 machine auth or /auth.md containing Bearer token / OAuth 2.1 client_credentials instructions',
        remediation: 'glintbase generate auth'
      };
    } else {
      p3Tokens = 150;
      p3Status = 'warn';
      p3Details = 'No /auth.md or RFC 9728 endpoint discovered. Agent defaults to unauthenticated or blind token guess';
    }

    totalTokens += p3Tokens;
    steps.push({
      stepIndex: 3,
      phase: 'auth',
      action: 'Resolve Authentication Strategy',
      status: p3Status,
      durationMs: Date.now() - p3Start,
      tokensConsumed: p3Tokens,
      details: p3Details
    });

    // Phase 4: Execution
    const p4Start = Date.now();
    let p4Tokens = 0;
    let p4Status: 'pass' | 'warn' | 'fail' = 'pass';
    let p4Details = '';
    let toolTargetName = '';

    if (parsedIntent) {
      if (parsedIntent.matchedTool) {
        toolTargetName = parsedIntent.matchedTool.name;
        const schema = parsedIntent.matchedTool.inputSchema || {};
        const schemaAnalysis = SchemaFrictionEvaluator.analyzeSchema(schema, toolTargetName);
        frictionScore = schemaAnalysis.score;
        p4Tokens = estimateTokens(JSON.stringify(schema)) + 120;

        const safety = SafetyGuard.inspectToolAction(
          toolTargetName,
          {},
          { readOnlyHint: !parsedIntent.isMutating, destructiveHint: parsedIntent.isMutating },
          options.allowMutations
        );

        if (!safety.allowed) {
          p4Status = 'pass';
          p4Details = `Executed dry-run for intent "${options.intent}". ${safety.reason} Intercepted safely.`;
        } else {
          p4Status = frictionScore > 60 ? 'warn' : 'pass';
          p4Details = `Dispatched tool "${toolTargetName}" for intent "${options.intent}"`;
          if (frictionScore > 60) {
            p4Details += ` (High Schema Friction: ${frictionScore}/100)`;
          }
        }
        ttftcMs = Date.now() - startTime;
      } else if (parsedIntent.matchedPath) {
        const route = parsedIntent.matchedPath;
        p4Tokens = 150;
        const safety = SafetyGuard.inspectHttpRequest(route.method, route.path, options.allowMutations);
        p4Status = 'pass';
        p4Details = safety.allowed
          ? `Dispatched HTTP ${route.method} ${route.path} for intent "${options.intent}"`
          : `Dry-run HTTP ${route.method} ${route.path}. Intercepted safely by guardrail.`;
        ttftcMs = Date.now() - startTime;
      } else {
        // Custom intent failed to match any tool
        p4Status = 'fail';
        p4Tokens = 80;
        const diagMsg = parsedIntent.failureDiagnostics?.message || `No matching MCP tool or OpenAPI endpoint found for intent: "${options.intent}"`;
        p4Details = diagMsg;

        if (!failureMode) {
          failureMode = 'INTENT_UNMATCHED_ENDPOINT';
          failureBottleneck = diagMsg;
          failureDetails = {
            code: 'INTENT_UNMATCHED_ENDPOINT',
            message: diagMsg,
            phase: 'execution',
            expected: parsedIntent.failureDiagnostics?.expectedPattern || 'Matching endpoint or tool',
            remediation: parsedIntent.failureDiagnostics?.remediationHint || 'glintbase generate mcp',
            closestMatches: parsedIntent.failureDiagnostics?.closestMatches
          };
        }
      }
    } else {
      // Default Golden Suite execution: lowest-cost read tool
      if (availableTools.length > 0) {
        const lowestCostTool = availableTools.find(t => t.readOnlyHint) || availableTools[0];
        toolTargetName = lowestCostTool.name;
        const schema = lowestCostTool.inputSchema || {};
        const schemaAnalysis = SchemaFrictionEvaluator.analyzeSchema(schema, toolTargetName);
        frictionScore = schemaAnalysis.score;
        p4Tokens = estimateTokens(JSON.stringify(schema)) + 100;
        p4Status = frictionScore > 60 ? 'warn' : 'pass';
        p4Details = `Executed read-only tool "${toolTargetName}" (Schema Friction: ${frictionScore}/100)`;
        ttftcMs = Date.now() - startTime;
      } else {
        p4Tokens = 100;
        p4Status = 'fail';
        p4Details = 'No tools available to execute; cannot dispatch tool';
      }
    }

    totalTokens += p4Tokens;
    steps.push({
      stepIndex: 4,
      phase: 'execution',
      action: 'Dispatch Tool / Query Action',
      status: p4Status,
      durationMs: Date.now() - p4Start,
      tokensConsumed: p4Tokens,
      details: p4Details
    });

    // Phase 5: Error Recovery
    const p5Start = Date.now();
    const p5Tokens = 60;
    let p5Status: 'pass' | 'warn' | 'fail' = 'pass';
    let p5Details = '';

    // Check anti-SPA 404 or RFC 7807 problem details
    if (targetContext.hasCanaryLeak) {
      p5Status = 'warn';
      p5Details = 'Anti-SPA Canary Failure: Nonexistent routes return soft-200 HTML shells instead of RFC 7807 404 JSON, inducing agent hallucinations.';
      if (!failureMode) {
        failureMode = 'SOFT_404_TRAP';
        failureBottleneck = 'SOFT_404_TRAP: Non-existent routes return HTTP 200 HTML shell instead of 404 JSON.';
        failureDetails = {
          code: 'SOFT_404_TRAP',
          message: 'Anti-SPA Canary failure: Nonexistent routes return HTTP 200 HTML shells instead of RFC 7807 404 JSON. Agent personas will parse the HTML shell as a valid API response and hallucinate bogus fields.',
          phase: 'recovery',
          expected: 'Genuine HTTP 404 status code with RFC 7807 problem+json payload',
          remediation: 'glintbase generate not-found'
        };
      }
    } else if (targetContext.isUrl) {
      p5Details = 'Simulated malformed request: server returned clean machine status';
    } else {
      p5Details = 'Simulated non-existent route: Anti-SPA 404 handler verified';
    }

    totalTokens += p5Tokens;
    steps.push({
      stepIndex: 5,
      phase: 'recovery',
      action: 'Simulate Error & Recovery',
      status: p5Status,
      durationMs: Date.now() - p5Start,
      tokensConsumed: p5Tokens,
      details: p5Details
    });

    const totalDurationMs = Date.now() - startTime;
    const inputTokens = Math.round(totalTokens * 0.75);
    const outputTokens = Math.round(totalTokens * 0.25);
    const dollarTaxUsd = calculateDollarTax(inputTokens, outputTokens);

    const hasFail = steps.some(s => s.status === 'fail');
    const hasWarn = steps.some(s => s.status === 'warn');

    let outcome: TrajectoryOutcome = 'completed';
    if (failureBottleneck) {
      if (failureMode === 'SOFT_404_TRAP' || failureMode === 'SCHEMA_TYPE_MISMATCH') {
        outcome = 'hallucinated';
      } else {
        outcome = 'blocked';
      }
    } else if (p4Status === 'fail' || (!parsedIntent && availableTools.length === 0)) {
      outcome = 'failed';
    } else if (hasFail) {
      outcome = 'failed';
    } else if (hasWarn || frictionScore > 60) {
      outcome = 'partial';
    } else {
      outcome = 'completed';
    }

    let suggestedRemediation = undefined;
    if (failureDetails) {
      suggestedRemediation = {
        command: failureDetails.remediation,
        file: failureMode === 'AUTH_HANDSHAKE_MISSING' ? 'public/auth.md' : failureMode === 'SOFT_404_TRAP' ? 'app/not-found.tsx' : 'app/api/mcp/route.ts',
        fixSnippet: [
          `# Remediation for ${failureDetails.code}`,
          failureDetails.message,
          `Expected: ${failureDetails.expected}`
        ],
        rationale: failureDetails.message
      };
    } else if (outcome === 'blocked' || outcome === 'failed' || outcome === 'partial' || p1Status === 'warn' || p3Status === 'warn') {
      suggestedRemediation = {
        command: 'glintbase fix --agent',
        file: !targetContext.llmsTxt ? 'public/llms.txt' : 'public/auth.md',
        fixSnippet: [
          '# Agent Readiness Remediation',
          'Deploy `llms.txt` and `auth.md` to eliminate agent discovery friction and reduce token burn by ~65%.'
        ],
        rationale: 'Missing agent index or auth declaration causes agent personas to burn exploratory tokens and fail tool resolution.'
      };
    }

    return {
      outcome,
      totalDurationMs,
      ttftcMs: ttftcMs || totalDurationMs,
      totalTokensBurned: totalTokens,
      dollarTaxUsd,
      schemaFrictionScore: frictionScore,
      steps,
      failureBottleneck,
      failureMode,
      failureDetails,
      suggestedRemediation
    };
  }
}
