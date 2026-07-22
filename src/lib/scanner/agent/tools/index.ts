import { createSearchDocsTool } from './searchDocs';
import { createReadSurfaceTool } from './readSurface';
import { createInspectOpenAPITool } from './inspectOpenAPI';
import { createVerifyGoalTool } from './verifyGoal';
import type { ToolContext } from './types';

export function getAgentTools(context: ToolContext) {
  return {
    search_docs: createSearchDocsTool(context),
    read_surface: createReadSurfaceTool(context),
    inspect_openapi_spec: createInspectOpenAPITool(context),
    verify_goal: createVerifyGoalTool(context),
  };
}

export * from './types';
