import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { parseChat } from '../lib/chat-parser.js';

const parseBodySchema = z.object({
  text: z
    .string()
    .min(5, 'কমপক্ষে ৫টি অক্ষরের চ্যাট দিন')
    .max(5000, 'সর্বোচ্চ ৫,০০০ অক্ষর'),
});

export async function chatParseRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/chat-parse',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { text } = parseBodySchema.parse(request.body);
      const userId = request.user.sub;

      const result = await parseChat(text);

      // Persist every attempt (skip cache hits — they were already logged).
      if (result.source !== 'cache') {
        try {
          await prisma.chatParseAttempt.create({
            data: {
              userId,
              rawText: text,
              extractedData: result.parsed as unknown as object,
              confidence: result.confidence as unknown as object,
            },
          });
        } catch (err) {
          fastify.log.warn({ err }, 'Failed to persist ChatParseAttempt');
        }
      }

      return reply.send({
        parsed: result.parsed,
        confidence: result.confidence,
        source: result.source,
      });
    }
  );
}
