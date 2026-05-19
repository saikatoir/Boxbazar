import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MFA_SESSION_MAX_AGE_MS } from '../lib/mfa.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      name: string;
      phone: string | null;
      email: string | null;
      subscriptionTier: string;
      isAdmin: boolean;
      isOwner?: boolean;
      /** Unix ms timestamp the token holder last passed MFA. Absent ⇒ never. */
      mfaVerifiedAt?: number;
      /**
       * Owner-id when the token holder is being impersonated. UI shows a
       * banner; routes log the actor for audit.
       */
      impersonatedBy?: string;
    };
    user: {
      sub: string;
      name: string;
      phone: string | null;
      email: string | null;
      subscriptionTier: string;
      isAdmin: boolean;
      isOwner?: boolean;
      mfaVerifiedAt?: number;
      impersonatedBy?: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Reject the request unless the JWT carries `isAdmin: true`. */
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Reject unless `isOwner: true`. Owner is strictly more privileged than admin. */
    requireOwner: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /**
     * Reject the request unless the JWT carries `mfaVerifiedAt` within the
     * MFA_SESSION_MAX_AGE_MS window. Apply *after* requireAdmin so the user
     * is already authenticated when this runs.
     */
    requireRecentMfa: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
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

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      await request.jwtVerify();
    } catch {
      await reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or missing Bearer token',
      });
    }
  });

  fastify.decorate('requireAdmin', async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user?.isAdmin) {
      await reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin access required.',
        code: 'ADMIN_REQUIRED',
      });
    }
  });

  fastify.decorate('requireOwner', async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user?.isOwner) {
      await reply.status(403).send({
        error: 'Forbidden',
        message: 'Owner access required.',
        code: 'OWNER_REQUIRED',
      });
    }
  });

  fastify.decorate('requireRecentMfa', async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const verifiedAt = request.user?.mfaVerifiedAt;
    if (typeof verifiedAt !== 'number' || Date.now() - verifiedAt > MFA_SESSION_MAX_AGE_MS) {
      await reply.status(403).send({
        error: 'MfaRequired',
        message: 'Recent two-factor verification required.',
        code: 'MFA_REQUIRED',
      });
    }
  });
}

export default fp(authPlugin, {
  name: 'auth',
  fastify: '4.x',
});
