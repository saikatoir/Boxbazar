import { GeminiProvider, MockLlmProvider, type LlmProvider } from '@fcommerce/ai-engine';
import { env } from '../env.js';
import { getPlatformConfig } from './platform-config.js';

interface ProviderCache {
  provider: LlmProvider;
  key: string;
}
let cache: ProviderCache | null = null;

/**
 * Resolves the configured LLM provider. Falls back to the offline mock if
 * `AI_PROVIDER=mock` or no Gemini key is configured (DB or env), so the
 * receptionist pipeline is always runnable in dev. Cached by (provider,
 * model, key-tail) so new platform-config saves pick up without a restart.
 */
export async function getLlmProvider(): Promise<LlmProvider> {
  const cfg = await getPlatformConfig();
  const useMock = cfg.aiProvider === 'mock' || !cfg.geminiApiKey;
  const key = useMock
    ? 'mock'
    : `gemini:${cfg.geminiModel}:${(cfg.geminiApiKey ?? '').slice(-8)}`;
  if (cache && cache.key === key) return cache.provider;
  const provider: LlmProvider = useMock
    ? new MockLlmProvider()
    : new GeminiProvider({ apiKey: cfg.geminiApiKey!, model: cfg.geminiModel });
  cache = { provider, key };
  return provider;
}

export const AI_CONFIDENCE_THRESHOLD = env.AI_CONFIDENCE_THRESHOLD;
