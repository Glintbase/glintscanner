import { MissionDefinition, StepPhase } from '../types';

export const GOLDEN_MISSIONS: MissionDefinition[] = [
  {
    id: 'discover-capabilities',
    name: 'Discover Capabilities & Indexing',
    goal: 'Locate MCP manifest, llms.txt, ard.json, or OpenAPI spec from cold start',
    targetPhases: ['discovery', 'ingestion']
  },
  {
    id: 'resolve-auth',
    name: 'Resolve Auth & Credentials',
    goal: 'Detect authentication requirements and identify auth scheme / docs',
    targetPhases: ['auth']
  },
  {
    id: 'execute-first-tool',
    name: 'Execute Low-Cost Tool / Query',
    goal: 'Dispatch lowest-cost read action and validate payload schema compliance',
    targetPhases: ['execution']
  },
  {
    id: 'error-recovery',
    name: 'Error Recovery & Hint Parsing',
    goal: 'Request invalid parameter / non-existent route and evaluate error machine-readability',
    targetPhases: ['recovery']
  }
];

export function getMission(id: string): MissionDefinition | undefined {
  return GOLDEN_MISSIONS.find(m => m.id === id);
}
