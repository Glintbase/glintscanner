/**
 * CLI Command: glintbase init
 * Interactive setup wizard for first-time configuration.
 */

import { Command } from 'commander';
import prompts from 'prompts';
import pc from 'picocolors';
import { saveConfig, getConfigPath } from '../config.js';
import { detectLocalModels } from '../providers.js';

export const initCommand = new Command('init')
  .description('Interactive setup wizard — configure provider, model, and scan defaults')
  .action(async () => {
    console.log(pc.bold('\n  Glintbase Scanner Setup\n'));
    console.log(pc.dim('  Configure your LLM provider for the agent journey harness.'));
    console.log(pc.dim('  You can skip this and use deterministic mode (no LLM needed).\n'));

    // Step 1: Provider selection
    const { provider } = await prompts({
      type: 'select',
      name: 'provider',
      message: 'Which LLM provider do you want to use?',
      choices: [
        { title: 'Ollama (local, free, private)', value: 'ollama' },
        { title: 'LM Studio (local, free)', value: 'lmstudio' },
        { title: 'OpenAI (GPT-4o, needs key)', value: 'openai' },
        { title: 'Anthropic (Claude, needs key)', value: 'anthropic' },
        { title: 'Google (Gemini, needs key)', value: 'google' },
        { title: 'Groq (fast inference, needs key)', value: 'groq' },
        { title: 'OpenRouter (multi-model, needs key)', value: 'openrouter' },
        { title: 'Custom OpenAI-compatible endpoint', value: 'custom' },
        { title: 'Skip (deterministic pathfinder only, no LLM)', value: null },
      ],
      initial: 0,
    });

    if (provider === undefined) process.exit(0); // Ctrl+C

    let model: string | null = null;
    let baseUrl: string | null = null;
    let apiKey: string | null = null;

    // Step 2: Local model detection
    if (provider === 'ollama' || provider === 'lmstudio') {
      const endpoint = provider === 'ollama'
        ? 'http://localhost:11434'
        : 'http://localhost:1234';
      baseUrl = `${endpoint}/v1`;

      console.log(pc.dim(`\n  Probing ${endpoint}...`));
      const models = await detectLocalModels(provider);

      if (models && models.length > 0) {
        console.log(pc.green(`  Found ${models.length} model(s): ${models.slice(0, 5).join(', ')}`));
        const { selectedModel } = await prompts({
          type: 'select',
          name: 'selectedModel',
          message: 'Select a model:',
          choices: models.map((m) => ({ title: m, value: m })),
        });
        model = selectedModel || models[0];
      } else {
        console.log(pc.yellow(`  Could not reach ${provider}. Make sure it's running.`));
        const { manualModel } = await prompts({
          type: 'text',
          name: 'manualModel',
          message: 'Model name (or press Enter for default):',
          initial: provider === 'ollama' ? 'qwen2.5-coder:32b' : 'local-model',
        });
        model = manualModel || (provider === 'ollama' ? 'qwen2.5-coder:32b' : 'local-model');
      }
    }

    // Step 3: Custom endpoint
    if (provider === 'custom') {
      const { customUrl } = await prompts({
        type: 'text',
        name: 'customUrl',
        message: 'OpenAI-compatible base URL:',
        initial: 'http://localhost:8080/v1',
      });
      baseUrl = customUrl;

      const { customModel } = await prompts({
        type: 'text',
        name: 'customModel',
        message: 'Model name:',
        initial: 'my-model',
      });
      model = customModel;

      const { customKey } = await prompts({
        type: 'password',
        name: 'customKey',
        message: 'API key (optional, press Enter to skip):',
      });
      apiKey = customKey || null;
    }

    // Step 4: Cloud provider API key
    if (['openai', 'anthropic', 'google', 'groq', 'openrouter'].includes(provider)) {
      const keyNames: Record<string, string> = {
        openai: 'OPENAI_API_KEY',
        anthropic: 'ANTHROPIC_API_KEY',
        google: 'GOOGLE_GENERATIVE_AI_API_KEY',
        groq: 'GROQ_API_KEY',
        openrouter: 'OPENROUTER_API_KEY',
      };
      const { key } = await prompts({
        type: 'password',
        name: 'key',
        message: `${provider} API key (or set ${keyNames[provider]} env var):`,
      });
      apiKey = key || null;

      if (provider === 'openrouter') {
        baseUrl = 'https://openrouter.ai/api/v1';
      }
    }

    // Step 5: Firecrawl key (optional)
    const { hasFirecrawl } = await prompts({
      type: 'confirm',
      name: 'hasFirecrawl',
      message: 'Do you have a Firecrawl API key? (optional, better markdown extraction)',
      initial: false,
    });

    let firecrawlKey: string | null = null;
    if (hasFirecrawl) {
      const { fcKey } = await prompts({
        type: 'password',
        name: 'fcKey',
        message: 'Firecrawl API key:',
      });
      firecrawlKey = fcKey || null;
    }

    // Step 6: Scan defaults
    const { profile } = await prompts({
      type: 'select',
      name: 'profile',
      message: 'Default scan profile:',
      choices: [
        { title: 'quick (30 pages, ~10s)', value: 'quick' },
        { title: 'deep (80 pages, ~30s)', value: 'deep' },
      ],
      initial: 0,
    });

    // Save config
    const mappedProvider = provider === 'lmstudio' ? 'custom' : provider;
    saveConfig({
      provider: mappedProvider,
      model,
      baseUrl: baseUrl || (provider === 'lmstudio' ? 'http://localhost:1234/v1' : null),
      apiKey,
      firecrawlKey,
      scan: {
        profile: profile || 'quick',
        maxPages: profile === 'deep' ? 80 : 30,
        failUnder: null,
      },
    });

    console.log(pc.green(`\n  Config saved to ${getConfigPath()}`));
    console.log(pc.dim(`  Run: glintbase scan https://docs.example.com\n`));
  });
