import { TokenUsage, BudgetConfig, DEFAULT_BUDGET } from './types';

export class TokenBudgetManager {
  private accumulatedUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };

  private stepCount = 0;
  private budget: BudgetConfig;

  constructor(budgetCustom?: Partial<BudgetConfig>) {
    this.budget = { ...DEFAULT_BUDGET, ...budgetCustom };
  }

  public recordUsage(promptTokens: number, completionTokens: number, provider?: string): TokenUsage {
    const totalTokens = promptTokens + completionTokens;
    // Rough cost estimate per 1k tokens based on provider heuristics
    let costPer1kPrompt = 0.003;
    let costPer1kCompletion = 0.015;

    if (provider === 'groq' || provider === 'ollama') {
      costPer1kPrompt = 0.0002;
      costPer1kCompletion = 0.0006;
    } else if (provider === 'google') {
      costPer1kPrompt = 0.0005;
      costPer1kCompletion = 0.0015;
    }

    const stepCost =
      (promptTokens / 1000) * costPer1kPrompt + (completionTokens / 1000) * costPer1kCompletion;

    this.accumulatedUsage.promptTokens += promptTokens;
    this.accumulatedUsage.completionTokens += completionTokens;
    this.accumulatedUsage.totalTokens += totalTokens;
    this.accumulatedUsage.estimatedCostUsd += stepCost;
    this.stepCount += 1;

    return this.accumulatedUsage;
  }

  public isExceeded(): { exceeded: boolean; reason?: string } {
    if (this.stepCount >= this.budget.maxStepsPerJourney) {
      return { exceeded: true, reason: `Max steps (${this.budget.maxStepsPerJourney}) reached` };
    }
    if (this.accumulatedUsage.totalTokens >= this.budget.maxTotalTokensPerJourney) {
      return {
        exceeded: true,
        reason: `Token budget limit (${this.budget.maxTotalTokensPerJourney}) exceeded`,
      };
    }
    if (this.accumulatedUsage.estimatedCostUsd >= this.budget.maxCostUsdPerJourney) {
      return {
        exceeded: true,
        reason: `Cost budget ($${this.budget.maxCostUsdPerJourney.toFixed(2)}) exceeded`,
      };
    }
    return { exceeded: false };
  }

  public getUsage(): TokenUsage {
    return { ...this.accumulatedUsage };
  }

  public getStepCount(): number {
    return this.stepCount;
  }
}
