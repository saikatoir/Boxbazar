import { prisma } from './prisma.js';
import { encryptCredentials, decryptCredentials } from './encryption.js';
import { env } from '../env.js';

const SINGLETON_ID = 'singleton';

/** Sensitive values — never returned to clients in plain text. */
export interface PlatformSecrets {
  metaAppSecret?: string;
  metaVerifyToken?: string;
  geminiApiKey?: string;
  bulkSmsApiKey?: string;
  sslSmsSid?: string;
  sslSmsToken?: string;
  steadfastWebhookToken?: string;
  pathaoWebhookToken?: string;
  redxWebhookToken?: string;
}

/** Fully-resolved runtime config (DB row + env fallback). */
export interface ResolvedPlatformConfig {
  metaAppId: string | null;
  metaAppSecret: string | null;
  metaVerifyToken: string | null;
  metaGraphVersion: string;
  publicWebhookUrl: string | null;
  geminiApiKey: string | null;
  geminiModel: string;
  aiProvider: 'gemini' | 'mock' | null;
  bulkSmsApiKey: string | null;
  bulkSmsSenderId: string;
  sslSmsSid: string | null;
  sslSmsToken: string | null;
  steadfastWebhookToken: string | null;
  pathaoWebhookToken: string | null;
  redxWebhookToken: string | null;
}

/**
 * Short-lived cache so request hot paths (webhook verification, AI calls)
 * don't hit Postgres for every event. Invalidated on save.
 */
let cached: { value: ResolvedPlatformConfig; loadedAt: number } | null = null;
const TTL_MS = 30_000;

export function invalidatePlatformConfigCache(): void {
  cached = null;
}

function readSecrets(blob: string | null): PlatformSecrets {
  if (!blob) return {};
  try {
    return decryptCredentials(blob) as PlatformSecrets;
  } catch {
    return {};
  }
}

function mergeWithEnv(
  row: Awaited<ReturnType<typeof prisma.platformConfig.findUnique>>,
): ResolvedPlatformConfig {
  const secrets = readSecrets(row?.encryptedSecrets ?? null);
  const aiProviderRaw = row?.aiProvider ?? env.AI_PROVIDER ?? null;
  const aiProvider: 'gemini' | 'mock' | null =
    aiProviderRaw === 'gemini' || aiProviderRaw === 'mock' ? aiProviderRaw : null;
  return {
    metaAppId: row?.metaAppId ?? null,
    metaAppSecret: secrets.metaAppSecret ?? env.META_APP_SECRET ?? null,
    metaVerifyToken: secrets.metaVerifyToken ?? env.META_VERIFY_TOKEN ?? null,
    metaGraphVersion: row?.metaGraphVersion || env.META_GRAPH_VERSION,
    publicWebhookUrl: row?.publicWebhookUrl ?? null,
    geminiApiKey: secrets.geminiApiKey ?? env.GEMINI_API_KEY ?? null,
    geminiModel: row?.geminiModel || env.GEMINI_MODEL,
    aiProvider,
    bulkSmsApiKey: secrets.bulkSmsApiKey ?? env.BULKSMS_API_KEY ?? null,
    bulkSmsSenderId: row?.bulkSmsSenderId || env.BULKSMS_SENDER_ID,
    sslSmsSid: secrets.sslSmsSid ?? env.SSL_SMS_SID ?? null,
    sslSmsToken: secrets.sslSmsToken ?? env.SSL_SMS_TOKEN ?? null,
    steadfastWebhookToken:
      secrets.steadfastWebhookToken ?? env.STEADFAST_WEBHOOK_TOKEN ?? null,
    pathaoWebhookToken: secrets.pathaoWebhookToken ?? env.PATHAO_WEBHOOK_TOKEN ?? null,
    redxWebhookToken: secrets.redxWebhookToken ?? env.REDX_WEBHOOK_TOKEN ?? null,
  };
}

export async function getPlatformConfig(): Promise<ResolvedPlatformConfig> {
  if (cached && Date.now() - cached.loadedAt < TTL_MS) return cached.value;
  const row = await prisma.platformConfig.findUnique({ where: { id: SINGLETON_ID } });
  const value = mergeWithEnv(row);
  cached = { value, loadedAt: Date.now() };
  return value;
}

/** Indicates which secret fields have a saved (non-empty) value, for the UI. */
export type SecretFlags = Record<keyof PlatformSecrets, boolean>;

function secretFlags(secrets: PlatformSecrets): SecretFlags {
  const keys: (keyof PlatformSecrets)[] = [
    'metaAppSecret',
    'metaVerifyToken',
    'geminiApiKey',
    'bulkSmsApiKey',
    'sslSmsSid',
    'sslSmsToken',
    'steadfastWebhookToken',
    'pathaoWebhookToken',
    'redxWebhookToken',
  ];
  return Object.fromEntries(
    keys.map((k) => [k, typeof secrets[k] === 'string' && secrets[k]!.length > 0]),
  ) as SecretFlags;
}

export interface PlatformConfigPublic {
  metaAppId: string | null;
  metaGraphVersion: string;
  publicWebhookUrl: string | null;
  geminiModel: string;
  aiProvider: 'gemini' | 'mock' | null;
  bulkSmsSenderId: string;
  /** True when the secret is present (env or DB); never returns the actual value. */
  hasSecret: SecretFlags;
  /** Runtime readiness flags so the UI can show "launch checklist" cues. */
  ready: {
    /** Webhook GET/POST will accept calls (app secret + verify token both set). */
    messengerWebhook: boolean;
    /** AI engine will call Gemini (not the offline mock). */
    aiEngine: boolean;
  };
  updatedAt: Date | null;
}

export async function readPublicPlatformConfig(): Promise<PlatformConfigPublic> {
  const row = await prisma.platformConfig.findUnique({ where: { id: SINGLETON_ID } });
  const secrets = readSecrets(row?.encryptedSecrets ?? null);
  const resolved = mergeWithEnv(row);
  // Flags reflect whatever's available at runtime (DB or env), not only DB —
  // an operator who set env vars should see ✓ even before opening the form.
  const merged = secretFlags({
    metaAppSecret: resolved.metaAppSecret ?? undefined,
    metaVerifyToken: resolved.metaVerifyToken ?? undefined,
    geminiApiKey: resolved.geminiApiKey ?? undefined,
    bulkSmsApiKey: resolved.bulkSmsApiKey ?? undefined,
    sslSmsSid: resolved.sslSmsSid ?? undefined,
    sslSmsToken: resolved.sslSmsToken ?? undefined,
    steadfastWebhookToken: resolved.steadfastWebhookToken ?? undefined,
    pathaoWebhookToken: resolved.pathaoWebhookToken ?? undefined,
    redxWebhookToken: resolved.redxWebhookToken ?? undefined,
  });
  void secrets;
  return {
    metaAppId: resolved.metaAppId,
    metaGraphVersion: resolved.metaGraphVersion,
    publicWebhookUrl: resolved.publicWebhookUrl,
    geminiModel: resolved.geminiModel,
    aiProvider: resolved.aiProvider,
    bulkSmsSenderId: resolved.bulkSmsSenderId,
    hasSecret: merged,
    ready: {
      messengerWebhook: !!resolved.metaAppSecret && !!resolved.metaVerifyToken,
      aiEngine: !!resolved.geminiApiKey && resolved.aiProvider !== 'mock',
    },
    updatedAt: row?.updatedAt ?? null,
  };
}

export interface PlatformConfigPatch {
  metaAppId?: string | null;
  metaGraphVersion?: string | null;
  publicWebhookUrl?: string | null;
  geminiModel?: string | null;
  aiProvider?: 'gemini' | 'mock' | null;
  bulkSmsSenderId?: string | null;
  /** New secret values keyed by field name. Empty string clears the field. */
  secrets?: Partial<Record<keyof PlatformSecrets, string>>;
}

function normalizeOptional(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
}

export async function updatePlatformConfig(
  patch: PlatformConfigPatch,
): Promise<PlatformConfigPublic> {
  const existing = await prisma.platformConfig.findUnique({ where: { id: SINGLETON_ID } });

  // Merge secret patches into the existing decrypted blob: empty string ⇒ clear.
  let nextSecrets: PlatformSecrets = readSecrets(existing?.encryptedSecrets ?? null);
  if (patch.secrets) {
    const updated: PlatformSecrets = { ...nextSecrets };
    for (const [k, v] of Object.entries(patch.secrets)) {
      const key = k as keyof PlatformSecrets;
      if (typeof v !== 'string') continue;
      const trimmed = v.trim();
      if (trimmed === '') delete updated[key];
      else updated[key] = trimmed;
    }
    nextSecrets = updated;
  }
  const hasAnySecret = Object.values(nextSecrets).some(
    (v) => typeof v === 'string' && v.length > 0,
  );
  const encryptedSecrets = hasAnySecret ? encryptCredentials(nextSecrets) : null;

  const data = {
    metaAppId: normalizeOptional(patch.metaAppId),
    metaGraphVersion: normalizeOptional(patch.metaGraphVersion),
    publicWebhookUrl: normalizeOptional(patch.publicWebhookUrl),
    geminiModel: normalizeOptional(patch.geminiModel),
    aiProvider: normalizeOptional(patch.aiProvider),
    bulkSmsSenderId: normalizeOptional(patch.bulkSmsSenderId),
    encryptedSecrets,
  };

  // Drop undefined keys so prisma doesn't unset unrelated columns.
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) update[k] = v;
  }

  if (existing) {
    await prisma.platformConfig.update({ where: { id: SINGLETON_ID }, data: update });
  } else {
    await prisma.platformConfig.create({
      data: { id: SINGLETON_ID, ...update },
    });
  }

  invalidatePlatformConfigCache();
  return readPublicPlatformConfig();
}
