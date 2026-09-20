/**
 * Glintbase Autonomous Agent Flight Simulator (Track 3)
 * Master Entry Point.
 */

import {
  SimulationOptions,
  SimulationTelemetry,
  CounterfactualComparison,
  TargetContext
} from './types';
import { getPersona, AgentPersona } from './personas/index';
import { DeterministicEngine } from './engines/deterministicEngine';
import { CounterfactualHarness } from './counterfactual';

export * from './types';
export * from './personas/index';
export * from './telemetry/tokenTax';
export * from './telemetry/schemaFriction';
export * from './missions/safetyGuard';
export * from './missions/intentParser';
export * from './missions/goldenSuite';
export * from './counterfactual';
export * from './engines/deterministicEngine';

export class LiveLlmEngine {
  static async run(
    persona: AgentPersona,
    targetContext: TargetContext,
    options: SimulationOptions
  ): Promise<SimulationTelemetry> {
    const fallbackResult = await DeterministicEngine.run(persona, targetContext, options);
    if (fallbackResult.steps.length > 0) {
      fallbackResult.steps[0].details += ` [Deterministic simulation executed]`;
    }
    return fallbackResult;
  }
}

export interface SimulationExecutionResult {
  telemetry: SimulationTelemetry;
  counterfactual?: CounterfactualComparison;
  persona: AgentPersona;
  targetContext: TargetContext;
}

/**
 * Main simulation runner dispatching agent personas across targets.
 */
export async function runSimulation(options: SimulationOptions): Promise<SimulationExecutionResult> {
  const persona = getPersona(options.agent || 'claude-code');
  const targetContext = await DeterministicEngine.probeTargetContext(options.target);

  let telemetry: SimulationTelemetry;
  if (options.mode === 'live') {
    telemetry = await LiveLlmEngine.run(persona, targetContext, options);
  } else {
    telemetry = await DeterministicEngine.run(persona, targetContext, options);
  }

  let counterfactual: CounterfactualComparison | undefined;
  if (telemetry.outcome !== 'completed' || telemetry.schemaFrictionScore > 30 || telemetry.suggestedRemediation) {
    counterfactual = await CounterfactualHarness.evaluate(persona, targetContext, options, telemetry);
  }

  return {
    telemetry,
    counterfactual,
    persona,
    targetContext
  };
}

export const runFlightSimulation = runSimulation;
