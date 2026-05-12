-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('trial', 'starter', 'pro', 'read_only', 'suspended');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'grace', 'canceled');

-- CreateEnum
CREATE TYPE "CourierName" AS ENUM ('steadfast', 'pathao', 'redx');

-- CreateEnum
CREATE TYPE "CourierAccountStatus" AS ENUM ('active', 'invalid', 'rate_limited');

-- CreateEnum
CREATE TYPE "RiskBand" AS ENUM ('green', 'yellow', 'red');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'placed', 'shipped', 'delivered', 'returned', 'canceled');

-- CreateEnum
CREATE TYPE "ConsignmentEventSource" AS ENUM ('webhook', 'poll');

-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('sslcommerz', 'shurjopay');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('starter', 'pro');

-- CreateEnum
CREATE TYPE "SubscriptionLifecycleStatus" AS ENUM ('trial', 'trial_expired', 'read_only', 'active', 'grace', 'canceled', 'suspended');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('matched', 'unmatched', 'disputed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" VARCHAR(15) NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "lastLoginAt" TIMESTAMPTZ,
    "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'trial',
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fbPageUrl" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "courier" "CourierName" NOT NULL,
    "encryptedCredentials" JSONB NOT NULL,
    "status" "CourierAccountStatus" NOT NULL DEFAULT 'active',
    "lastBalanceCheckedAt" TIMESTAMPTZ,
    "lastBalanceAmount" INTEGER,

    CONSTRAINT "courier_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "phone" VARCHAR(15) NOT NULL,
    "name" TEXT NOT NULL,
    "addressHistory" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_signals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customerId" UUID NOT NULL,
    "courier" "CourierName" NOT NULL,
    "totalOrders" INTEGER NOT NULL,
    "successfulOrders" INTEGER NOT NULL,
    "canceledOrders" INTEGER NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskBand" "RiskBand" NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMPTZ NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "fraud_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'draft',
    "subtotalCents" BIGINT NOT NULL,
    "deliveryCents" BIGINT NOT NULL,
    "codCents" BIGINT NOT NULL,
    "items" JSONB NOT NULL,
    "notes" TEXT,
    "sourceChat" TEXT,
    "parsedConfidence" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderId" UUID NOT NULL,
    "courier" "CourierName" NOT NULL,
    "consignmentId" VARCHAR(100) NOT NULL,
    "trackingCode" VARCHAR(100) NOT NULL,
    "invoiceId" VARCHAR(100) NOT NULL,
    "currentStatus" VARCHAR(100) NOT NULL,
    "labelPdfUrl" TEXT,
    "rawCreationResponse" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consignmentId" UUID NOT NULL,
    "status" VARCHAR(100) NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "source" "ConsignmentEventSource" NOT NULL,

    CONSTRAINT "courier_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "courier" "CourierName" NOT NULL,
    "payoutId" VARCHAR(100) NOT NULL,
    "totalAmountCents" BIGINT NOT NULL,
    "bankReference" TEXT,
    "paidAt" TIMESTAMPTZ NOT NULL,
    "rawPayload" JSONB NOT NULL,

    CONSTRAINT "payout_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_line_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payoutBatchId" UUID NOT NULL,
    "consignmentId" UUID,
    "amountCents" BIGINT NOT NULL,
    "matchStatus" "MatchStatus" NOT NULL DEFAULT 'unmatched',
    "rawPayload" JSONB NOT NULL,

    CONSTRAINT "payout_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "status" "SubscriptionLifecycleStatus" NOT NULL DEFAULT 'trial',
    "plan" "SubscriptionPlan",
    "trialStartedAt" TIMESTAMPTZ NOT NULL,
    "trialEndsAt" TIMESTAMPTZ NOT NULL,
    "trialExtensionCount" INTEGER NOT NULL DEFAULT 0,
    "readOnlyUntil" TIMESTAMPTZ,
    "suspendedAt" TIMESTAMPTZ,
    "dataPurgeAt" TIMESTAMPTZ,
    "subscriptionStartedAt" TIMESTAMPTZ,
    "currentPeriodEnd" TIMESTAMPTZ,
    "canceledAt" TIMESTAMPTZ,
    "paymentGateway" "PaymentGateway",
    "gatewaySubscriptionId" TEXT,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_parse_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "rawText" TEXT NOT NULL,
    "extractedData" JSONB NOT NULL,
    "confidence" JSONB NOT NULL,
    "userEdits" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_parse_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "consignments_orderId_key" ON "consignments"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "consignments_invoiceId_key" ON "consignments"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_key" ON "subscriptions"("userId");

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_accounts" ADD CONSTRAINT "courier_accounts_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_signals" ADD CONSTRAINT "fraud_signals_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignments" ADD CONSTRAINT "consignments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_events" ADD CONSTRAINT "courier_events_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "consignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_line_items" ADD CONSTRAINT "payout_line_items_payoutBatchId_fkey" FOREIGN KEY ("payoutBatchId") REFERENCES "payout_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_line_items" ADD CONSTRAINT "payout_line_items_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "consignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_parse_attempts" ADD CONSTRAINT "chat_parse_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
