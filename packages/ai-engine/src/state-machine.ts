import type { ConversationState, CustomerIntent } from './types.js';

export interface StateInputs {
  current: ConversationState;
  intent: CustomerIntent;
  /** A complete, customer-confirmed order was produced this turn. */
  orderConfirmed: boolean;
  /** This turn is being handed off to the seller. */
  handoff: boolean;
  /** Customer signalled the conversation is over (thanks/bye). */
  closing?: boolean;
}

/**
 * Allowed transitions:
 *   new_inquiry → product_discussion → order_collection → order_confirmed
 *   (any) → human_handoff
 *   (any) → closed
 */
export function nextConversationState(i: StateInputs): ConversationState {
  if (i.handoff) return 'human_handoff';
  if (i.orderConfirmed) return 'order_confirmed';
  if (i.closing) return 'closed';

  switch (i.intent) {
    case 'order_intent':
      return 'order_collection';
    case 'product_inquiry':
    case 'price_inquiry':
    case 'delivery_question':
      // don't regress out of an active order collection
      return i.current === 'order_collection' || i.current === 'order_confirmed'
        ? i.current
        : 'product_discussion';
    case 'complaint':
      return i.current === 'new_inquiry' ? 'product_discussion' : i.current;
    case 'greeting':
    case 'small_talk':
    case 'unclear':
    default:
      // stay where we are, but if we were closed and they came back, reopen
      return i.current === 'closed' ? 'new_inquiry' : i.current;
  }
}
