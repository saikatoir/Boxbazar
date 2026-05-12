import type { AiToneProfile } from './types.js';

/** Short, instruction-style description of how each tone profile should sound. */
export const TONE_DESCRIPTIONS: Record<AiToneProfile, string> = {
  formal_apu:
    'Polite, warm, slightly formal Bangla. Address the customer as "apu" or "vai" respectfully. ' +
    'Use "আপনি" form. Avoid slang. Keep a professional shop-owner register.',
  casual_apu:
    'Friendly, casual Bangla / Banglish. Address the customer as "apu" or "vai". ' +
    'A relaxed conversational tone, like chatting with a regular customer. Light, never rude.',
  friendly_bhai:
    'Easygoing, friendly Banglish with a "bhai/apu" vibe. Approachable and quick. ' +
    'Conversational, never stiff, but still respectful.',
};

export function toneInstruction(profile: AiToneProfile): string {
  return TONE_DESCRIPTIONS[profile] ?? TONE_DESCRIPTIONS.formal_apu;
}
