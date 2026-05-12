-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('ai', 'manual');

-- CreateEnum
CREATE TYPE "AiToneProfile" AS ENUM ('formal_apu', 'casual_apu', 'friendly_bhai');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('in_stock', 'low_stock', 'out_of_stock');

-- CreateEnum
CREATE TYPE "ConversationChannel" AS ENUM ('messenger', 'instagram', 'whatsapp');

-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM ('new_inquiry', 'product_discussion', 'order_collection', 'order_confirmed', 'human_handoff', 'closed');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageSource" AS ENUM ('customer', 'ai', 'seller');

-- CreateEnum
CREATE TYPE "HandoffReason" AS ENUM ('low_confidence', 'catalog_miss', 'abuse', 'discount_request', 'off_topic', 'llm_error', 'manual');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'pending_approval';
ALTER TYPE "OrderStatus" ADD VALUE 'approved';
ALTER TYPE "OrderStatus" ADD VALUE 'rejected';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "messengerPsid" VARCHAR(100),
ADD COLUMN     "storeId" UUID,
ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "aiExtractedData" JSONB,
ADD COLUMN     "approvedAt" TIMESTAMPTZ,
ADD COLUMN     "approvedByUserId" UUID,
ADD COLUMN     "conversationId" UUID,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "aiDisclosureFooterEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiToneProfile" "AiToneProfile" NOT NULL DEFAULT 'formal_apu',
ADD COLUMN     "deliveryChargeInsideDhakaCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryChargeOutsideDhakaCents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "fbConnectedAt" TIMESTAMPTZ,
ADD COLUMN     "fbPageAccessTokenEncrypted" TEXT,
ADD COLUMN     "fbPageId" VARCHAR(64),
ADD COLUMN     "fbPageName" TEXT,
ADD COLUMN     "pickupAddress" JSONB,
ADD COLUMN     "returnPolicyText" TEXT,
ADD COLUMN     "workingHoursEnd" VARCHAR(5),
ADD COLUMN     "workingHoursStart" VARCHAR(5);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "basePriceCents" BIGINT NOT NULL,
    "floorPriceCents" BIGINT NOT NULL,
    "variants" JSONB NOT NULL DEFAULT '[]',
    "stockStatus" "StockStatus" NOT NULL DEFAULT 'in_stock',
    "photoUrl" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "channel" "ConversationChannel" NOT NULL DEFAULT 'messenger',
    "state" "ConversationState" NOT NULL DEFAULT 'new_inquiry',
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageAt" TIMESTAMPTZ,
    "lastAiActionAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversationId" UUID NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "source" "MessageSource" NOT NULL,
    "text" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "aiIntentClassification" JSONB,
    "aiConfidence" DOUBLE PRECISION,
    "aiRawPayload" JSONB,
    "metaMessageId" VARCHAR(255),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_handoff_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversationId" UUID NOT NULL,
    "reason" "HandoffReason" NOT NULL,
    "detail" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedByUserId" UUID,
    "resolvedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_handoff_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_storeId_idx" ON "products"("storeId");

-- CreateIndex
CREATE INDEX "conversations_storeId_lastMessageAt_idx" ON "conversations"("storeId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_storeId_customerId_channel_key" ON "conversations"("storeId", "customerId", "channel");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_metaMessageId_idx" ON "messages"("metaMessageId");

-- CreateIndex
CREATE INDEX "ai_handoff_flags_conversationId_idx" ON "ai_handoff_flags"("conversationId");

-- CreateIndex
CREATE INDEX "ai_handoff_flags_resolved_idx" ON "ai_handoff_flags"("resolved");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "customers_storeId_messengerPsid_key" ON "customers"("storeId", "messengerPsid");

-- CreateIndex
CREATE INDEX "orders_storeId_status_idx" ON "orders"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stores_fbPageId_key" ON "stores"("fbPageId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_handoff_flags" ADD CONSTRAINT "ai_handoff_flags_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

