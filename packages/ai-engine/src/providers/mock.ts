import type { LlmProvider, LlmRequest, LlmResponse } from '../types.js';
import { STAGE1_MARKER, STAGE2_MARKER } from '../prompts.js';

/**
 * Deterministic, offline LLM stand-in. Good enough to exercise the full
 * receptionist pipeline (intent → reply → order extraction) in dev and tests
 * without a Gemini key. Heuristic, not smart — don't ship it to production.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';

  // eslint-disable-next-line @typescript-eslint/require-await
  async generate(req: LlmRequest): Promise<LlmResponse> {
    const convo = [...(req.history ?? []).map((h) => h.text), req.user].join('\n').toLowerCase();
    if (req.system.includes(STAGE1_MARKER)) {
      return this.classify(req.user, convo);
    }
    if (req.system.includes(STAGE2_MARKER)) {
      return this.respond(req, convo);
    }
    return { text: JSON.stringify({ reply: 'ok' }), raw: { mock: true } };
  }

  private wrap(obj: unknown): LlmResponse {
    const text = JSON.stringify(obj);
    return { text, raw: { mock: true, parsed: obj }, usage: { inputTokens: 0, outputTokens: 0 } };
  }

  private classify(userBlock: string, convo: string): LlmResponse {
    const msg = (userBlock.match(/"""([\s\S]*?)"""/)?.[1] ?? userBlock).toLowerCase();
    const has = (...needles: string[]): boolean => needles.some((n) => msg.includes(n));
    const ABUSE = ['fuck', 'khankir', 'magi', 'chutmarani', 'shuorer', 'kuttar bachcha', 'bastard'];
    if (has(...ABUSE)) return this.wrap({ intent: 'abuse', confidence: 0.96, requiresCatalog: false });
    if (/01[3-9]\d{8}/.test(convo) || has('order', 'nibo', 'kinbo', 'kine nibo', 'confirm', 'address', 'thikana'))
      return this.wrap({ intent: 'order_intent', confidence: 0.92, requiresCatalog: true });
    if (has('delivery', 'courier', 'charge', 'kobe pabo', 'koto din', 'return', 'ferot'))
      return this.wrap({ intent: 'delivery_question', confidence: 0.88, requiresCatalog: false });
    if (has('price', 'dam', 'koto', 'koto taka', 'koto tk'))
      return this.wrap({ intent: 'price_inquiry', confidence: 0.85, requiresCatalog: true });
    if (has('size', 'color', 'colour', 'stock', 'ache', 'available', 'photo', 'chobi'))
      return this.wrap({ intent: 'product_inquiry', confidence: 0.85, requiresCatalog: true });
    if (has('assalam', 'salam', 'hello', 'hi ', 'hii', 'hey', 'নমস্কার', 'নমস্কার'))
      return this.wrap({ intent: 'greeting', confidence: 0.9, requiresCatalog: false });
    if (has('kemon achen', 'kemon acho', 'how are you'))
      return this.wrap({ intent: 'small_talk', confidence: 0.8, requiresCatalog: false });
    if (msg.trim().length < 3) return this.wrap({ intent: 'unclear', confidence: 0.3, requiresCatalog: false });
    return this.wrap({ intent: 'product_inquiry', confidence: 0.65, requiresCatalog: true });
  }

  private respond(req: LlmRequest, convo: string): LlmResponse {
    // Pull catalog rows ( "  N. id=<id> | "Name" | price ৳X | ..." ) out of the system prompt.
    const catalog: Array<{ id: string; name: string; price: number }> = [];
    const re = /id=([^\s|]+)\s*\|\s*"([^"]+)"\s*\|\s*price ৳([\d.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(req.system)) !== null) {
      catalog.push({ id: m[1]!, name: m[2]!, price: Math.round(parseFloat(m[3]!) * 100) });
    }
    const insideCharge = Math.round(parseFloat(req.system.match(/৳([\d.]+) inside Dhaka/)?.[1] ?? '0') * 100);
    const outsideCharge = Math.round(parseFloat(req.system.match(/৳([\d.]+) outside Dhaka/)?.[1] ?? '0') * 100);

    const inOrderMode = req.system.includes('ORDER COLLECTION:');
    const phone = convo.match(/01[3-9]\d{8}/)?.[0] ?? null;
    const mentioned = catalog.filter((c) => convo.includes(c.name.toLowerCase()));
    const insideDhaka = /\bdhaka\b|ঢাকা/.test(convo);
    const confirmed = /\b(confirm|confirmed|ok|okay|ji|jee|hae|haa|han|accha|thik ache|done|nilam)\b/.test(convo);

    if (!inOrderMode && mentioned.length === 0) {
      return this.wrap({
        reply: 'Ji apu, bolun — kon product ta dekhte chacchen?',
        catalogMiss: false,
        discountRequested: /discount|kom|komano|kombe|kom hobe/.test(convo),
        offTopic: false,
        needsHuman: false,
        orderDraft: null,
      });
    }

    const items = mentioned.map((c) => ({ productName: c.name, variant: null, quantity: 1 }));
    const subtotal = mentioned.reduce((s, c) => s + c.price, 0);
    const total = items.length ? subtotal + (insideDhaka ? insideCharge : outsideCharge) : null;
    const nameGuess =
      convo.match(/(?:name|nam)[:\- ]+([a-zঀ-৿ ]{2,30})/)?.[1]?.trim() ?? null;
    const addrGuess =
      convo.match(/(?:address|thikana)[:\- ]+([^\n]{4,120})/)?.[1]?.trim() ??
      (insideDhaka ? convo.match(/[^\n]*dhaka[^\n]*/)?.[0]?.trim() ?? null : null);

    return this.wrap({
      reply: items.length
        ? confirmed && phone && nameGuess && addrGuess
          ? `Order ta nilam apu 🙏 total ৳${((total ?? 0) / 100).toFixed(0)}. owner confirm korbe shiggiri.`
          : `Apu, order ta nite — apnar nam, mobile number, ar full address ta din please.${total ? ` (total hobe ৳${(total / 100).toFixed(0)})` : ''}`
        : 'Apu, kon product ta order korte chan, bolun?',
      catalogMiss: false,
      discountRequested: /discount|kom hobe|komano jabe/.test(convo),
      offTopic: false,
      needsHuman: false,
      orderDraft: {
        recipientName: nameGuess,
        phone,
        address: addrGuess,
        items,
        stateTotalCents: total,
        customerConfirmedTotal: !!(confirmed && phone && nameGuess && addrGuess && items.length),
        notes: null,
      },
    });
  }
}
