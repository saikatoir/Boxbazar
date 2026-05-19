import {
  runReceptionist,
  pickCuratedExamples,
  type AttachmentInput,
  type CatalogProduct,
  type ConversationState as EngineConversationState,
  type ConversationTurn,
  type DraftOrder,
  type ExampleConversation,
  type ReceptionistDecision,
  type StoreProfile,
} from '@fcommerce/ai-engine';
import {
  fetchAttachment,
  MetaAuthError,
  type NormalizedMessengerEvent,
} from '@fcommerce/meta-sdk';
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

  // ── Per-customer rate limit (budget floor) ────────────────────────────────
  // Cap AI-processed messages per customer per hour. Beyond the cap: keep
  // persisting the message but skip the Gemini call. Prevents a single chatty
  // (or hostile) customer from blowing the $2 / seller / month budget.
  const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
  const RATE_LIMIT_MAX = 30;
  const recentInbound = await prisma.message.count({
    where: {
      conversationId: conversation.id,
      direction: 'inbound',
      createdAt: { gt: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
    },
  });
  if (recentInbound > RATE_LIMIT_MAX) {
    return {
      status: 'recorded_no_ai',
      reason: `rate limit: ${recentInbound} inbound msgs in last hour (cap ${RATE_LIMIT_MAX})`,
      conversationId: conversation.id,
    };
  }

  // Has the message got anything useful for the AI to act on?
  const imageAttachmentRefs = event.attachments
    .filter((a): a is { type: string; url: string } => a.type === 'image' && typeof a.url === 'string' && a.url.length > 0);
  if (!event.text && imageAttachmentRefs.length === 0) {
    return { status: 'recorded_no_ai', reason: 'non-image attachment only', conversationId: conversation.id };
  }
  if (!store.aiEnabled) return { status: 'recorded_no_ai', reason: 'AI disabled for store', conversationId: conversation.id };
  if (!conversation.aiEnabled) return { status: 'recorded_no_ai', reason: 'AI disabled for conversation', conversationId: conversation.id };
  if (!store.fbPageAccessTokenEncrypted) return { status: 'recorded_no_ai', reason: 'store not connected to a page', conversationId: conversation.id };

  // Fetch the customer's image attachments from Meta's CDN in parallel with
  // everything else. Cap to MAX_IMAGES so a customer can't spam a 20-image
  // album and balloon the input token count.
  const MAX_IMAGES = 3;
  const imageFetchUrls = imageAttachmentRefs.slice(0, MAX_IMAGES).map((a) => a.url);

  const [products, history, exampleConvos, fetchedImages] = await Promise.all([
    prisma.product.findMany({ where: { storeId: store.id, active: true } }),
    prisma.message.findMany({
      where: { conversationId: conversation.id, text: { not: null } },
      orderBy: { createdAt: 'asc' },
      take: HISTORY_LIMIT + 1,
    }),
    // Seller-flagged "use this style" conversations — cap at 3 most-recent so
    // the system prompt stays bounded. Exclude the current convo and any with
    // < 2 messages (no signal to learn from).
    prisma.conversation.findMany({
      where: {
        storeId: store.id,
        useAsExample: true,
        NOT: { id: conversation.id },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 3,
      include: {
        messages: {
          where: { text: { not: null } },
          orderBy: { createdAt: 'asc' },
          take: 10,
        },
      },
    }),
    Promise.all(imageFetchUrls.map((u) => fetchAttachment(u))),
  ]);

  const imageInputs: AttachmentInput[] = [];
  fetchedImages.forEach((f, i) => {
    if (!f) return;
    const sourceUrl = imageFetchUrls[i] ?? undefined;
    imageInputs.push({ mimeType: f.mimeType, bytes: f.bytes, sourceUrl });
  });
  // Drop the message we just inserted from history (it's `incomingText`).
  const priorTurns: ConversationTurn[] = history
    .filter((m) => m.metaMessageId !== event.mid)
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.direction === 'inbound' ? 'customer' : 'agent', text: m.text ?? '' }));

  // Seller's own starred conversations come first — these are their actual
  // voice. Drop anything with < 2 messages (no signal to learn from).
  const starredExamples: ExampleConversation[] = exampleConvos
    .map((c) => ({
      turns: c.messages.map((m) => ({
        role: (m.direction === 'inbound' ? 'customer' : 'agent') as 'customer' | 'agent',
        text: m.text ?? '',
      })),
      label: 'STARRED BY SELLER',
    }))
    .filter((ex) => ex.turns.length >= 2);

  // Pad with curated BoxBazar baseline examples up to 3 total. These show the
  // AI both successful flows AND graceful price-discipline holds (declined
  // unreasonable discounts politely). When the seller has 3+ starred, no
  // curated picks are added — their voice wins.
  const FEW_SHOT_TARGET = 3;
  const padCount = Math.max(0, FEW_SHOT_TARGET - starredExamples.length);
  const curatedFill: ExampleConversation[] = pickCuratedExamples(padCount).map((c) => ({
    turns: c.turns,
    label: c.label,
  }));
  const exampleConversations: ExampleConversation[] = [
    ...starredExamples.slice(0, FEW_SHOT_TARGET),
    ...curatedFill,
  ];

  const decision = await runReceptionist({
    incomingText: event.text ?? '',
    store: storeProfile(store),
    catalog: toCatalog(products),
    history: priorTurns,
    conversationState: conversation.state as EngineConversationState,
    customer: { name: customer.name, phone: customer.phone, knownAddress: knownAddress(customer) },
    provider: await getLlmProvider(),
    confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
    exampleConversations,
    attachments: imageInputs,
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
