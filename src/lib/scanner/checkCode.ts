import { generateText } from 'ai';
import { CheckResult, CategoryResult } from './types';
import { FIX_PROMPTS } from '../prompts/fixPrompts';

/**
 * Returns the best available language model based on environment variables.
 * Priority: Anthropic → OpenAI → Groq → Google Gemini
 */
async function getModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    const { createAnthropic } = await import('@ai-sdk/anthropic');
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic(process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307');
  }

  if (process.env.OPENAI_API_KEY) {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai(process.env.OPENAI_MODEL || 'gpt-4o-mini');
  }

  if (process.env.GROQ_API_KEY) {
    const { createGroq } = await import('@ai-sdk/groq');
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    return groq(process.env.GROQ_MODEL || 'qwen-2.5-coder-32b');
  }

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
    return google(process.env.GOOGLE_MODEL || 'gemini-2.0-flash');
  }

  throw new Error(
    'No AI provider configured. Set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GROQ_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY'
  );
}

function extractCodeBlocks(markdown: string): { lang: string; code: string }[] {
  const blocks: { lang: string; code: string }[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    blocks.push({
      lang: match[1]?.toLowerCase() || '',
      code: match[2]
    });
  }
  return blocks;
}

export async function checkCode(markdown: string): Promise<CategoryResult> {
  const snippets = extractCodeBlocks(markdown);
  const results: CheckResult[] = [];

  // 1. Terminal Prompt Pollution (10 pts)
  let hasPollution = false;
  const shellLangs = ['bash', 'sh', 'shell', 'zsh', 'cmd', 'powershell', 'powersh', ''];
  
  for (const snippet of snippets) {
    if (shellLangs.includes(snippet.lang)) {
      const lines = snippet.code.split('\n');
      for (const line of lines) {
        if (/^\s*\$\s+/.test(line)) {
          hasPollution = true;
          break;
        }
      }
    }
    if (hasPollution) break;
  }

  results.push({
    id: 'prompt_pollution',
    label: 'Terminal Prompt Pollution (No "$" prefixes in copyable code)',
    passed: !hasPollution,
    points: !hasPollution ? 10 : 0,
    maxPoints: 10,
    fix: !hasPollution ? null : 'Remove terminal "$" prompt characters from copyable code examples so agents can run them cleanly.'
  });

  if (snippets.length === 0) {
    results.push({
      id: 'dependency_completeness',
      label: 'Dependency & Import Completeness',
      passed: false,
      points: 0,
      maxPoints: 10,
      fix: 'No code blocks found to analyze.'
    });
    results.push({
      id: 'variable_placeholders',
      label: 'Dynamic Variable Placeholders',
      passed: false,
      points: 0,
      maxPoints: 10,
      fix: 'No code blocks found to analyze.'
    });

    return {
      category: 'code',
      score: 10, // Base default score for having prompt cleanliness (no snippets means no pollution)
      maxScore: 30,
      results,
      warning: 'No code examples found in the documentation to analyze.'
    };
  }

  try {
    const model = await getModel();
    const snippetTexts = snippets.map(s => `Language: ${s.lang}\nCode:\n${s.code}`);

    const { text } = await generateText({
      model,
      prompt: `You are auditing code snippets for AI agent execution readiness.
      Analyze these code snippets:
      ${JSON.stringify(snippetTexts.slice(0, 8))}

      For each snippet, perform two audits:
      Audit 1 (Dependency Completeness): Are all imports present? Are installation commands or package context clear?
      Audit 2 (Dynamic Variable Placeholders): Are placeholders for API keys/secrets formatted clearly as system variables (e.g. process.env.XYZ) or clean placeholders (e.g. <YOUR_API_KEY>, INSERT_API_KEY_HERE) rather than vague human conversational text or hardcoded production credentials?

      Determine if there are issues for each.
      Return ONLY raw JSON with no markdown formatting or backticks:
      {
        "dependenciesPassed": true,
        "dependenciesDetails": "string explanation",
        "placeholdersPassed": true,
        "placeholdersDetails": "string explanation"
      }`,
    });

    // Strip chain-of-thought reasoning blocks (e.g. <think>...</think> from Qwen/DeepSeek)
    // then strip any markdown code fences before JSON.parse
    let cleanText = text
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    // Final safety net: extract the first {...} JSON object in case model still adds surrounding text
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanText = jsonMatch[0];

    const analysis = JSON.parse(cleanText);

    results.push({
      id: 'dependency_completeness',
      label: 'Dependency & Import Completeness',
      passed: !!analysis.dependenciesPassed,
      points: analysis.dependenciesPassed ? 10 : 3,
      maxPoints: 10,
      fix: analysis.dependenciesPassed ? null : `${FIX_PROMPTS.incomplete_snippets}\n\nDetails: ${analysis.dependenciesDetails}`
    });

    results.push({
      id: 'variable_placeholders',
      label: 'Dynamic Variable Placeholders',
      passed: !!analysis.placeholdersPassed,
      points: analysis.placeholdersPassed ? 10 : 3,
      maxPoints: 10,
      fix: analysis.placeholdersPassed ? null : `Replace vague variable hints or hardcoded keys with clean, uppercase environment placeholders (e.g. <YOUR_API_KEY> or process.env.YOUR_API_KEY).\n\nDetails: ${analysis.placeholdersDetails}`
    });

    const score = results.reduce((s, r) => s + r.points, 0);

    return {
      category: 'code',
      score,
      maxScore: 30,
      results,
      data: analysis
    };
  } catch (error: any) {
    console.error('AI Code Execution Check failed:', error.message);
    
    // Fallback: simple heuristics if AI fails
    const hasImports = markdown.includes('import ') || markdown.includes('require(');
    const hasPlaceholders = markdown.includes('<') && markdown.includes('>') || markdown.includes('env');

    results.push({
      id: 'dependency_completeness',
      label: 'Dependency & Import Completeness (AI Check Fallback)',
      passed: hasImports,
      points: hasImports ? 7 : 3,
      maxPoints: 10,
      fix: hasImports ? null : FIX_PROMPTS.incomplete_snippets
    });

    results.push({
      id: 'variable_placeholders',
      label: 'Dynamic Variable Placeholders (AI Check Fallback)',
      passed: hasPlaceholders,
      points: hasPlaceholders ? 7 : 3,
      maxPoints: 10,
      fix: 'Use structured placeholders like <YOUR_API_KEY> or process.env.'
    });

    const score = results.reduce((s, r) => s + r.points, 0);

    return {
      category: 'code',
      score,
      maxScore: 30,
      results,
      warning: 'Analysis performed using structural heuristics.'
    };
  }
}
