import { GeminiProvider, MockLlmProvider, type LlmProvider } from '@fcommerce/ai-engine';
import { env } from '../env.js';

let provider: LlmProvider | null = null;

/**
 * Resolves the configured LLM provider (singleton). Falls back to the offline
 * mock if `AI_PROVIDER=mock` or no Gemini key is set, so the receptionist
 * pipeline is always runnable in dev.
 */
export function getLlmProvider(): LlmProvider {
  if (provider) return provider;
  const useMock = env.AI_PROVIDER === 'mock' || (!env.AI_PROVIDER && !env.GEMINI_API_KEY);
  if (useMock || !env.GEMINI_API_KEY) {
    provider = new MockLlmProvider();
  } else {
    provider = new GeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
  }
  return provider;
}

export const AI_CONFIDENCE_THRESHOLD = env.AI_CONFIDENCE_THRESHOLD;
