import type { ContextGraph, DiscoveredSurface, ExtractedPage } from '../../v2/types';

export interface ToolContext {
  graph: ContextGraph;
  surfaces: DiscoveredSurface[];
  pages: Omit<ExtractedPage, 'html'>[];
}

export interface VerificationAssertion {
  verified: boolean;
  evidenceSnippet?: string;
  matchedUrl?: string;
  reason: string;
}
