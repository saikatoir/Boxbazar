export type SubscriptionTier =
  | 'trial'
  | 'starter'
  | 'pro'
  | 'read_only'
  | 'suspended';

export type SubscriptionStatus = 'active' | 'grace' | 'canceled';

export interface AuthUser {
  id: string;
  phone: string;
  name: string;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
}

export interface JwtPayload {
  sub: string;
  phone: string;
  subscriptionTier: SubscriptionTier;
  iat?: number;
  exp?: number;
}
