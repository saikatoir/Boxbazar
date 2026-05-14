import {
  runReceptionist,
  type CatalogProduct,
  type ConversationState as EngineConversationState,
  type ConversationTurn,
  type DraftOrder,
  type ReceptionistDecision,
  type StoreProfile,
} from '@fcommerce/ai-engine';
import { MetaAuthError, type NormalizedMessengerEvent } from '@fcommerce/meta-sdk';
import type { Conversation, Customer, HandoffReason, Prisma, Store } from '@fcommerce/db';
import { prisma } from './prisma.js';
import { messengerClientForStore } from './meta.js';
import { getLlmProvider, AI_CONFIDENCE_THRESHOLD } from './ai.js';

const HISTORY_LIMIT = 20;

function n(v: bigint | number): number {
  return typeof v === 'bigint' ? Number(v) : v;
}

function toCatalog(products: Array<{
  id: string;
  name: string;
  description: string | null;
  basePriceCents: bigint;
  floorPriceCents: bigint;
  variants: Prisma.JsonValue;
  stockStatus: string;
  keywords: string[];
}>): CatalogProduct[] {
  return products.map((p) => {
    let variants: Array<{ type: string; options: string[] }> = [];
    if (Array.isArray(p.variants)) {
      variants = (p.variants as unknown[])
        .filter((v): v is { type?: unknown; options?: unknown } => !!v && typeof v === 'object')
        .map((v) => ({
          type: String((v as { type?: unknown }).type ?? 'option'),
          options: Array.isArray((v as { options?: unknown }).options)
            ? ((v as { options: unknown[] }).options.map((o) => String(o)))
            : [],
        }))
        .filter((v) => v.options.length > 0);
    }
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      basePriceCents: n(p.basePriceCents),
      floorPriceCents: n(p.floorPriceCents),
      variants,
      stockStatus: (p.stockStatus as CatalogProduct['stockStatus']) ?? 'in_stock',
      keywords: p.keywords ?? [],
    };
  });
}

function storeProfile(store: Store): StoreProfile {
  return {
    name: store.name,
    toneProfile: store.aiToneProfile as StoreProfile['toneProfile'],
    deliveryChargeInsideDhakaCents: n(store.deliveryChargeInsideDhakaCents),
    deliveryChargeOutsideDhakaCents: n(store.deliveryChargeOutsideDhakaCents),
    returnPolicyText: store.returnPolicyText,
    workingHoursStart: store.workingHoursStart,
    workingHoursEnd: store.workingHoursEnd,
    disclosureFooterEnabled: store.aiDisclosureFooterEnabled,
  };
}

async function getOrCreateCustomer(store: Store, psid: string): Promise<Customer> {
  const existing = await prisma.customer.findFirst({
    where: { storeId: store.id, messengerPsid: psid },
  });
  if (existing) return existing;
  return prisma.customer.create({
    data: {
      userId: store.userId,
      storeId: store.id,
      messengerPsid: psid,
      name: `Messenger user ${psid.slice(-6)}`,
    },
  });
}

async function getOrCreateConversation(store: Store, customer: Customer): Promise<Conversation> {
  const existing = await prisma.conversation.findFirst({
    where: { storeId: store.id, customerId: customer.id, channel: 'messenger' },
  });
  if (existing) return existing;
  return prisma.conversation.create({
    data: { storeId: store.id, customerId: customer.id, channel: 'messenger' },
  });
}

function knownAddress(customer: Customer): string | null {
  const hist = customer.addressHistory;
  if (Array.isArray(hist) && hist.length) {
    const first = hist[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object' && 'raw' in first) return String((first as { raw: unknown }).raw);
  }
  return null;
}

async function persistDraftOrder(
  store: Store,
  customer: Customer,
  conversation: Conversation,
  draft: DraftOrder,
  decision: ReceptionistDecision,
): Promise<void> {
  const items = draft.items.map((it) => ({
    productId: it.productId,
    name: it.productName,
    variant: it.variant,
    quantity: it.quantity,
    unitPriceCents: it.unitPriceCents,
  }));
  const aiExtractedData = {
    address: draft.address,
    notes: draft.notes,
    debugNotes: decision.debug.notes,
    confidence: decision.confidence,
  } as unknown as Prisma.InputJsonValue;

  const existing = await prisma.order.findFirst({
    where: { conversationId: conversation.id, source: 'ai', status: 'pending_approval' },
    orderBy: { createdAt: 'desc' },
  });

  const data = {
    items: items as unknown as Prisma.InputJsonValue,
    subtotalCents: BigInt(draft.subtotalCents),
    deliveryCents: BigInt(draft.deliveryCents),
    codCents: BigInt(draft.codCents),
    notes: draft.notes,
    aiExtractedData,
  };

  if (existing) {
    await prisma.order.update({ where: { id: existing.id }, data });
  } else {
    await prisma.order.create({
      data: {
        userId: store.userId,
        storeId: store.id,
        customerId: customer.id,
        conversationId: conversation.id,
        source: 'ai',
        status: 'pending_approval',
        ...data,
      },
    });
  }

  // Enrich the customer record from the order details.
  const updates: Prisma.CustomerUpdateInput = {};
  if (draft.recipientName && customer.name.startsWith('Messenger user ')) updates.name = draft.recipientName;
  if (draft.phone && customer.phone !== draft.phone) updates.phone = draft.phone;
  const hist: unknown[] = Array.isArray(customer.addressHistory) ? (customer.addressHistory as unknown[]) : [];
  if (draft.address?.raw) {
    updates.addressHistory = [
      { raw: draft.address.raw, division: draft.address.division, district: draft.address.district, thana: draft.address.thana },
      ...hist,
    ].slice(0, 10) as unknown as Prisma.InputJsonValue;
  }
  if (Object.keys(updates).length) {
    await prisma.customer.update({ where: { id: customer.id }, data: updates });
  }
}

export interface InboundResult {
  status: 'skipped' | 'recorded_no_ai' | 'handled';
  reason?: string;
  conversationId?: string;
  decision?: ReceptionistDecision;
}

/**
 * The end-to-end path for one inbound Messenger event: dedupe, persist the
 * customer message, run the AI receptionist (if enabled), send the reply,
 * record handoff flags and draft orders. Safe to call from a queue worker.
 */
export async function processInboundMessengerEvent(
  event: NormalizedMessengerEvent,
): Promise<InboundResult> {
  if (event.isEcho || event.isReceiptOnly) return { status: 'skipped', reason: 'echo/receipt' };
  if (!event.senderPsid) return { status: 'skipped', reason: 'no sender' };

  const store = await prisma.store.findUnique({ where: { fbPageId: event.pageId } });
  if (!store) return { status: 'skipped', reason: `no store connected to page ${event.pageId}` };

  const customer = await getOrCreateCustomer(store, event.senderPsid);
  const conversation = await getOrCreateConversation(store, customer);

  // Dedupe: Meta retries webhooks; ignore a message we've already stored.
  if (event.mid) {
    const dup = await prisma.message.findFirst({ where: { metaMessageId: event.mid, direction: 'inbound' } });
    if (dup) return { status: 'skipped', reason: 'duplicate webhook', conversationId: conversation.id };
  }

  const attachments = event.attachments.map((a) => ({ type: a.type, url: a.url }));
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'inbound',
      source: 'customer',
      text: event.text || null,
      attachments: attachments as unknown as Prisma.InputJsonValue,
      metaMessageId: event.mid,
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  // No text to reason over, or AI disabled → record only, seller handles it.
  if (!event.text) return { status: 'recorded_no_ai', reason: 'attachment-only message', conversationId: conversation.id };
  if (!store.aiEnabled) return { status: 'recorded_no_ai', reason: 'AI disabled for store', conversationId: conversation.id };
  if (!conversation.aiEnabled) return { status: 'recorded_no_ai', reason: 'AI disabled for conversation', conversationId: conversation.id };
  if (!store.fbPageAccessTokenEncrypted) return { status: 'recorded_no_ai', reason: 'store not connected to a page', conversationId: conversation.id };

  const [products, history] = await Promise.all([
    prisma.product.findMany({ where: { storeId: store.id, active: true } }),
    prisma.message.findMany({
      where: { conversationId: conversation.id, text: { not: null } },
      orderBy: { createdAt: 'asc' },
      take: HISTORY_LIMIT + 1,
    }),
  ]);
  // Drop the message we just inserted from history (it's `incomingText`).
  const priorTurns: ConversationTurn[] = history
    .filter((m) => m.metaMessageId !== event.mid)
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.direction === 'inbound' ? 'customer' : 'agent', text: m.text ?? '' }));

  const decision = await runReceptionist({
    incomingText: event.text,
    store: storeProfile(store),
    catalog: toCatalog(products),
    history: priorTurns,
    conversationState: conversation.state as EngineConversationState,
    customer: { name: customer.name, phone: customer.phone, knownAddress: knownAddress(customer) },
    provider: await getLlmProvider(),
    confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
  });

  // Update conversation state regardless of action.
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { state: decision.nextState, lastAiActionAt: new Date() },
  });

  // Send the reply (if any).
  const shouldReply = decision.replyText && (decision.action === 'reply' || decision.action === 'reply_and_handoff');
  if (shouldReply && decision.replyText) {
    const client = await messengerClientForStore(store);
    if (client) {
      try {
        await client.sendSenderAction(event.senderPsid, 'mark_seen').catch(() => undefined);
        await client.sendSenderAction(event.senderPsid, 'typing_on').catch(() => undefined);
        const sent = await client.sendText(event.senderPsid, decision.replyText);
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction: 'outbound',
            source: 'ai',
            text: decision.replyText,
            aiIntentClassification: decision.intent as unknown as Prisma.InputJsonValue,
            aiConfidence: decision.confidence,
            aiRawPayload: {
              notes: decision.debug.notes,
              stage1Raw: decision.debug.stage1Raw,
              stage2Raw: decision.debug.stage2Raw,
              orderInProgress: decision.orderInProgress ?? null,
              draftOrderCreated: !!decision.draftOrder,
              action: decision.action,
            } as unknown as Prisma.InputJsonValue,
            metaMessageId: sent.messageId ?? null,
          },
        });
      } catch (err) {
        if (err instanceof MetaAuthError) {
          // Token revoked/expired — stop the AI from looking broken and flag the seller.
          await prisma.store.update({ where: { id: store.id }, data: { aiEnabled: false } });
          await prisma.aiHandoffFlag.create({
            data: {
              conversationId: conversation.id,
              reason: 'manual',
              detail: 'Facebook page token rejected — the seller needs to reconnect their page.',
            },
          });
          throw err;
        }
        throw err;
      }
    }
  }

  // Handoff flag.
  if (decision.handoff) {
    await prisma.aiHandoffFlag.create({
      data: {
        conversationId: conversation.id,
        reason: decision.handoff.reason as HandoffReason,
        detail: decision.handoff.detail,
      },
    });
  }

  // Draft order.
  if (decision.draftOrder) {
    await persistDraftOrder(store, customer, conversation, decision.draftOrder, decision);
  }

  return { status: 'handled', conversationId: conversation.id, decision };
}
