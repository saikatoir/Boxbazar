/**
 * Re-exports PrismaClient from the Prisma-generated client.
 *
 * IMPORTANT: Run `pnpm --filter @fcommerce/db generate` before importing
 * this package. The generated client is created by `prisma generate` and
 * is not committed to source control.
 */
export { PrismaClient, Prisma } from '../generated/client/index.js';
export type {
  User,
  Store,
  CourierAccount,
  Customer,
  FraudSignal,
  Order,
  Consignment,
  CourierEvent,
  PayoutBatch,
  PayoutLineItem,
  Subscription,
  ChatParseAttempt,
  Product,
  Conversation,
  Message,
  AiHandoffFlag,
  PlatformConfig,
  SubscriptionTier,
  SubscriptionStatus,
  CourierName,
  CourierAccountStatus,
  RiskBand,
  OrderStatus,
  OrderSource,
  ConsignmentEventSource,
  PaymentGateway,
  SubscriptionPlan,
  SubscriptionLifecycleStatus,
  MatchStatus,
  AiToneProfile,
  StockStatus,
  ConversationChannel,
  ConversationState,
  MessageDirection,
  MessageSource,
  HandoffReason,
} from '../generated/client/index.js';
