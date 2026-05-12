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
import { TEMPLATES, applyDisclosureFooter } from './templates.js';
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

  // ── Trivial guards ────────────────────────────────────────────────────────
  if (!text) {
    return decision({
      action: 'reply',
      intent: unclearIntent,
      nextState: state,
      replyText: footer(TEMPLATES.didNotUnderstand),
      debug: { stage1Raw: null, stage2Raw: null, notes: ['empty incoming message'] },
    });
  }

  const activeCatalog = input.catalog.filter((p) => p.stockStatus !== 'out_of_stock');
  if (activeCatalog.length === 0) {
    return decision({
      action: 'reply',
      intent: unclearIntent,
      nextState: state,
      replyText: footer(TEMPLATES.noCatalog),
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
  let stage1;
  try {
    stage1 = await classifyIntent({ incomingText: text, history: input.history, provider: input.provider });
  } catch (err) {
    notes.push(`stage1 LLM error: ${(err as Error).message}`);
    return decision({
      action: 'reply_and_handoff',
      intent: unclearIntent,
      nextState: 'human_handoff',
      replyText: footer(TEMPLATES.technicalIssue),
      confidence: 0,
      handoff: { reason: 'llm_error', detail: 'Stage-1 LLM call failed' },
      debug: { stage1Raw: null, stage2Raw: null, notes },
    });
  }
  const intent = stage1.classification;

  // Abusive / hostile → do not engage, flag immediately.
  if (intent.intent === 'abuse') {
    return decision({
      action: 'handoff_silent',
      intent,
      nextState: 'human_handoff',
      replyText: null,
      handoff: { reason: 'abuse', detail: 'Abusive / hostile customer message' },
      debug: { stage1Raw: stage1.raw, stage2Raw: null, notes: ['abuse detected — no reply sent'] },
    });
  }

  // Low confidence → queue for human, send a polite holding reply.
  if (intent.confidence < threshold) {
    return decision({
      action: 'reply_and_handoff',
      intent,
      nextState: 'human_handoff',
      replyText: footer(TEMPLATES.checkWithOwner),
      handoff: { reason: 'low_confidence', detail: `Stage-1 confidence ${intent.confidence.toFixed(2)} below ${threshold}` },
      debug: { stage1Raw: stage1.raw, stage2Raw: null, notes: ['low confidence — handed off'] },
    });
  }

  // Cheap path: simple greeting / small talk from an idle conversation → templated, skip Stage 2.
  const idle = state === 'new_inquiry' || state === 'product_discussion' || state === 'closed';
  if (idle && (intent.intent === 'greeting' || intent.intent === 'small_talk')) {
    const ns = nextConversationState({ current: state, intent: intent.intent, orderConfirmed: false, handoff: false });
    return decision({
      action: 'reply',
      intent,
      nextState: ns,
      replyText: footer(intent.intent === 'greeting' ? TEMPLATES.greeting : TEMPLATES.offTopicRedirect),
      debug: { stage1Raw: stage1.raw, stage2Raw: null, notes: ['templated short-circuit reply'] },
    });
  }

  // ── Stage 2: response generation + entity extraction ──────────────────────
  let stage2;
  try {
    stage2 = await generateResponse({
      incomingText: text,
      history: input.history,
      store: input.store,
      catalog: activeCatalog,
      customer: input.customer,
      state,
      intent,
      provider: input.provider,
    });
  } catch (err) {
    notes.push(`stage2 LLM error: ${(err as Error).message}`);
    return decision({
      action: 'reply_and_handoff',
      intent,
      nextState: 'human_handoff',
      replyText: footer(TEMPLATES.technicalIssue),
      confidence: clamp01(intent.confidence * 0.5),
      handoff: { reason: 'llm_error', detail: 'Stage-2 LLM call failed' },
      debug: { stage1Raw: stage1.raw, stage2Raw: null, notes },
    });
  }

  if (stage2.parseFailed) {
    notes.push('stage2 output unparseable — handed off');
    return decision({
      action: 'reply_and_handoff',
      intent,
      nextState: 'human_handoff',
      replyText: footer(TEMPLATES.checkWithOwner),
      confidence: clamp01(intent.confidence * 0.5),
      handoff: { reason: 'llm_error', detail: 'Stage-2 output could not be parsed as JSON' },
      debug: { stage1Raw: stage1.raw, stage2Raw: stage2.raw, notes },
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
        debug: { stage1Raw: stage1.raw, stage2Raw: stage2.raw, notes: ['model needsHuman + empty reply'] },
      });
    }
    handoff = { reason: 'low_confidence', detail: 'AI not confident enough to handle this message' };
    confidence = clamp01(intent.confidence * 0.6);
  } else if (stage2.catalogMiss) {
    if (!reply) reply = TEMPLATES.notInCatalog;
    handoff = { reason: 'catalog_miss', detail: 'Customer asked about a product not in the catalog' };
  } else if (stage2.discountRequested) {
    if (!reply) reply = TEMPLATES.noDiscount;
    handoff = { reason: 'discount_request', detail: 'Customer asked for a price below the listed price' };
  } else if (stage2.offTopic) {
    if (!reply) reply = TEMPLATES.offTopicRedirect;
    // off-topic redirect alone is not a handoff
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
    if (!reply) reply = TEMPLATES.orderTaken;
  } else if (ext.inProgress && Object.keys(ext.inProgress).filter((k) => k !== 'confirmedByCustomer').length === 0) {
    orderInProgress = null;
  }

  // ── Finalise ──────────────────────────────────────────────────────────────
  if (!reply) {
    reply = handoff ? TEMPLATES.checkWithOwner : TEMPLATES.didNotUnderstand;
    notes.push('model returned empty reply — used template');
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
    debug: { stage1Raw: stage1.raw, stage2Raw: stage2.raw, notes },
  };
}
