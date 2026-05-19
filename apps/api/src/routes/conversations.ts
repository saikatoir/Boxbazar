import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { messengerClientForStore } from '../lib/meta.js';
import { MetaAuthError } from '@fcommerce/meta-sdk';

async function ownedConversationOr404(userId: string, conversationId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, store: { userId } },
    include: { store: true, customer: true },
  });
}

export async function conversationRoutes(fastify: FastifyInstance): Promise<void> {
  // Inbox: conversations for a store, newest activity first.
  fastify.get<{ Params: { storeId: string }; Querystring: { state?: string; needsAttention?: string } }>(
    '/stores/:storeId/conversations',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const store = await prisma.store.findFirst({
        where: { id: request.params.storeId, userId: request.user.sub },
      });
      if (!store) return reply.status(404).send({ message: 'Store পাওয়া যায়নি।' });

      const conversations = await prisma.conversation.findMany({
        where: {
          storeId: store.id,
          ...(request.query.state ? { state: request.query.state as never } : {}),
          ...(request.query.needsAttention === 'true'
            ? { OR: [{ state: 'human_handoff' }, { handoffFlags: { some: { resolved: false } } }] }
            : {}),
        },
        include: {
          customer: true,
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { handoffFlags: { where: { resolved: false } } } },
        },
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: 100,
      });

      return reply.send({
        conversations: conversations.map((c) => ({
          id: c.id,
          state: c.state,
          channel: c.channel,
          aiEnabled: c.aiEnabled,
          lastMessageAt: c.lastMessageAt,
          customer: { id: c.customer.id, name: c.customer.name, phone: c.customer.phone },
          lastMessage: c.messages[0]
            ? { direction: c.messages[0].direction, source: c.messages[0].source, text: c.messages[0].text, createdAt: c.messages[0].createdAt }
            : null,
          unresolvedHandoffs: c._count.handoffFlags,
        })),
      });
    },
  );

  // Full conversation with messages and handoff flags.
  fastify.get<{ Params: { id: string } }>(
    '/conversations/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const convo = await prisma.conversation.findFirst({
        where: { id: request.params.id, store: { userId: request.user.sub } },
        include: {
          customer: true,
          messages: { orderBy: { createdAt: 'asc' }, take: 200 },
          handoffFlags: { orderBy: { createdAt: 'desc' } },
          orders: { orderBy: { createdAt: 'desc' } },
        },
      });
      if (!convo) return reply.status(404).send({ message: 'Conversation পাওয়া যায়নি।' });
      return reply.send({
        conversation: {
          id: convo.id,
          state: convo.state,
          channel: convo.channel,
          aiEnabled: convo.aiEnabled,
          useAsExample: convo.useAsExample,
          lastMessageAt: convo.lastMessageAt,
          lastAiActionAt: convo.lastAiActionAt,
          customer: convo.customer,
          messages: convo.messages,
          handoffFlags: convo.handoffFlags,
          orders: convo.orders.map((o) => ({
            id: o.id,
            status: o.status,
            source: o.source,
            subtotalCents: Number(o.subtotalCents),
            deliveryCents: Number(o.deliveryCents),
            codCents: Number(o.codCents),
            items: o.items,
            createdAt: o.createdAt,
          })),
        },
      });
    },
  );

  // Seller sends a manual message into the conversation (and out via Messenger).
  fastify.post<{ Params: { id: string } }>(
    '/conversations/:id/messages',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { text } = z.object({ text: z.string().min(1).max(2000) }).parse(request.body);
      const convo = await ownedConversationOr404(request.user.sub, request.params.id);
      if (!convo) return reply.status(404).send({ message: 'Conversation পাওয়া যায়নি।' });

      let metaMessageId: string | null = null;
      if (convo.channel === 'messenger' && convo.customer.messengerPsid) {
        const client = await messengerClientForStore(convo.store);
        if (!client) return reply.status(409).send({ message: 'Store is not connected to a Facebook page.' });
        try {
          const sent = await client.sendText(convo.customer.messengerPsid, text);
          metaMessageId = sent.messageId ?? null;
        } catch (err) {
          if (err instanceof MetaAuthError) {
            await prisma.store.update({ where: { id: convo.store.id }, data: { aiEnabled: false } });
            return reply.status(502).send({ message: 'Facebook rejected the page token — reconnect your page.' });
          }
          fastify.log.error({ err }, 'manual messenger send failed');
          return reply.status(502).send({ message: 'Failed to send the message via Messenger.' });
        }
      }

      const message = await prisma.message.create({
        data: {
          conversationId: convo.id,
          direction: 'outbound',
          source: 'seller',
          text,
          metaMessageId,
        },
      });
      await prisma.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: new Date() } });
      return reply.status(201).send({ message });
    },
  );

  // Toggle per-conversation AI / change state.
  fastify.patch<{ Params: { id: string } }>(
    '/conversations/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = z
        .object({
          aiEnabled: z.boolean().optional(),
          // Toggle whether this conversation is used as a few-shot example
          // for the AI on subsequent customer messages.
          useAsExample: z.boolean().optional(),
          state: z
            .enum(['new_inquiry', 'product_discussion', 'order_collection', 'order_confirmed', 'human_handoff', 'closed'])
            .optional(),
        })
        .parse(request.body);
      const convo = await prisma.conversation.findFirst({
        where: { id: request.params.id, store: { userId: request.user.sub } },
      });
      if (!convo) return reply.status(404).send({ message: 'Conversation পাওয়া যায়নি।' });
      const updated = await prisma.conversation.update({
        where: { id: convo.id },
        data: {
          ...(body.aiEnabled !== undefined ? { aiEnabled: body.aiEnabled } : {}),
          ...(body.useAsExample !== undefined ? { useAsExample: body.useAsExample } : {}),
          ...(body.state !== undefined ? { state: body.state } : {}),
        },
      });
      return reply.send({
        conversation: {
          id: updated.id,
          state: updated.state,
          aiEnabled: updated.aiEnabled,
          useAsExample: updated.useAsExample,
        },
      });
    },
  );

  // Mark all unresolved handoff flags on a conversation as resolved.
  fastify.post<{ Params: { id: string } }>(
    '/conversations/:id/resolve-handoffs',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const convo = await prisma.conversation.findFirst({
        where: { id: request.params.id, store: { userId: request.user.sub } },
      });
      if (!convo) return reply.status(404).send({ message: 'Conversation পাওয়া যায়নি।' });
      const result = await prisma.aiHandoffFlag.updateMany({
        where: { conversationId: convo.id, resolved: false },
        data: { resolved: true, resolvedByUserId: request.user.sub, resolvedAt: new Date() },
      });
      return reply.send({ resolved: result.count });
    },
  );
}
