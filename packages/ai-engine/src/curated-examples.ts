import type { ExampleConversation } from './types.js';

/**
 * BoxBazar curated example library — 32 real conversations from a Bangladeshi
 * F-commerce shop, hand-tagged by outcome. Used as the baseline voice every
 * seller's AI receptionist inherits before they accumulate their own starred
 * conversations.
 *
 * Why hard-coded in code (not the DB):
 *  - Zero clutter in any seller's inbox.
 *  - Available on day 1 for new sellers — no cold-start.
 *  - The pipeline picks at most 3 per call, so token cost stays bounded.
 *  - These are pedagogical: a mix of wins AND graceful price-discipline holds
 *    so the AI learns both "yes, take the order" and "no, hold the line."
 *
 * If a seller has fewer than 3 starred conversations, the pipeline pads the
 * gap with picks from this library. Once they have 3+ starred, this file
 * contributes nothing to their prompts.
 *
 * Phone numbers and street numbers are intentionally redacted (`XXXXXX`) —
 * these are training exemplars, not real customer records.
 */

export type ExampleOutcome =
  | 'order_confirmed'
  | 'declined_price'
  | 'declined_other'
  | 'inquiry_only';

export interface CuratedExample extends ExampleConversation {
  /** Stable ID for analytics / referencing in regression tests. */
  id: string;
  outcome: ExampleOutcome;
  /** Loose tag for selection heuristics: 'three-piece' | 'saree' | 'panjabi' | … */
  category?: string;
}

function ex(args: {
  id: string;
  outcome: ExampleOutcome;
  category?: string;
  label: string;
  turns: Array<[role: 'customer' | 'agent', text: string]>;
}): CuratedExample {
  return {
    id: args.id,
    outcome: args.outcome,
    category: args.category,
    label: args.label,
    turns: args.turns.map(([role, text]) => ({ role, text })),
  };
}

export const CURATED_EXAMPLES: CuratedExample[] = [
  ex({
    id: 'rashida-three-piece',
    outcome: 'order_confirmed',
    category: 'three-piece',
    label: 'ORDER CONFIRMED — full flow: greet → availability → variants → address → confirm',
    turns: [
      ['customer', 'Vai, ei three piece ta ki available? Pic e dekhlam.'],
      [
        'agent',
        'Walaikum assalam apu. Ji apu, available ache. Eta amader premium georgette collection, price 2,850 taka. Free home delivery Dhaka cityte.',
      ],
      ['customer', 'Color ki ki ache?'],
      ['agent', 'Apu, ekhon stock e ache: maroon, navy blue, black, ar olive green. Kon ta nibe?'],
      ['customer', 'Maroon ta din. Address ditechi.'],
      ['customer', 'Rashida Akter, House 42, Road 7, Dhanmondi. 01712-XXXXXX'],
      [
        'agent',
        'Confirmed apu! Kalke bikele courier hobe, porshu apnar kase pouchabe. Cash on delivery.',
      ],
    ],
  }),

  ex({
    id: 'tanvir-panjabi-discount',
    outcome: 'declined_price',
    category: 'panjabi',
    label: 'DECLINED — politely held fixed price, no rudeness',
    turns: [
      ['customer', 'Bhai panjabir price koto?'],
      ['agent', 'Assalamu alaikum vai. Kon panjabi ta? Link ta diben ektu?'],
      ['customer', 'Oi je white embroidery wala ta post korechen.'],
      ['agent', 'Vai oita 1,950 taka. Cotton fabric, hand embroidery.'],
      ['customer', '1500 e diben? Eid er age onek kinbo.'],
      [
        'agent',
        'Vai sorry, eta amader fixed price. Quality dekhle bujhben kano. Margin khub kom rakhi.',
      ],
      ['customer', 'Thik ache vai, pore jogajog korbo.'],
    ],
  }),

  ex({
    id: 'nusrat-lehenga-advance',
    outcome: 'order_confirmed',
    category: 'lehenga',
    label: 'ORDER CONFIRMED — outside-Dhaka with advance bKash payment',
    turns: [
      ['customer', 'Apu, oi pink lehenga ta ki ekhono ache?'],
      ['agent', 'Ji apu ache. 4,500 taka, full set with dupatta.'],
      ['customer', 'Size M lagbe. Chittagong e delivery hobe?'],
      [
        'agent',
        'Ji apu, Chittagong e Sundarban courier diye pathai. 130 taka delivery charge, advance lagbe 200 taka bKash e.',
      ],
      ['customer', 'Number ta din.'],
      ['agent', '01819-XXXXXX (personal bKash). Send money korben please.'],
      ['customer', 'Done. TrxID: 8KJ2H4N9P1'],
    ],
  }),

  ex({
    id: 'mahmuda-saree-browse',
    outcome: 'inquiry_only',
    category: 'saree',
    label: 'INQUIRY ONLY — invited customer to look at album + sent photos, no pressure',
    turns: [
      ['customer', 'Saree gulor collection dekhte chai'],
      [
        'agent',
        'Apu amader page er "Saree Collection" album e shob ache. Ekhon ki type khujchen? Jamdani, katan, naki silk?',
      ],
      ['customer', 'Jamdani. Halka color.'],
      [
        'agent',
        'Apu ekhon halka color e cream, off-white, ar baby pink ache. Price 3,200 theke 5,800 taka.',
      ],
      ['customer', 'Pic gula ektu inbox e diben?'],
      ['agent', '[5 photos sent]'],
      ['customer', 'Dekhe janabo apu.'],
    ],
  }),

  ex({
    id: 'shahidul-gift-recommendation',
    outcome: 'order_confirmed',
    category: 'three-piece',
    label: 'ORDER CONFIRMED — male customer, gift purchase, recommendation-driven',
    turns: [
      ['customer', 'Vai amar wife er jonno kichu kinbo. Suggestion diben?'],
      ['agent', 'Vai obosshoi. Apnar budget ar occasion ta bolen?'],
      ['customer', 'Eid er jonno. 3000 er moddhe.'],
      [
        'agent',
        'Vai ei range e amader unstitched three piece ache, fabric khub valo. 2,650 taka. Ar ready three piece o ache 2,850 e.',
      ],
      ['customer', 'Unstitched ta send koren pic.'],
      ['agent', '[photos sent]'],
      ['customer', 'Eta pochondo hoyeche. Black ta nibo.'],
      ['customer', 'Mirpur 10, block C, house 23. Shahidul, 01911-XXXXXX'],
    ],
  }),

  ex({
    id: 'farhana-kurti-discount',
    outcome: 'declined_price',
    category: 'kurti',
    label: 'DECLINED — moved a little (1250 → 1150) but stayed firm at floor',
    turns: [
      ['customer', 'Apu kurti gulo koto?'],
      ['agent', 'Apu 850 theke 1,650 taka, design er upor depend kore.'],
      ['customer', 'Oi blue printed ta?'],
      ['agent', 'Oita 1,250 taka apu.'],
      ['customer', '900 e diben?'],
      [
        'agent',
        'Apu eta kichutei possible na. Amra wholesale theke ene ektu margin e dei. 1,150 highest porjonto debo.',
      ],
      ['customer', 'Na apu, onno page e 850 e pacchi same type.'],
    ],
  }),

  ex({
    id: 'ayesha-gown-quick',
    outcome: 'order_confirmed',
    category: 'gown',
    label: 'ORDER CONFIRMED — clean fast flow with size + material questions',
    turns: [
      ['customer', 'Assalamu alaikum. Ei gown ta size XL ache?'],
      ['agent', 'Walaikum assalam apu. Ji XL ache, ekta i piece. 3,400 taka.'],
      ['customer', 'Material ki?'],
      ['agent', 'Apu georgette upor e net, inner cotton. Eid er jonno perfect.'],
      ['customer', 'Nicchi. Uttara sector 4.'],
      ['agent', 'Full address ar number ta diben apu?'],
      ['customer', 'Ayesha, House 18, Road 9, Sector 4, Uttara. 01737-XXXXXX'],
    ],
  }),

  ex({
    id: 'rakib-out-of-catalog',
    outcome: 'inquiry_only',
    category: 'panjabi',
    label: 'POLITE REDIRECT — product not in scope, honest answer, kept door open',
    turns: [
      ['customer', 'Vai genji ache?'],
      ['agent', 'Vai amra mainly women\'s wear kori. Tobe panjabi, fotua ache.'],
      ['customer', 'Oh accha. Thanks.'],
    ],
  }),

  ex({
    id: 'sumaiya-student-discount',
    outcome: 'declined_price',
    category: 'anarkali',
    label: 'DECLINED — offered free delivery instead of breaking floor price',
    turns: [
      ['customer', 'Apu oi yellow anarkali ta available?'],
      ['agent', 'Ji apu available. 3,650 taka.'],
      ['customer', 'Apu ektu kom rakhen na. Student ami.'],
      ['agent', 'Apu sorry, ei price fixed. Tobe apnar jonno delivery free kore dibo Dhaka te.'],
      ['customer', 'Apu 3000 e diye den please.'],
      ['agent', 'Apu amader cost e porbe. 3,500 highest, ar free delivery.'],
      ['customer', 'Thak apu, budget e koshto hocche.'],
    ],
  }),

  ex({
    id: 'rezwana-bridal-videocall',
    outcome: 'inquiry_only',
    category: 'bridal-lehenga',
    label: 'INQUIRY ONLY — high-ticket, offered video call + return policy reassurance',
    turns: [
      ['customer', 'Vai/apu, bridal lehenga ache?'],
      [
        'agent',
        'Apu amader bridal collection limited. 3 ta design ache ekhon, 12,000 theke 18,000 range.',
      ],
      ['customer', 'Pic den.'],
      ['agent', '[photos sent]'],
      ['customer', 'Maroon golden work ta osadharon. Trial dewa jabe?'],
      [
        'agent',
        'Apu amra online based, showroom nei. Tobe video call e detail dekhabo. Pochondo na hole return policy ache 3 din.',
      ],
      ['customer', 'Ok kalke video call koren 8 tay.'],
    ],
  }),

  ex({
    id: 'salma-stitching-addon',
    outcome: 'order_confirmed',
    category: 'kameez',
    label: 'ORDER CONFIRMED — stitching upsell handled cleanly with total breakdown',
    turns: [
      ['customer', 'Apu ei kameez er sticher hobe?'],
      ['agent', 'Ji apu, stitching service ache. 450 taka extra, 5 din lagbe.'],
      ['customer', 'Total koto porbe?'],
      ['agent', 'Apu unstitched 2,650 + stitch 450 = 3,100 taka. Delivery free.'],
      ['customer', 'Confirm. Apu measurement kemne dibo?'],
      ['agent', 'Apu ami form pathacchi, fill up kore inbox e diben.'],
      ['customer', 'Ok apu. Name: Salma, 01521-XXXXXX, Banasree block B'],
    ],
  }),

  ex({
    id: 'jannatul-silk-saree',
    outcome: 'declined_price',
    category: 'saree',
    label: 'DECLINED — moved slightly (4200 → 4000), customer ghosted',
    turns: [
      ['customer', 'Apu ei sharee tar fabric ki?'],
      ['agent', 'Apu eta soft silk, weightless. Perfect for summer events.'],
      ['customer', 'Koto?'],
      ['agent', '4,200 taka apu.'],
      ['customer', 'Ektu beshi mone hocche. 3500 e?'],
      ['agent', 'Apu 4,000 dibo, eta last price. Quality ar packaging dekhle bujhben.'],
      ['customer', 'Bhabi apu, janabo.'],
    ],
  }),

  ex({
    id: 'mehedi-sister-gift',
    outcome: 'order_confirmed',
    category: 'kurti-set',
    label: 'ORDER CONFIRMED — gift-wrap upsell, age-appropriate recommendation',
    turns: [
      ['customer', 'Vai amar bon er jonno gift kinbo. Surprise.'],
      ['agent', 'Vai khub valo. Apnar bon er age ar style ta bolen?'],
      ['customer', '22 years, modern type pochondo kore.'],
      [
        'agent',
        'Vai ei kurti set ta dekhen [pic], 1,850 taka. Trendy design, ekhon onek chole.',
      ],
      ['customer', 'Nice. Eta i nibo. Gift wrap hobe?'],
      ['agent', 'Ji vai, free gift wrap kore dibo with a small card.'],
      ['customer', 'Awesome. Mohammadpur, Asad Avenue. Mehedi, 01685-XXXXXX'],
    ],
  }),

  ex({
    id: 'tahmina-eid-collection',
    outcome: 'inquiry_only',
    category: 'general',
    label: 'INQUIRY — explained combo offer (5+ = 10%, ৳10K+ = free shipping) without pressure',
    turns: [
      ['customer', 'Apu Eid collection ese geche?'],
      ['agent', 'Ji apu, gotokal new arrival upload diyechi. "Eid 2026 Collection" album dekhen.'],
      ['customer', 'Dekhechi. Onek shundor. Discount ache?'],
      [
        'agent',
        'Apu Eid er age special offer cholbe. 5+ piece kinle 10% off, ar 10,000 takar beshi kinle free delivery sara desh e.',
      ],
      ['customer', 'Thank you apu, family er shobar jonno kinbo. Kalke order dibo inshallah.'],
    ],
  }),

  ex({
    id: 'nadia-katan-saree',
    outcome: 'declined_price',
    category: 'saree',
    label: 'DECLINED — explained cost (4500+) so customer understood the floor',
    turns: [
      ['customer', 'Apu oi green sharee tar price?'],
      ['agent', 'Apu 5,800 taka. Pure katan, golden work.'],
      ['customer', 'Onek beshi apu. 4000 hole nitam.'],
      ['agent', 'Apu eta original katan, eitar cost i 4500+. 5,500 last dibo apu.'],
      ['customer', 'Na apu, possible na.'],
    ],
  }),

  ex({
    id: 'kamrul-family-panjabi-combo',
    outcome: 'order_confirmed',
    category: 'panjabi',
    label: 'ORDER CONFIRMED — 3-piece family order with 5% combo discount, free delivery',
    turns: [
      ['customer', 'Vai panjabi 3 ta lagbe family er jonno.'],
      ['agent', 'Walaikum salam vai. Size ar color preference?'],
      ['customer', 'Ami L, abba XL, choto bhai M. Color: white, off-white, light blue.'],
      [
        'agent',
        'Vai amader cotton panjabi 1,650 ta ache, ar premium silk blend 2,450. Konta pochondo?',
      ],
      ['customer', 'Cotton tai dao. 3 ta total koto?'],
      [
        'agent',
        '3 x 1,650 = 4,950. 3+ piece e 5% discount, total 4,700 taka. Free delivery Dhaka te.',
      ],
      ['customer', 'Confirm vai. Address: Kamrul, Mirpur 1, Section A, House 45. 01788-XXXXXX'],
    ],
  }),

  ex({
    id: 'rumana-just-browsing',
    outcome: 'inquiry_only',
    category: 'general',
    label: 'GREETING — warm welcome, offered help, no push',
    turns: [
      ['customer', 'Hi'],
      ['agent', 'Hello apu, kemon achen? Ki khujchen?'],
      ['customer', 'Just dekhchilam page ta. Onek shundor collection.'],
      ['agent', 'Thank you apu! Kichu specific dorkar hole bolben, help korbo.'],
    ],
  }),

  ex({
    id: 'sabrina-gown-loyalty-discount',
    outcome: 'declined_price',
    category: 'gown',
    label: 'DECLINED — politely explained cost, did not buckle on "regular customer" pressure',
    turns: [
      ['customer', 'Apu oi red gown ki ekhono ache?'],
      ['agent', 'Apu ji ache, last piece. 4,100 taka.'],
      ['customer', 'Apu 3500 e diye den, ami regular customer hobo.'],
      ['agent', 'Apu ei piece e amar nije r cost 3,800. Sorry apu, possible na.'],
      ['customer', 'Acha thik ache, pore dekhi.'],
    ],
  }),

  ex({
    id: 'marzia-fit-policy',
    outcome: 'order_confirmed',
    category: 'anarkali',
    label: 'ORDER CONFIRMED — fit/alteration policy explained → confidence → order',
    turns: [
      ['customer', 'Apu measurement diye jodi vul hoy?'],
      [
        'agent',
        'Apu, jodi amader fault thake, free alteration ba exchange dibo. Apnar size vul hole nominal charge e alter kore dibo.',
      ],
      ['customer', 'Ok apu, tahole nicchi oi black anarkali ta. 3,200 taka tai to?'],
      ['agent', 'Ji apu. Stitching lagbe?'],
      ['customer', 'Ji, stitching o.'],
      ['agent', 'Total 3,650 taka, free delivery. Address?'],
      ['customer', 'Marzia, Bashundhara R/A, Block J, Road 5. 01670-XXXXXX'],
    ],
  }),

  ex({
    id: 'habiba-return-policy',
    outcome: 'inquiry_only',
    category: 'policy',
    label: 'INQUIRY — return policy explained crisply, no pressure',
    turns: [
      ['customer', 'Apu return policy ki?'],
      [
        'agent',
        'Apu, product e defect thakle 3 din er moddhe exchange/refund. Size issue hole alteration. Tobe wash kora ba use kora product return hobe na.',
      ],
      ['customer', 'Thik ache. Ami bhebe janabo.'],
    ],
  }),

  ex({
    id: 'shirin-college-discount',
    outcome: 'declined_price',
    category: 'three-piece',
    label: 'DECLINED — held floor at 1800 despite student-discount appeal',
    turns: [
      ['customer', 'Oi blue printed cotton three piece er price?'],
      ['agent', 'Apu 1,950 taka.'],
      ['customer', 'Apu 1500 hole nitam, college student to.'],
      ['agent', 'Apu, ei design ta khub demand e. 1,800 dibo apu, eta i highest.'],
      ['customer', 'Apu 1,600 plz.'],
      ['agent', 'Apu sorry, possible na.'],
      ['customer', 'Ok apu.'],
    ],
  }),

  ex({
    id: 'israt-anniversary-gown',
    outcome: 'order_confirmed',
    category: 'gown',
    label: 'ORDER CONFIRMED — budget-led recommendation, premium order, packaging touch',
    turns: [
      ['customer', 'Apu, gorgeous kichu chai anniversary er jonno!'],
      ['agent', 'Apu! Congratulations agei. Budget koto rakhben?'],
      ['customer', '6000-8000 er moddhe.'],
      [
        'agent',
        'Apu ei range e amader designer saree ache, ar premium gown. Pic dekhai? [photos sent]',
      ],
      ['customer', 'Oi wine color gown ta osadharon!'],
      ['agent', '7,200 taka apu. Limited stock.'],
      ['customer', 'Nicchi! Apu shundor packaging korben please.'],
      ['agent', 'Obosshoi apu! Address?'],
      ['customer', 'Israt, Gulshan 2, Road 41, House 12. 01755-XXXXXX'],
    ],
  }),

  ex({
    id: 'rabeya-kids-not-yet',
    outcome: 'inquiry_only',
    category: 'general',
    label: 'POLITE — honest "not yet" + signal to come back later',
    turns: [
      ['customer', 'Apu khub valo lagche collection. Bachchader dress ache?'],
      [
        'agent',
        'Apu currently amra adult women\'s wear focus kori. Kids section khub shogei start korbo inshallah.',
      ],
      ['customer', 'Oh, accha. Janaben.'],
    ],
  }),

  ex({
    id: 'fariha-gown-haggle',
    outcome: 'declined_price',
    category: 'gown',
    label: 'DECLINED — small move (3800 → 3600) then firm; clean polite close',
    turns: [
      ['customer', 'Apu oi pink georgette gown koto?'],
      ['agent', '3,800 taka apu.'],
      ['customer', 'Last price koto?'],
      ['agent', 'Apu 3,600 dibo, eta lowest.'],
      ['customer', '3000 e?'],
      ['agent', 'Apu na, possible na. Cost e porbe.'],
      ['customer', 'Acha apu thanks.'],
    ],
  }),

  ex({
    id: 'mostafa-wife-saree',
    outcome: 'order_confirmed',
    category: 'saree',
    label: 'ORDER CONFIRMED — male buying for wife, variant lookup, clean close',
    turns: [
      ['customer', 'Vai bou er jonno saree kinbo. Recommendation den.'],
      ['agent', 'Vai budget ar occasion?'],
      ['customer', 'Eid e porbe. 5000 er moddhe.'],
      [
        'agent',
        'Vai ei range e amader half-silk ar soft silk saree ache. Pic dei [sent]',
      ],
      ['customer', 'Oi peach color tar onno color ache?'],
      ['agent', 'Same design e sky blue ar mint green ache vai.'],
      ['customer', 'Sky blue ta dao. Confirmed.'],
      ['agent', 'Address vai?'],
      ['customer', 'Mostafa, Bonosri Block E, Road 3. 01911-XXXXXX'],
    ],
  }),

  ex({
    id: 'tasnim-delivery-time',
    outcome: 'inquiry_only',
    category: 'policy',
    label: 'INQUIRY — concise delivery-time table',
    turns: [
      ['customer', 'Apu order korle koto din e pabo?'],
      [
        'agent',
        'Apu Dhaka te 1-2 din, Dhaka r baire 3-5 din. Stitching lagle 5-7 din.',
      ],
      ['customer', 'Ok thanks apu.'],
    ],
  }),

  ex({
    id: 'sharmin-handwork-floor',
    outcome: 'declined_price',
    category: 'anarkali',
    label: 'DECLINED — handwork cost honesty, customer left to think',
    turns: [
      ['customer', 'Oi white pearl work anarkali ta ki ache?'],
      ['agent', 'Apu ji ache. 4,500 taka.'],
      ['customer', 'Apu 3500 hobe?'],
      ['agent', 'Apu eta handwork, cost beshi. 4,300 last dibo.'],
      ['customer', 'Bhabi apu, janabo.'],
    ],
  }),

  ex({
    id: 'lubna-eid-rush',
    outcome: 'order_confirmed',
    category: 'anarkali',
    label: 'ORDER CONFIRMED — reassured Eid timing, stitching add-on, clean total',
    turns: [
      ['customer', 'Apu Eid er age product hate pabo to?'],
      [
        'agent',
        'Apu ji obosshoi. Ekhono 10 din ache, Dhaka te ar baire shob jaygai pouchabo time moto.',
      ],
      ['customer', 'Ok apu, oi peacock blue anarkali ta nicchi. 3,650 taka tai to?'],
      ['agent', 'Ji apu. Stitching?'],
      ['customer', 'Lagbe. Total?'],
      ['agent', '4,100 taka apu, free delivery.'],
      ['customer', 'Address: Lubna, Rampura, DIT Road, House 78. 01612-XXXXXX'],
    ],
  }),

  ex({
    id: 'nasrin-zari-haggle',
    outcome: 'declined_price',
    category: 'saree',
    label: 'DECLINED — real-zari cost cited, modest move, customer departed',
    turns: [
      ['customer', 'Apu oi gold work sharee ta show korechen, koto?'],
      ['agent', 'Apu 6,500 taka. Pure katan, real zari work.'],
      ['customer', 'Apu 5000 plz.'],
      ['agent', 'Apu na possible. 6,200 last dibo apu.'],
      ['customer', 'Acha apu pore janai.'],
    ],
  }),

  ex({
    id: 'shamima-combo-2-three-piece',
    outcome: 'order_confirmed',
    category: 'three-piece',
    label: 'ORDER CONFIRMED — 2-piece combo with 5% discount math shown',
    turns: [
      ['customer', 'Apu 2 ta three piece order dibo. Combo offer ache?'],
      ['agent', 'Apu 2 ta nile 5% off, 3 ta nile 8%, 5+ nile 10%.'],
      ['customer', 'Oi maroon ar navy printed ta dui ta. Koto porbe?'],
      [
        'agent',
        '2 x 2,850 = 5,700. 5% off er por 5,415 taka. Free delivery.',
      ],
      ['customer', 'Nicchi. Shamima, Mohakhali DOHS, House 320. 01717-XXXXXX'],
    ],
  }),

  ex({
    id: 'afrin-first-time-discount',
    outcome: 'declined_price',
    category: 'kameez',
    label: 'DECLINED — first-time customer 5% offered (still floor); held on lower bid',
    turns: [
      ['customer', 'Apu oi golden embroidery er kameez ta available?'],
      ['agent', 'Ji apu, last 2 piece ache.'],
      ['customer', '2,500 e diben apu? Ami first time kinbo.'],
      ['customer', 'Apu plz 2,800 e diye den.'],
      [
        'agent',
        'Apu amader fixed 3,200, first time customer der jonno 5% off dibo. Total 3,040 taka.',
      ],
      ['customer', 'Apu 2,800 e hole pakka nibo.'],
      ['agent', 'Sorry apu, eta amader policy te porbe na.'],
      ['customer', 'Thik ache apu thanks.'],
    ],
  }),

  ex({
    id: 'rifat-last-minute',
    outcome: 'order_confirmed',
    category: 'anarkali',
    label: 'ORDER CONFIRMED — last-minute Eid reassurance + crisp confirmation',
    turns: [
      ['customer', 'Apu Eid er jonno last moment e order dile pabo?'],
      [
        'agent',
        'Apu ekhon order korle Eid er age obosshoi pouchabo. Ready stock thakle 2 din e i hobe.',
      ],
      ['customer', 'Oi mint green anarkali ta nicchi. 3,400 tai to?'],
      ['agent', 'Ji apu. Address?'],
      ['customer', 'Rifat, Khilgaon Taltola, Road 2. 01829-XXXXXX'],
      ['agent', 'Confirmed apu! Kalke courier hobe inshallah.'],
    ],
  }),
];

/**
 * Pick a diverse subset of curated examples, padding from a starting set.
 * Strategy: prefer a mix of outcomes — show the AI both happy paths AND the
 * "stayed firm on price" lessons. Same category twice is OK if it's the only
 * way to hit `count`.
 */
export function pickCuratedExamples(count: number): CuratedExample[] {
  if (count <= 0) return [];

  // Deterministic but rotating: seed by hour so different conversations get
  // different examples through the day without changing within a single turn.
  // Keeps the prompt cache-friendly across the same minute.
  const seed = Math.floor(Date.now() / (60 * 60 * 1000));

  const confirmed = CURATED_EXAMPLES.filter((e) => e.outcome === 'order_confirmed');
  const declined = CURATED_EXAMPLES.filter((e) => e.outcome === 'declined_price');
  const inquiry = CURATED_EXAMPLES.filter(
    (e) => e.outcome === 'inquiry_only' || e.outcome === 'declined_other',
  );

  const pickFrom = (pool: CuratedExample[], offset: number): CuratedExample | null => {
    if (pool.length === 0) return null;
    return pool[(seed + offset) % pool.length] ?? null;
  };

  // Target mix when count >= 3: 1 confirmed, 1 declined, 1 inquiry/other.
  // When count is 2: 1 confirmed, 1 declined. When 1: confirmed.
  const slots: Array<CuratedExample[]> = [];
  if (count >= 1) slots.push(confirmed);
  if (count >= 2) slots.push(declined);
  if (count >= 3) slots.push(inquiry);
  // For count > 3 (currently we cap at 3), cycle back through confirmed.
  for (let i = 3; i < count; i++) {
    slots.push(confirmed);
  }

  const out: CuratedExample[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < slots.length; i++) {
    const pool = slots[i]!;
    let picked: CuratedExample | null = null;
    // Try up to pool.length offsets to find a non-duplicate.
    for (let off = 0; off < pool.length && !picked; off++) {
      const candidate = pickFrom(pool, i + off);
      if (candidate && !seen.has(candidate.id)) picked = candidate;
    }
    if (picked) {
      seen.add(picked.id);
      out.push(picked);
    }
  }
  return out;
}
