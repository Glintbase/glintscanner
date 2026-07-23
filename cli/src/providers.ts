/**
 * CLI provider resolution — detect local models, verify cloud providers.
 */

import type { ResolvedConfig } from './config.js';

export interface ProviderResolution {
  provider: string;
  model: string;
  baseUrl?: string;
  available: boolean;
  error?: string;
}

/**
 * Detect available models from a local provider (Ollama or LM Studio).
 * Returns null if the provider is not reachable.
 */
export async function detectLocalModels(provider: 'ollama' | 'lmstudio'): Promise<string[] | null> {
  const endpoints: Record<string, string> = {
    ollama: 'http://localhost:11434/api/tags',
    lmstudio: 'http://localhost:1234/v1/models',
  };

  try {
    const res = await fetch(endpoints[provider], {
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) return null;

    const data = await res.json() as any;

    if (provider === 'ollama') {
      // Ollama returns { models: [{ name: "..." }] }
      return (data.models || []).map((m: any) => m.name || m.model).filter(Boolean);
    } else {
      // LM Studio / OpenAI-compatible returns { data: [{ id: "..." }] }
      return (data.data || []).map((m: any) => m.id).filter(Boolean);
    }
  } catch {
    return null;
  }
}

/**
 * Resolve provider availability and configuration.
 * Used by scan command to verify the provider is reachable before starting.
 */
export async function resolveProvider(config: ResolvedConfig): Promise<ProviderResolution> {
  const provider = config.provider;
  const model = config.model || 'default';

  // No provider = deterministic mode
  if (!provider) {
    return {
      provider: 'deterministic',
      model: 'pathfinder',
      available: true,
    };
  }

  // Local providers: probe endpoint
  if (provider === 'ollama') {
    const baseUrl = config.baseUrl || 'http://localhost:11434/v1';
    const probeUrl = baseUrl.replace(/\/v1\/?$/, '/api/tags');

    try {
      const res = await fetch(probeUrl, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) {
        return {
          provider,
          model,
          baseUrl,
          available: false,
          error: `Ollama returned HTTP ${res.status}. Is it running? Try: ollama serve`,
        };
      }

      const data = await res.json() as any;
      const models: string[] = (data.models || []).map((m: any) => m.name || m.model);

      if (model && model !== 'default' && !models.includes(model)) {
        return {
          provider,
          model,
          baseUrl,
          available: false,
          error: `Model "${model}" not found in Ollama. Available: ${models.slice(0, 5).join(', ')}. Pull it with: ollama pull ${model}`,
        };
      }

      return { provider, model, baseUrl, available: true };
    } catch {
      return {
        provider,
        model,
        baseUrl,
        available: false,
        error: 'Ollama not reachable at localhost:11434. Start it with `ollama serve` or switch providers.',
      };
    }
  }

  // Custom endpoint (LM Studio, vLLM, etc.)
  if (provider === 'custom') {
    const baseUrl = config.baseUrl;
    if (!baseUrl) {
      return {
        provider,
        model,
        available: false,
        error: 'Custom provider requires --base-url or config baseUrl.',
      };
    }

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
        signal: AbortSignal.timeout(3000),
        headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
      });

      if (!res.ok) {
        return {
          provider,
          model,
          baseUrl,
          available: false,
          error: `Custom endpoint returned HTTP ${res.status} at ${baseUrl}/models`,
        };
      }

      return { provider, model, baseUrl, available: true };
    } catch {
      return {
        provider,
        model,
        baseUrl,
        available: false,
        error: `Cannot reach custom endpoint at ${baseUrl}. Is the server running?`,
      };
    }
  }

  // Cloud providers: verify API key present
  const keyEnvMap: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_GENERATIVE_AI_API_KEY',
    groq: 'GROQ_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
  };

  if (keyEnvMap[provider]) {
    if (!config.apiKey) {
      return {
        provider,
        model,
        available: false,
        error: `No API key for ${provider}. Set ${keyEnvMap[provider]} env var or run \`glintbase init\`.`,
      };
    }
    return { provider, model, available: true };
  }

  // Unknown provider
  return {
    provider,
    model,
    available: false,
    error: `Unknown provider: ${provider}. Supported: openai, anthropic, google, groq, ollama, openrouter, custom.`,
  };
}
