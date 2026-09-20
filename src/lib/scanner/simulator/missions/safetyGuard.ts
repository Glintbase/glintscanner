/**
 * Safety Guardrail for Glintbase Flight Simulator.
 * Guarantees zero accidental mutations or destructive API actions during agent simulations
 * unless explicitly authorized via --allow-mutations.
 */

export interface SafetyCheckResult {
  isMutation: boolean;
  allowed: boolean;
  reason?: string;
  syntheticResponse?: Record<string, any>;
  dryRunHeaders?: Record<string, string>;
}

const DESTRUCTIVE_KEYWORDS = [
  'delete',
  'remove',
  'destroy',
  'drop',
  'truncate',
  'terminate',
  'cancel',
  'purge',
  'wipe',
  'kill',
  'charge',
  'pay',
  'invoice',
  'refund',
  'transfer',
  'send_money',
  'publish',
  'deploy',
  'reboot',
  'restart',
  'shutdown',
  'modify',
  'patch',
  'update',
  'create',
  'insert',
  'add',
  'post'
];

export class SafetyGuard {
  /**
   * Inspects a tool or action and decides if it is safe to execute or must be intercepted.
   */
  static inspectToolAction(
    toolName: string,
    args: Record<string, any>,
    toolMeta?: { readOnlyHint?: boolean; destructiveHint?: boolean },
    allowMutations: boolean = false
  ): SafetyCheckResult {
    const lowerName = toolName.toLowerCase();

    // Check explicit hint
    if (toolMeta?.readOnlyHint === true) {
      return { isMutation: false, allowed: true };
    }

    if (toolMeta?.destructiveHint === true) {
      if (!allowMutations) {
        return {
          isMutation: true,
          allowed: false,
          reason: `Tool "${toolName}" is marked destructive and --allow-mutations is not set.`,
          syntheticResponse: {
            ok: true,
            dryRun: true,
            action: toolName,
            interceptedPayload: args,
            note: 'Simulated mutation intercepted by Glintbase Safety Guardrail. No real mutation occurred.'
          }
        };
      }
      return { isMutation: true, allowed: true };
    }

    // Keyword heuristics
    const isKeywordMatch = DESTRUCTIVE_KEYWORDS.some(k => lowerName.includes(k));

    if (isKeywordMatch) {
      if (!allowMutations) {
        return {
          isMutation: true,
          allowed: false,
          reason: `Tool "${toolName}" matches destructive/mutation pattern and --allow-mutations was omitted.`,
          syntheticResponse: {
            ok: true,
            dryRun: true,
            action: toolName,
            interceptedPayload: args,
            note: 'Simulated mutation intercepted by Glintbase Safety Guardrail.'
          },
          dryRunHeaders: {
            'X-Dry-Run': 'true',
            'Prefer': 'handling=lenient, dry-run'
          }
        };
      }
      return { isMutation: true, allowed: true };
    }

    return { isMutation: false, allowed: true };
  }

  /**
   * Inspects an HTTP request (method + path) for mutations.
   */
  static inspectHttpRequest(
    method: string,
    urlPath: string,
    allowMutations: boolean = false
  ): SafetyCheckResult {
    const upperMethod = method.toUpperCase();
    if (upperMethod === 'GET' || upperMethod === 'HEAD' || upperMethod === 'OPTIONS') {
      return { isMutation: false, allowed: true };
    }

    if (!allowMutations) {
      return {
        isMutation: true,
        allowed: false,
        reason: `HTTP ${upperMethod} is a mutating request and --allow-mutations was omitted.`,
        syntheticResponse: {
          status: 200,
          dryRun: true,
          method: upperMethod,
          path: urlPath,
          message: 'Glintbase simulated HTTP mutation dry-run'
        },
        dryRunHeaders: {
          'X-Dry-Run': 'true',
          'Prefer': 'dry-run'
        }
      };
    }

    return { isMutation: true, allowed: true };
  }
}
