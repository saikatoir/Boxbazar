-- CreateTable
CREATE TABLE "platform_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "metaAppId" TEXT,
    "metaGraphVersion" TEXT,
    "publicWebhookUrl" TEXT,
    "geminiModel" TEXT,
    "aiProvider" TEXT,
    "bulkSmsSenderId" TEXT,
    "encryptedSecrets" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);
