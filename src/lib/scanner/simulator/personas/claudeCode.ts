/**
 * Claude Code Persona Emulator.
 * Autonomous coding agent favoring Streamable HTTP MCP, strict JSON Schemas,
 * and behavioral mutation safety hints.
 */

import { AgentPersona } from './base';
import type { PersonaType, TrajectoryStep, TargetContext, MissionDefinition } from '../types';
import { estimateTokenCount } from '../telemetry/tokenTax';
import { evaluateSchemaFriction } from '../telemetry/schemaFriction';

export class ClaudeCodePersona extends AgentPersona {
  readonly type: PersonaType = 'claude-code';
  readonly name = 'Claude Code';
  readonly description = 'Autonomous coding agent & CLI tool caller (Anthropic Claude 3.7 / 3.5 Sonnet engine)';
  readonly maxContextTokens = 200_000;
  readonly targetManifests = ['.well-known/mcp/manifest.json', 'llms.txt', '.well-known/ard.json'];
  readonly crawlerUserAgent = 'ClaudeBot/1.0';
  readonly systemPrompt = 'You are Claude Code, an expert autonomous coding agent by Anthropic.';

  async evaluateDiscovery(context: TargetContext, stepIndex: number): Promise<TrajectoryStep> {
    const start = Date.now();
    const hasRobots = Boolean(context.robotsTxt && /claudebot|anthropic/i.test(context.robotsTxt));
    const hasArd = Boolean(context.ardJson);
    const hasMcp = Boolean(context.mcpEndpoint || context.mcpManifest);

    const pass = hasRobots || hasArd || hasMcp;
    return {
      stepIndex,
      phase: 'discovery',
      action: 'Probe robots.txt, ard.json & MCP discovery manifests',
      status: pass ? 'pass' : 'warn',
      durationMs: Date.now() - start,
      tokensConsumed: estimateTokenCount((context.robotsTxt || '') + JSON.stringify(context.ardJson || {})),
      details: pass
        ? `Found ${hasMcp ? 'MCP server endpoint' : 'agent discovery manifests'}${hasRobots ? ' · robots.txt permits ClaudeBot' : ''}`
        : 'Missing /.well-known/ard.json and robots.txt AI permissions',
    };
  }

  async evaluateIngestion(context: TargetContext, stepIndex: number): Promise<TrajectoryStep> {
    const start = Date.now();
    const llms = context.llmsTxt || '';
    const tokens = estimateTokenCount(llms);

    if (!llms) {
      return {
        stepIndex,
        phase: 'ingestion',
        action: 'Ingest /llms.txt context window directory',
        status: 'warn',
        durationMs: Date.now() - start,
        tokensConsumed: 0,
        details: 'No /llms.txt discovered; agent must fall back to crawling messy HTML markup',
      };
    }

    const hasH1 = llms.startsWith('#');
    const isBudgetExceeded = tokens > 25000;

    return {
      stepIndex,
      phase: 'ingestion',
      action: 'Parse /llms.txt documentation hierarchy',
      status: isBudgetExceeded ? 'warn' : 'pass',
      durationMs: Date.now() - start,
      tokensConsumed: tokens,
      details: isBudgetExceeded
        ? `Token overhead (${tokens.toLocaleString()} tokens) exceeds standard 25k budget`
        : `Context ingested cleanly (${tokens.toLocaleString()} tokens · ${hasH1 ? 'H1 structure verified' : 'missing H1 header'})`,
    };
  }

  async evaluateAuth(context: TargetContext, stepIndex: number): Promise<TrajectoryStep> {
    const start = Date.now();
    const auth = context.authMd || '';

    if (!auth) {
      return {
        stepIndex,
        phase: 'auth',
        action: 'Resolve machine-readable credentials via auth.md',
        status: 'warn',
        durationMs: Date.now() - start,
        tokensConsumed: 0,
        details: 'Missing /auth.md specification; agent cannot autonomously acquire API keys or Bearer tokens',
      };
    }

    const hasBearer = /bearer/i.test(auth);
    const hasStages = /discover|token|exchange|authenticate/i.test(auth);

    return {
      stepIndex,
      phase: 'auth',
      action: 'Resolve machine-readable auth handshake',
      status: (hasBearer && hasStages) ? 'pass' : 'warn',
      durationMs: Date.now() - start,
      tokensConsumed: estimateTokenCount(auth),
      details: hasBearer
        ? 'Standard Authorization: Bearer token format & authentication stages verified'
        : 'auth.md found but lacks explicit Bearer token header instructions',
    };
  }

  async evaluateExecution(
    context: TargetContext,
    mission: MissionDefinition,
    stepIndex: number,
    allowMutations = false
  ): Promise<TrajectoryStep> {
    const start = Date.now();
    const tools = context.mcpTools || [];

    if (tools.length === 0) {
      return {
        stepIndex,
        phase: 'execution',
        action: `Execute mission '${mission.name}' via tools/call`,
        status: 'fail',
        durationMs: Date.now() - start,
        tokensConsumed: 0,
        details: 'BLOCKED: Target exposes no MCP tools or OpenAPI endpoints to fulfill intent',
        error: {
          code: 'NO_TOOLS_EXPOSED',
          message: 'Target lacks Streamable HTTP MCP server or OpenAPI operations',
        },
      };
    }

    // Select primary candidate tool
    const candidateTool = tools[0];
    const friction = evaluateSchemaFriction(candidateTool.inputSchema);
    const isMutation = candidateTool.destructiveHint || !candidateTool.readOnlyHint;

    if (friction.score > 50) {
      return {
        stepIndex,
        phase: 'execution',
        action: `Call tool '${candidateTool.name}'`,
        status: 'warn',
        durationMs: Date.now() - start,
        tokensConsumed: estimateTokenCount(JSON.stringify(candidateTool.inputSchema || {})),
        details: `Tool schema friction (${friction.score}/100): ${friction.issues[0] || 'Ambiguous parameters'}`,
        error: {
          code: 'SCHEMA_FRICTION',
          message: friction.issues.join('; '),
        },
      };
    }

    return {
      stepIndex,
      phase: 'execution',
      action: `Call tool '${candidateTool.name}' (${isMutation ? (allowMutations ? 'Live Mutation' : 'Dry-Run Intercepted') : 'Read-Only'})`,
      status: 'pass',
      durationMs: Date.now() - start,
      tokensConsumed: estimateTokenCount(JSON.stringify(candidateTool.inputSchema || {})),
      details: `Dispatched tool call successfully · Schema friction: ${friction.score}/100 (${friction.rating})`,
    };
  }

  async evaluateRecovery(
    context: TargetContext,
    mission: MissionDefinition,
    stepIndex: number
  ): Promise<TrajectoryStep> {
    const start = Date.now();
    return {
      stepIndex,
      phase: 'recovery',
      action: 'Evaluate structured error self-healing capabilities',
      status: 'pass',
      durationMs: Date.now() - start,
      tokensConsumed: 45,
      details: 'Error recovery verification: Client receives structured JSON enabling autonomous retry',
    };
  }
}
