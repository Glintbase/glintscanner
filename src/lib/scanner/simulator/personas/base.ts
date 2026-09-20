/**
 * Abstract AgentPersona Base Class.
 * Defines standard simulation hooks for different autonomous agent models.
 */

import type { PersonaType, TrajectoryStep, TargetContext, MissionDefinition } from '../types';

export abstract class AgentPersona {
  abstract readonly type: PersonaType;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly maxContextTokens: number;
  abstract readonly targetManifests: string[];
  readonly crawlerUserAgent?: string;
  readonly systemPrompt?: string;

  /**
   * Phase 1: Evaluate Discovery capabilities.
   */
  abstract evaluateDiscovery(context: TargetContext, stepIndex: number): Promise<TrajectoryStep>;

  /**
   * Phase 2: Evaluate Ingestion and Context Window Token Tax.
   */
  abstract evaluateIngestion(context: TargetContext, stepIndex: number): Promise<TrajectoryStep>;

  /**
   * Phase 3: Evaluate Machine-Readable Authentication Resolution.
   */
  abstract evaluateAuth(context: TargetContext, stepIndex: number): Promise<TrajectoryStep>;

  /**
   * Phase 4: Evaluate First-Mile Tool Execution.
   */
  abstract evaluateExecution(
    context: TargetContext,
    mission: MissionDefinition,
    stepIndex: number,
    allowMutations?: boolean
  ): Promise<TrajectoryStep>;

  /**
   * Phase 5: Evaluate Self-Healing Error Recovery.
   */
  abstract evaluateRecovery(
    context: TargetContext,
    mission: MissionDefinition,
    stepIndex: number
  ): Promise<TrajectoryStep>;
}
