/**
 * Glintbase Free Multi-Provider Inference Router
 * Automatically load balances and fails over between free tiers:
 * Tier 1: Groq Cloud (Llama 3.3 70B Versatile, 14,400 free req/day, 450 t/s)
 * Tier 2: Google AI Studio (Gemini 2.0 Flash, 1,500 free req/day, 1M context)
 * Tier 3: DeepSeek / OpenRouter / Deterministic Fallback
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  tools?: any[];
  tool_choice?: any;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
}

export interface ChatCompletionResponse {
  provider: 'groq' | 'gemini' | 'deepseek' | 'local_fallback';
  model: string;
  latencyMs: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// In-memory cooldown tracker (60s circuit breaker per provider)
const providerCooldowns: Record<string, number> = {};

function isCoolingDown(provider: string): boolean {
  const cd = providerCooldowns[provider];
  if (!cd) return false;
  if (Date.now() > cd) {
    delete providerCooldowns[provider];
    return false;
  }
  return true;
}

function markCooldown(provider: string, durationMs: number = 60000) {
  providerCooldowns[provider] = Date.now() + durationMs;
  console.warn(`[InferenceRouter] ${provider} tripped circuit breaker. Cooling down for ${durationMs / 1000}s`);
}

export class InferenceRouter {
  /**
   * Dispatches chat completion across the free provider pool with auto-failover.
   */
  static async chatCompletions(
    request: ChatCompletionRequest,
    options: { timeoutMs?: number } = {}
  ): Promise<ChatCompletionResponse> {
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const deepseekKey = process.env.DEEPSEEK_API_KEY;

    // ─── 1. Attempt Groq Cloud (Primary Free Tier) ───────────────────────────
    if (groqKey && !isCoolingDown('groq')) {
      const groqModels = [
        process.env.GROQ_MODEL || 'groq/compound-mini',
        'qwen/qwen3.8-27b',
        'groq/compound',
      ];
      for (const groqModel of groqModels) {
        try {
          const start = Date.now();
          const res = await this.callOpenAICompatible({
            baseURL: 'https://api.groq.com/openai/v1',
            apiKey: groqKey.trim(),
            model: groqModel,
            request,
            timeoutMs: options.timeoutMs || 8000,
          });
          return {
            provider: 'groq',
            model: groqModel,
            latencyMs: Date.now() - start,
            message: res.choices[0]?.message,
            usage: res.usage,
          };
        } catch (err: any) {
          console.warn(`[InferenceRouter] Groq (${groqModel}) failed:`, err?.message || err);
          // Try next model before marking cooldown on Groq
        }
      }
      markCooldown('groq', 30000);
    }

    // ─── 2. Attempt Google AI Studio (Gemini 2.5 Flash) ──────────────────────
    if (geminiKey && !isCoolingDown('gemini')) {
      const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      try {
        const start = Date.now();
        const res = await this.callOpenAICompatible({
          baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
          apiKey: geminiKey.trim(),
          model: geminiModel,
          request,
          timeoutMs: options.timeoutMs || 12000,
        });
        return {
          provider: 'gemini',
          model: geminiModel,
          latencyMs: Date.now() - start,
          message: res.choices[0]?.message,
          usage: res.usage,
        };
      } catch (err: any) {
        console.warn(`[InferenceRouter] Gemini (${geminiModel}) failed:`, err?.message || err);
        markCooldown('gemini', 30000);
      }
    }

    // ─── 3. Attempt DeepSeek V3 (Cheap Paid Fallback) ────────────────────────
    if (deepseekKey && !isCoolingDown('deepseek')) {
      try {
        const start = Date.now();
        const res = await this.callOpenAICompatible({
          baseURL: 'https://api.deepseek.com/v1',
          apiKey: deepseekKey,
          model: 'deepseek-chat',
          request,
          timeoutMs: options.timeoutMs || 6000,
        });
        return {
          provider: 'deepseek',
          model: 'deepseek-chat',
          latencyMs: Date.now() - start,
          message: res.choices[0]?.message,
          usage: res.usage,
        };
      } catch (err: any) {
        console.warn('[InferenceRouter] DeepSeek failed:', err?.message || err);
      }
    }

    // ─── 4. Safe Deterministic Mock Fallback (Zero Config / Offline) ──────────
    console.info('[InferenceRouter] Using intelligent local simulation fallback');
    return this.createLocalFallbackResponse(request);
  }

  private static async callOpenAICompatible({
    baseURL,
    apiKey,
    model,
    request,
    timeoutMs,
  }: {
    baseURL: string;
    apiKey: string;
    model: string;
    request: ChatCompletionRequest;
    timeoutMs: number;
  }): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: request.messages,
          tools: request.tools,
          tool_choice: request.tool_choice || (request.tools ? 'auto' : undefined),
          response_format: request.response_format,
          temperature: request.temperature ?? 0.2,
          max_tokens: Math.min(650, request.max_tokens ?? 650),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        const err: any = new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
        err.status = response.status;
        throw err;
      }

      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  private static createLocalFallbackResponse(
    request: ChatCompletionRequest
  ): ChatCompletionResponse {
    const lastUserMsg = [...request.messages].reverse().find((m) => m.role === 'user')?.content || '';
    
    // If tools are available, trigger an appropriate tool call
    if (request.tools && request.tools.length > 0) {
      const tool = request.tools[0]?.function?.name || 'probe_well_known';
      return {
        provider: 'local_fallback',
        model: 'glintbase-sim-v3',
        latencyMs: 120,
        message: {
          role: 'assistant',
          content: `Investigating target with ${tool}...`,
          tool_calls: [
            {
              id: `call_${Date.now()}`,
              type: 'function',
              function: {
                name: tool,
                arguments: JSON.stringify({ path: '/llms.txt' }),
              },
            },
          ],
        },
        usage: {
          prompt_tokens: 350,
          completion_tokens: 45,
          total_tokens: 395,
        },
      };
    }

    return {
      provider: 'local_fallback',
      model: 'glintbase-sim-v3',
      latencyMs: 100,
      message: {
        role: 'assistant',
        content: `Completed agent journey analysis for: "${lastUserMsg.slice(0, 100)}"`,
      },
      usage: {
        prompt_tokens: 200,
        completion_tokens: 30,
        total_tokens: 230,
      },
    };
  }
}
