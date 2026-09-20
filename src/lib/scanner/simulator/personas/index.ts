import { AgentPersona } from './base';
import { ClaudeCodePersona } from './claudeCode';
import { CursorPersona } from './cursor';
import { PerplexityPersona } from './perplexity';

export * from './base';
export * from './claudeCode';
export * from './cursor';
export * from './perplexity';

export function getPersona(name: string): AgentPersona {
  switch (name.toLowerCase()) {
    case 'cursor':
      return new CursorPersona();
    case 'perplexity':
      return new PerplexityPersona();
    case 'claude-code':
    case 'claude':
    default:
      return new ClaudeCodePersona();
  }
}
