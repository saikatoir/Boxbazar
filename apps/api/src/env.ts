import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z
    .string()
    .length(64)
    .regex(/^[0-9a-fA-F]+$/, 'ENCRYPTION_KEY must be a 32-byte hex string'),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  AI_PROVIDER: z.enum(['gemini', 'mock']).optional(),
  AI_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
  META_APP_SECRET: z.string().optional(),
  META_VERIFY_TOKEN: z.string().optional(),
  META_GRAPH_VERSION: z.string().default('v21.0'),
  BULKSMS_API_KEY: z.string().optional(),
  BULKSMS_SENDER_ID: z.string().default('fCommerce'),
  SSL_SMS_SID: z.string().optional(),
  SSL_SMS_TOKEN: z.string().optional(),
  STEADFAST_WEBHOOK_TOKEN: z.string().optional(),
  PATHAO_WEBHOOK_TOKEN: z.string().optional(),
  REDX_WEBHOOK_TOKEN: z.string().optional(),
  STATUS_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(4 * 60 * 60 * 1000),
  ENABLE_STATUS_POLLER: z.enum(['true', 'false']).default('true'),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error(
      '❌ Invalid environment variables:\n',
      result.error.flatten().fieldErrors
    );
    process.exit(1);
  }
  return result.data;
}

export const env = parseEnv();
