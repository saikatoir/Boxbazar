import type { AiToneProfile } from './types.js';

/**
 * Tone profiles describe register only — formality, energy, choice of Bangla
 * vs Banglish. The actual form of address (bhai / apu / by name / neutral)
 * is computed PER CONVERSATION from the customer's name and how they write,
 * not baked into the tone — see prompts.ts buildResponsePrompt.
 */
export const TONE_DESCRIPTIONS: Record<AiToneProfile, string> = {
  formal_apu:
    'Polite, warm, slightly formal register. Use "আপনি" form when speaking Bangla. ' +
    "No slang. Sound like an experienced shop owner who respects the customer's time. " +
    'Match the language the customer is using (Bangla, English, or Banglish).',
  casual_apu:
    'Friendly, casual conversational register. Use natural Bangla or Banglish — whichever the customer uses. ' +
    'Sound like a real shop owner texting on a phone: short, warm, easy.',
  friendly_bhai:
    'Easygoing, approachable register in Banglish or Bangla — mirror the customer. ' +
    'Conversational, never stiff, but still respectful.',
};

export function toneInstruction(profile: AiToneProfile): string {
  return TONE_DESCRIPTIONS[profile] ?? TONE_DESCRIPTIONS.formal_apu;
}
