/**
 * CLI config manager — ~/.glintbase/config.json
 * Resolution order: CLI flags > env vars > config file > defaults
 */

import Conf from 'conf';

export interface GlintbaseConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'groq' | 'ollama' | 'openrouter' | 'custom' | null;
  model: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  firecrawlKey: string | null;
  scan: {
    profile: 'quick' | 'deep';
    maxPages: number;
    failUnder: number | null;
  };
}

export interface ResolvedConfig {
  provider: string | null;
  model: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  firecrawlKey: string | null;
  profile: 'quick' | 'deep';
  maxPages: number;
  failUnder: number | null;
  useAgentHarness: boolean;
}

const DEFAULTS: GlintbaseConfig = {
  provider: null,
  model: null,
  baseUrl: null,
  apiKey: null,
  firecrawlKey: null,
  scan: {
    profile: 'quick',
    maxPages: 30,
    failUnder: null,
  },
};

const store = new Conf<GlintbaseConfig>({
  projectName: 'glintbase',
  defaults: DEFAULTS,
});

export function loadConfig(): GlintbaseConfig {
  return {
    provider: store.get('provider'),
    model: store.get('model'),
    baseUrl: store.get('baseUrl'),
    apiKey: store.get('apiKey'),
    firecrawlKey: store.get('firecrawlKey'),
    scan: store.get('scan'),
  };
}

export function saveConfig(config: Partial<GlintbaseConfig>): void {
  for (const [key, value] of Object.entries(config)) {
    store.set(key as keyof GlintbaseConfig, value as any);
  }
}

export function configExists(): boolean {
  return store.get('provider') !== null || store.get('apiKey') !== null;
}

export function getConfigPath(): string {
  return store.path;
}

export function resetConfig(): void {
  store.clear();
}

/**
 * Resolve final config from flags > env > file > defaults.
 */
export function resolveConfig(flags: Record<string, any>): ResolvedConfig {
  const fileConfig = loadConfig();

  const provider = flags.provider
    || process.env.GLINTBASE_PROVIDER
    || fileConfig.provider
    || null;

  const model = flags.model
    || process.env.GLINTBASE_MODEL
    || fileConfig.model
    || getDefaultModel(provider);

  const baseUrl = flags.baseUrl
    || process.env.GLINTBASE_BASE_URL
    || fileConfig.baseUrl
    || getDefaultBaseUrl(provider);

  const apiKey = flags.apiKey
    || getEnvApiKey(provider)
    || fileConfig.apiKey
    || null;

  const firecrawlKey = flags.firecrawlKey
    || process.env.FIRECRAWL_API_KEY
    || fileConfig.firecrawlKey
    || null;

  const profile = flags.profile || fileConfig.scan.profile || 'quick';
  const maxPages = flags.maxPages || fileConfig.scan.maxPages || 30;
  const failUnder = flags.failUnder ?? fileConfig.scan.failUnder ?? null;

  return {
    provider,
    model,
    baseUrl,
    apiKey,
    firecrawlKey,
    profile,
    maxPages,
    failUnder,
    useAgentHarness: Boolean(flags.agent || provider),
  };
}

function getDefaultModel(provider: string | null): string | null {
  switch (provider) {
    case 'ollama': return 'qwen2.5-coder:32b';
    case 'openai': return 'gpt-4o';
    case 'anthropic': return 'claude-3-5-sonnet-20241022';
    case 'google': return 'gemini-2.0-flash';
    case 'groq': return 'qwen/qwen3.6-27b';
    case 'openrouter': return 'openai/gpt-4o';
    default: return null;
  }
}

function getDefaultBaseUrl(provider: string | null): string | null {
  switch (provider) {
    case 'ollama': return 'http://localhost:11434/v1';
    case 'openrouter': return 'https://openrouter.ai/api/v1';
    default: return null;
  }
}

function getEnvApiKey(provider: string | null): string | null {
  switch (provider) {
    case 'openai': return process.env.OPENAI_API_KEY || null;
    case 'anthropic': return process.env.ANTHROPIC_API_KEY || null;
    case 'google': return process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || null;
    case 'groq': return process.env.GROQ_API_KEY || null;
    case 'openrouter': return process.env.OPENROUTER_API_KEY || null;
    default: return null;
  }
}
