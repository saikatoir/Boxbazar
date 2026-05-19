import type {
  ConversationState,
  HandoffReason,
  ReceptionistDecision,
  ReceptionistInput,
} from './types.js';
import { classifyIntent } from './intent.js';
import { generateResponse } from './respond.js';
import { buildOrderFromDraft } from './order-extraction.js';
import { nextConversationState } from './state-machine.js';
import { pickTemplate, applyDisclosureFooter } from './templates.js';
import { isWithinWorkingHours, clamp01 } from './util.js';

const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;

function decision(partial: Partial<ReceptionistDecision> & Pick<ReceptionistDecision, 'action' | 'intent' | 'nextState' | 'debug'>): ReceptionistDecision {
  return {
    replyText: null,
    confidence: partial.intent.confidence,
    handoff: null,
    draftOrder: null,
    orderInProgress: null,
    ...partial,
  };
}

/**
 * Runs the two-stage AI receptionist pipeline for a single incoming customer
 * message. Pure (no I/O beyond the supplied LLM provider) — the caller is
 * responsible for persistence, sending the reply, and acting on handoff flags.
 */
export async function runReceptionist(input: ReceptionistInput): Promise<ReceptionistDecision> {
  const now = input.now ?? new Date();
  const threshold = input.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const state = input.conversationState;
  const text = (input.incomingText ?? '').trim();
  const notes: string[] = [];
  const footer = (s: string | null): string | null =>
    s == null ? null : applyDisclosureFooter(s, input.store.disclosureFooterEnabled);

  const unclearIntent = { intent: 'unclear' as const, confidence: 0, requiresCatalog: false };
  const imageAttachments = (input.attachments ?? []).filter((a) =>
    a.mimeType.startsWith('image/'),
  );
  const hasImages = imageAttachments.length > 0;

  // ── Trivial guards ────────────────────────────────────────────────────────
  // Truly-empty message (no text, no image, just a sticker we don't parse) →
  // stay silent. Sending a canned "didn't understand" reply makes the AI feel
  // bot-like; better to wait for the next real message.
  if (!text && !hasImages) {
    return decision({
      action: 'silent',
      intent: unclearIntent,
      nextState: state,
      replyText: null,
      debug: { stage1Raw: null, stage2Raw: null, notes: ['empty / unparseable incoming message — silent'] },
    });
  }

  const activeCatalog = input.catalog.filter((p) => p.stockStatus !== 'out_of_stock');
  if (activeCatalog.length === 0) {
    return decision({
      action: 'reply',
      intent: unclearIntent,
      nextState: state,
      replyText: footer(pickTemplate('noCatalog', input.customer.phone ?? input.store.name)),
      debug: { stage1Raw: null, stage2Raw: null, notes: ['catalog empty — cannot sell'] },
    });
  }

  // ── Working hours ─────────────────────────────────────────────────────────
  if (!isWithinWorkingHours(input.store.workingHoursStart, input.store.workingHoursEnd, now)) {
    return decision({
      action: 'silent',
      intent: unclearIntent,
      nextState: state,
      replyText: null,
      debug: { stage1Raw: null, stage2Raw: null, notes: ['outside seller working hours — staying silent'] },
    });
  }

  // ── Stage 1: intent classification ────────────────────────────────────────
  // When the customer attached an image, almost always it's a product inquiry
  // (here's a pic of what I want). Skipping Stage 1 saves a flash call and
  // sidesteps the text-classifier hallucinating "unclear" on a single short
  // sentence like "ei ta koto?" or just emoji + image.
  let stage1Raw: unknown = null;
  let intent;
  if (hasImages) {
    intent = {
      intent: 'product_inquiry' as const,
      confidence: 0.85,
      requiresCatalog: true,
    };
    notes.push('image attached — skipped Stage 1, synthesized product_inquiry intent');
  } else {
    let stage1;
    try {
      stage1 = await classifyIntent({ incomingText: text, history: input.history, provider: input.provider });
    } catch (err) {
      notes.push(`stage1 LLM error: ${(err as Error).message}`);
      return decision({
        action: 'reply_and_handoff',
        intent: unclearIntent,
        nextState: 'human_handoff',
        replyText: footer(pickTemplate('technicalIssue', input.customer.phone ?? input.store.name)),
        confidence: 0,
        handoff: { reason: 'llm_error', detail: 'Stage-1 LLM call failed' },
        debug: { stage1Raw: null, stage2Raw: null, notes },
      });
    }
    intent = stage1.classification;
    stage1Raw = stage1.raw;
  }

  // Abusive / hostile → do not engage, flag immediately.
  if (intent.intent === 'abuse') {
    return decision({
      action: 'handoff_silent',
      intent,
      nextState: 'human_handoff',
      replyText: null,
      handoff: { reason: 'abuse', detail: 'Abusive / hostile customer message' },
      debug: { stage1Raw, stage2Raw: null, notes: ['abuse detected — no reply sent'] },
    });
  }

  // We used to template-bail to "Apu, ekTu wait korun" when Stage 1 confidence
  // was below the threshold. That made the AI feel robotic — even simple
  // messages like "ami akjon sele" or one-word "hi" tripped it. Stage 1 is a
  // cheap classifier and CAN return low confidence on perfectly answerable
  // messages; the right move is to trust Stage 2 (which has the full catalog,
  // history, examples, and prompt) to handle them. Stage 2 itself sets
  // `needsHuman: true` when it genuinely can't help — that's the real handoff.
  if (intent.confidence < threshold) {
    notes.push(
      `stage1 confidence ${intent.confidence.toFixed(2)} below ${threshold} — proceeding to Stage 2 anyway`,
    );
  }

  // ── Stage 2: response generation + entity extraction ──────────────────────
  let stage2;
  try {
    // When the customer sent only an image (no text), give Stage-2 a minimal
    // synthetic prompt so the model knows what to do. Without this, Gemini
    // receives empty `user` text + an image and tends to drift.
    const stage2Text =
      text || (hasImages ? '(image attached, no text — identify what the customer is pointing at and reply)' : '');
    stage2 = await generateResponse({
      incomingText: stage2Text,
      history: input.history,
      store: input.store,
      catalog: activeCatalog,
      customer: input.customer,
      state,
      intent,
      provider: input.provider,
      examples: input.exampleConversations,
      attachments: imageAttachments,
    });
  } catch (err) {
    notes.push(`stage2 LLM error: ${(err as Error).message}`);
    return decision({
      action: 'reply_and_handoff',
      intent,
      nextState: 'human_handoff',
      replyText: footer(pickTemplate('technicalIssue', input.customer.phone ?? input.store.name)),
      confidence: clamp01(intent.confidence * 0.5),
      handoff: { reason: 'llm_error', detail: 'Stage-2 LLM call failed' },
      debug: { stage1Raw, stage2Raw: null, notes },
    });
  }

  if (stage2.parseFailed) {
    notes.push('stage2 output unparseable — handed off');
    return decision({
      action: 'reply_and_handoff',
      intent,
      nextState: 'human_handoff',
      replyText: footer(pickTemplate('checkWithOwner', input.customer.phone ?? input.store.name)),
      confidence: clamp01(intent.confidence * 0.5),
      handoff: { reason: 'llm_error', detail: 'Stage-2 output could not be parsed as JSON' },
      debug: { stage1Raw, stage2Raw: stage2.raw, notes },
    });
  }

  // ── Resolve reply + handoff from Stage 2 flags ────────────────────────────
  let reply = stage2.reply;
  let handoff: { reason: HandoffReason; detail: string } | null = null;
  let confidence = intent.confidence;

  if (stage2.needsHuman) {
    if (!reply) {
      // model declined to engage (treat like abuse) — stay silent
      return decision({
        action: 'handoff_silent',
        intent,
        nextState: 'human_handoff',
        replyText: null,
        confidence: clamp01(intent.confidence * 0.5),
        handoff: { reason: 'abuse', detail: 'Model declined to engage with the message' },
        debug: { stage1Raw, stage2Raw: stage2.raw, notes: ['model needsHuman + empty reply'] },
      });
    }
    handoff = { reason: 'low_confidence', detail: 'AI not confident enough to handle this message' };
    confidence = clamp01(intent.confidence * 0.6);
  } else if (stage2.catalogMiss) {
    if (!reply) reply = pickTemplate('notInCatalog', input.customer.phone ?? input.store.name);
    handoff = { reason: 'catalog_miss', detail: 'Customer asked about a product not in the catalog' };
  } else if (stage2.discountRequested) {
    if (!reply) reply = pickTemplate('noDiscount', input.customer.phone ?? input.store.name);
    handoff = { reason: 'discount_request', detail: 'Customer asked for a price below the listed price' };
  } else if (stage2.offTopic) {
    // Off-topic alone is not a handoff. If Stage 2 returned a reply, send it;
    // if (rare) it returned empty, stay silent so we don't slap a canned
    // redirect onto every meme or sticker.
    if (!reply) {
      return decision({
        action: 'silent',
        intent,
        nextState: state,
        replyText: null,
        debug: { stage1Raw, stage2Raw: stage2.raw, notes: ['off-topic with empty reply — silent'] },
      });
    }
  } else if (intent.intent === 'complaint') {
    handoff = { reason: 'manual', detail: 'Customer complaint — review recommended' };
  }

  // ── Order extraction ──────────────────────────────────────────────────────
  const ext = buildOrderFromDraft(stage2.orderDraftRaw, activeCatalog, input.store);
  let draftOrder = ext.draft;
  let orderInProgress = ext.draft ? null : ext.inProgress;

  if (ext.unmatchedItemNames.length && !handoff) {
    handoff = {
      reason: 'catalog_miss',
      detail: `Order mentions item(s) not in catalog: ${ext.unmatchedItemNames.join(', ')}`,
    };
  }
  if (draftOrder) {
    notes.push(`order confirmed — COD ৳${(draftOrder.codCents / 100).toFixed(2)}`);
    if (ext.totalMismatch) {
      const warn = `AI-stated total (৳${((stage2.orderDraftRaw?.stateTotalCents ?? 0) / 100).toFixed(2)}) ≠ computed (৳${(draftOrder.codCents / 100).toFixed(2)}) — verify`;
      notes.push(warn);
      draftOrder = { ...draftOrder, notes: [draftOrder.notes, warn].filter(Boolean).join(' | ') };
    }
    if (!reply) reply = pickTemplate('orderTaken', input.customer.phone ?? input.store.name);
  } else if (ext.inProgress && Object.keys(ext.inProgress).filter((k) => k !== 'confirmedByCustomer').length === 0) {
    orderInProgress = null;
  }

  // ── Finalise ──────────────────────────────────────────────────────────────
  // If we still don't have a reply at this point, the model failed to write
  // anything. We have two choices: send the seed-rotated `checkWithOwner`
  // template (only if we're already handing off) or stay silent. Silence
  // beats a canned line in non-handoff cases.
  if (!reply) {
    if (handoff) {
      reply = pickTemplate('checkWithOwner', input.customer.phone ?? input.store.name);
      notes.push('model returned empty reply on handoff — used rotated template');
    } else {
      return decision({
        action: 'silent',
        intent,
        nextState: state,
        replyText: null,
        confidence: clamp01(confidence),
        debug: { stage1Raw, stage2Raw: stage2.raw, notes: ['model returned empty reply — silent'] },
      });
    }
  }

  const nextState: ConversationState = nextConversationState({
    current: state,
    intent: intent.intent,
    orderConfirmed: !!draftOrder,
    handoff: !!handoff,
  });

  const action = handoff ? 'reply_and_handoff' : 'reply';

  return {
    action,
    replyText: footer(reply),
    intent,
    confidence: clamp01(confidence),
    nextState,
    handoff,
    draftOrder,
    orderInProgress,
    debug: { stage1Raw, stage2Raw: stage2.raw, notes },
  };
}
