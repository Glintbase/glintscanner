import type { LanguageModel } from 'ai';

export type LLMProviderName = 'anthropic' | 'openai' | 'google' | 'groq' | 'ollama' | 'auto';

export interface LLMProviderConfig {
  provider?: LLMProviderName;
  modelName?: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokensPerStep?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface BudgetConfig {
  maxTotalTokensPerJourney: number;
  maxCostUsdPerJourney: number;
  maxStepsPerJourney: number;
}

export const DEFAULT_BUDGET: BudgetConfig = {
  maxTotalTokensPerJourney: 25_000,
  maxCostUsdPerJourney: 0.05,
  maxStepsPerJourney: 8,
};
