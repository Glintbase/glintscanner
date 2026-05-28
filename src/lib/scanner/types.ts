export interface CheckResult {
  id: string;
  label: string;
  passed: boolean;
  points: number;
  maxPoints: number;
  fix: string | null;
}

export interface CategoryResult {
  category: string;
  score: number;
  maxScore: number;
  results?: CheckResult[];
  data?: any;
  warning?: string;
  fix?: string | null;
}

export interface FixPrompt {
  id: string;
  title: string;
  prompt: string;
}
