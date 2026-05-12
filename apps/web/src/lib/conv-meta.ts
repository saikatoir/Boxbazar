export type ConvState =
  | 'new_inquiry'
  | 'product_discussion'
  | 'order_collection'
  | 'order_confirmed'
  | 'human_handoff'
  | 'closed';

export const STATE_META: Record<ConvState, { label: string; cls: string }> = {
  new_inquiry: { label: 'নতুন', cls: 'bg-blue-50 text-blue-700' },
  product_discussion: { label: 'আলোচনায়', cls: 'bg-indigo-50 text-indigo-700' },
  order_collection: { label: 'অর্ডার নিচ্ছে', cls: 'bg-amber-50 text-amber-700' },
  order_confirmed: { label: 'অর্ডার কনফার্ম', cls: 'bg-green-50 text-green-700' },
  human_handoff: { label: 'আপনার নজরে', cls: 'bg-red-50 text-red-700' },
  closed: { label: 'বন্ধ', cls: 'bg-gray-100 text-gray-500' },
};

export const HANDOFF_LABELS: Record<string, string> = {
  low_confidence: 'AI নিশ্চিত নয়',
  catalog_miss: 'ক্যাটালগে নেই এমন প্রোডাক্ট',
  abuse: 'আপত্তিকর বার্তা',
  discount_request: 'ডিসকাউন্ট চাইছে',
  off_topic: 'প্রসঙ্গ-বহির্ভূত',
  llm_error: 'AI ত্রুটি',
  manual: 'ম্যানুয়াল',
};

export const ORDER_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: 'approval দরকার', cls: 'bg-amber-50 text-amber-700' },
  approved: { label: 'approved', cls: 'bg-green-50 text-green-700' },
  rejected: { label: 'বাতিল', cls: 'bg-red-50 text-red-600' },
  draft: { label: 'খসড়া', cls: 'bg-gray-100 text-gray-600' },
  placed: { label: 'নতুন', cls: 'bg-blue-50 text-blue-700' },
  shipped: { label: 'কুরিয়ারে', cls: 'bg-amber-50 text-amber-700' },
  delivered: { label: 'ডেলিভারড', cls: 'bg-green-50 text-green-700' },
  returned: { label: 'ফেরত', cls: 'bg-red-50 text-red-700' },
  canceled: { label: 'বাতিল', cls: 'bg-gray-100 text-gray-500' },
};

export function timeAgoBn(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'এইমাত্র';
  if (m < 60) return `${m} মিনিট আগে`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ঘন্টা আগে`;
  return new Date(iso).toLocaleDateString('bn-BD');
}
