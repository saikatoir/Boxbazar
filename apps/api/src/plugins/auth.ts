import fp from 'fastify-plugin';
import fastifyJwt, { FastifyJWT } from '@fastify/jwt';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      name: string;
      phone: string | null;
      email: string | null;
      subscriptionTier: string;
    };
    user: {
      sub: string;
      name: string;
      phone: string | null;
      email: string | null;
      subscriptionTier: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}

async function authPlugin(fastify: FastifyInstance): Promise<void> {
  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  await fastify.register(fastifyJwt, {
    secret: jwtSecret,
  });

  fastify.decorate(
    'authenticate',
    async function (
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<void> {
      try {
        await request.jwtVerify();
      } catch (err) {
        await reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid or missing Bearer token',
        });
      }
    }
  );
}

export default fp(authPlugin, {
  name: 'auth',
  fastify: '4.x',
});
