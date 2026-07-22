import type { LanguageModel } from 'ai';
import { LLMProviderConfig } from './types';

/**
 * Returns a unified Vercel AI SDK LanguageModel for the requested configuration
 * or auto-detects with multi-key fallback from environment variables.
 */
export async function getAgentModel(config?: LLMProviderConfig): Promise<LanguageModel> {
  const provider = config?.provider || 'auto';

  const tryGoogle = async () => {
    const rawKey = config?.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || '';
    const googleKey = rawKey.trim();
    if (!googleKey) return null;
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    return google(config?.modelName || process.env.GOOGLE_MODEL || 'gemma-4-31b-it');
  };

  const tryGroq = async () => {
    const key = config?.apiKey || process.env.GROQ_API_KEY;
    if (!key) return null;
    const { createGroq } = await import('@ai-sdk/groq');
    const groq = createGroq({ apiKey: key });
    return groq(config?.modelName || process.env.GROQ_MODEL || 'qwen/qwen3.6-27b');
  };

  const tryAnthropic = async () => {
    const key = config?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    const { createAnthropic } = await import('@ai-sdk/anthropic');
    const anthropic = createAnthropic({ apiKey: key, baseURL: config?.baseUrl });
    return anthropic(config?.modelName || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022');
  };

  const tryOpenAI = async () => {
    const key = config?.apiKey || process.env.OPENAI_API_KEY;
    if (!key) return null;
    const { createOpenAI } = await import('@ai-sdk/openai');
    const openai = createOpenAI({ apiKey: key, baseURL: config?.baseUrl });
    return openai(config?.modelName || process.env.OPENAI_MODEL || 'gpt-4o');
  };

  // If explicit provider requested, try it first
  if (provider === 'google') {
    const model = await tryGoogle();
    if (model) return model;
  } else if (provider === 'groq') {
    const model = await tryGroq();
    if (model) return model;
  } else if (provider === 'anthropic') {
    const model = await tryAnthropic();
    if (model) return model;
  } else if (provider === 'openai' || provider === 'ollama') {
    const model = await tryOpenAI();
    if (model) return model;
  }

  // Auto fallback chain across all configured keys in .env: Google -> Groq -> OpenAI -> Anthropic
  const fallbackModel = (await tryGoogle()) || (await tryGroq()) || (await tryOpenAI()) || (await tryAnthropic());
  if (fallbackModel) return fallbackModel;

  throw new Error(
    'No LLM provider configured. Set GOOGLE_GENERATIVE_AI_API_KEY, GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY in .env'
  );
}

export * from './types';
export * from './governor';
