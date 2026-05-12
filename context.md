# Context: BoxBazar — AI Receptionist & F-Commerce Operations SaaS

## What This Document Is

This is the complete build context for **BoxBazar**, a SaaS product for Bangladeshi Facebook/Instagram/WhatsApp sellers. The headline feature is an AI receptionist that converses with the seller's customers, captures orders, and routes everything to an admin panel where the seller approves and dispatches with one click. It captures the product thesis, target user, feature scope, architecture, infrastructure, costs, pitch playbook, and the full week-by-week implementation roadmap. A developer (human or AI) should be able to read this file and start building without needing further high-level context.

**Build sequence: Web app first (v1.0), then Flutter mobile app (v1.1).** The web app is the primary deliverable and the surface where sellers run their daily operations. The Flutter mobile app follows once the web product has paying users and a stable feature set.

---

## 1. Product Overview

### What BoxBazar is

A SaaS application — web first, Flutter mobile second — where the seller connects her Facebook Page (and later WhatsApp) and BoxBazar's AI receptionist takes over the front line of customer conversation. The AI replies to product inquiries from the seller's catalog, negotiates basic terms, collects order details conversationally, and pushes structured orders to the seller's admin panel. The seller reviews, approves, and dispatches with one click via integrated couriers (Steadfast, Pathao, RedX).

### Why it exists

Bangladesh has 300,000+ active F-commerce sellers running businesses from home through Facebook pages, Instagram, and WhatsApp DMs. Their #1 daily pain is **conversation overload** — every customer message must be replied to within minutes or the sale is lost, and a Tier B seller doing 60-150 orders/month is fielding hundreds of DMs across her channels. Add to that: manual order entry, courier dispatch chaos, COD reconciliation done in handwritten notebooks, and 15-25% revenue loss to fraud customers and undelivered parcels. No tooling exists for this segment that addresses the conversation layer *and* the operations layer in one product. Jatri pivoted away from the operations space. ShopUp pivoted to wholesale. Existing BD chatbot tools (Jadubot, Bangla Chatbot, Choukosh, Zaman IT) do keyword-based flows but cannot actually take orders conversationally. The gap is real and large.

### Core differentiator

BoxBazar is the only product in BD that combines:
1. A genuinely conversational AI receptionist (LLM-powered, not keyword flows) that takes orders end-to-end
2. Multi-courier booking (Steadfast, Pathao, RedX) with AI-pre-filled details
3. Customer fraud detection across all three couriers
4. Automated COD reconciliation
5. All in Bangla, with human handoff baked in so the seller never feels out of control

15-day free trial (no card required) converts to a paid subscription.

### Why web-first, mobile-second

1. **Sellers manage the admin panel at a desk.** Approving AI-captured orders, editing pickup addresses, reviewing courier dispatches — these are desk activities. Web is the right surface.
2. **Iteration speed.** Web apps deploy in minutes. Mobile apps require Play Store review. Building web-first means we ship daily during beta and learn faster.
3. **No Play Store gatekeeper risk.** Google sometimes rejects new B2B apps for vague reasons. Web doesn't depend on a gatekeeper.

The Flutter mobile app follows once web has paying users and a stable feature set. Sellers will install mobile as a complement — for on-the-go order approval and human-takeover notifications — not as a replacement.

---

## 2. Target User (Locked Persona)

**Tier B seller (the entire MVP is for her):**

- 22-38-year-old woman running an F-commerce business from home
- Processes 30-150 orders per month
- Categories: clothing, cosmetics, home food, kids products, jewellery
- Sells through Facebook page + Instagram + WhatsApp DMs
- Uses Steadfast, Pathao Courier, and/or RedX for delivery
- 90%+ of orders are Cash on Delivery
- Owns an Android phone + has access to a laptop or tablet at home for "real work"
- Does daily order management at a desk; uses phone for quick checks while out
- Speaks Bangla; comfortable with Banglish (Bangla typed in English script)
- Has been burned by failed payment systems, half-broken software, or fraud customers before
- Will trust a real-named Bangladeshi founder over a corporate brand

**Not the target for v1:**
- Hobbyist sellers under 30 orders/month (won't pay)
- Full-time brands over 200 orders/month already on Shopify (different needs, longer sales cycle)

---

## 3. Feature Scope — v1.0 MVP

Five features. AI receptionist is the headline; the other four are the operations layer that makes the AI useful.

### Feature 1 (HEADLINE): AI Receptionist

The core conversational engine. Replies to customer messages on Messenger (and WhatsApp in v1.2 via BSP), takes orders conversationally, hands off to the seller when needed.

**Setup flow (one-time per seller):**
- Seller connects her Facebook Page via Facebook Login (3 clicks)
- BoxBazar subscribes to her Page's `messages` webhook
- Seller fills in her product catalog: name, price, available variants/sizes/colors, current stock status, optional photo
- Seller picks AI tone: "Formal apu" / "Casual apu" / "Friendly bhai" — affects vocabulary and Bangla register
- Seller sets default delivery charge inside Dhaka / outside Dhaka, return policy, working hours

**Conversation flow (runtime, every customer message):**
- Customer DMs seller's FB Page → Meta sends `messages` webhook to BoxBazar
- BoxBazar AI loads: (a) seller's product catalog, (b) conversation history with this customer, (c) seller's tone profile
- AI generates a reply via Gemini 2.5 Flash, grounded strictly in the product catalog
- AI calls Meta Send API to reply within 2-3 seconds
- All messages logged for audit and seller review

**Order capture flow:**
- When AI detects buying intent ("kine nibo", "ami nibo", "order korte chai"), it switches into order-collection mode
- Conversationally collects: recipient name, phone number, full address (with auto-suggested division/district/thana), product and variant selection, special notes
- Confirms total (product price + delivery charge) with customer before saving
- Pushes a draft order to BoxBazar admin panel with status `pending_approval`
- Sends the seller a notification: "New order from AI — needs your approval"

**Human handoff (critical for trust):**
- AI sends `[Human takeover →]` flag to seller's BoxBazar dashboard whenever it cannot answer confidently
- Seller can jump into any conversation at any time from the dashboard
- Customer never sees that they were talking to an AI vs. a human — seamless from their side
- Seller can disable AI per-conversation with one click ("I'll handle this one")
- Seller can disable AI globally during sensitive periods (Eid sales, controversies, etc.)

**AI guardrails:**
- AI never makes commitments beyond what the catalog supports
- AI never confirms delivery dates beyond the seller's configured promises
- AI cannot lower prices below seller-configured floor (no rogue discounts)
- AI defaults to "let me check with the seller" when uncertain rather than hallucinating
- All AI-generated text passes a confidence check; low-confidence replies are queued for human review instead of auto-sent

**Channels:**
- **v1.0:** Facebook Messenger only (free via Meta's webhook + Send API)
- **v1.1:** Add Instagram DM (same Meta infrastructure)
- **v1.2:** Add WhatsApp Business via BSP (paid per conversation)

### Feature 2: Admin Panel for Order Approval & Courier Dispatch

The seller's daily work surface.

**What it shows:**
- Inbox: all active conversations across connected channels, threaded by customer
- Orders tab with three sub-tabs:
 - **Pending Approval** (AI-captured, awaiting seller approval)
 - **Awaiting Dispatch** (approved, ready for courier booking)
 - **In Transit / Completed** (already dispatched)

**Order approval card:**
Each pending order shows:
- Customer details (name, phone, address) — all pre-filled by AI
- Product + variant + quantity — pre-filled
- Total amount (product + delivery) — pre-filled
- Conversation excerpt that produced the order — clickable to view full chat
- Fraud check badge (🟢/🟡/🔴) auto-run on the phone number
- Pickup address dropdown — defaults to seller's saved address, editable per order
- Courier selector (Steadfast / Pathao / RedX) with each courier's current balance, charge for this destination, and area success rate
- **One-click "Approve & Book Courier"** button → creates consignment, prints label

**Order rejection:**
- Seller can reject an AI-captured order with one click
- Optional reason ("customer changed mind", "out of stock", "fraud", "duplicate") — feeds back into AI training
- Customer is auto-notified by AI with a polite message

### Feature 3: Multi-Courier Booking

Pre-integrated with Steadfast (Packzy), Pathao Courier, RedX. Each courier wrapped behind a unified `CourierAdapter` interface so the seller never sees courier-specific terminology.

**Per consignment:**
- AI pre-fills all required courier fields from order data
- Address-to-zone mapping handled internally (each courier has different location IDs)
- COD amount auto-calculated (product price + delivery charge)
- Label PDF auto-generated, downloadable + shareable to WhatsApp
- Webhook receivers for status updates from each courier
- Polling fallback every 4 hours for missed webhooks

### Feature 4: Customer Fraud Check

Auto-runs when AI captures a phone number during order conversation. Sources for v1: native fraud check endpoints from Steadfast, Pathao, RedX. Aggregated, cached 24h.

Risk score with traffic-light:
- 🟢 Green: < 15 (reliable customer)
- 🟡 Yellow: 15-40 (caution)
- 🔴 Red: > 40 (high return rate)

Shown on the order approval card. Never blocks approval — always shows warning + lets seller override.

### Feature 5: COD Reconciliation

Daily cron pulls courier payment histories. Matches payout line items to consignments. Three tabs in dashboard:
- **Pending**: not yet delivered
- **Awaiting Payout**: delivered, COD not yet received from courier
- **Paid**: matched and closed

Auto-flags mismatches: "3 parcels show as delivered but not in payout — contact courier."

### What's Explicitly Cut From v1 (do not build)

- WhatsApp integration (v1.2 — requires BSP, separate scope)
- Storefront builder
- Direct prepayment via payment gateway (90% of orders are COD; trust SSLCommerz only for subscription billing)
- Multi-language beyond Bangla + English
- Inventory barcode scanning
- Daraz / Shopify integration
- Advanced analytics or reports beyond simple counts
- AI-generated marketing posts or proactive customer outreach (compliance landmines)

---

## 4. Architecture

### Stack Decision Summary

| Layer | v1.0 (Web) | v1.1 (Mobile) |
|---|---|---|
| Frontend | Next.js 14+ (React, TypeScript) | Flutter 3.x (Dart) |
| Backend | Node.js + Fastify (TypeScript) | *Same backend, shared by both* |
| Database | PostgreSQL 16 (self-hosted on Hetzner) | *Same* |
| Cache + Queue | Redis 7 (self-hosted) + BullMQ | *Same* |
| Object storage | Cloudflare R2 | *Same* |
| Auth | Custom phone + OTP via SMS, JWT | *Same* |
| LLM | Gemini 2.5 Flash | *Same* |
| Messaging | Meta Messenger webhook + Send API | *Same* |

**One backend serves both clients.** Web and mobile both consume the same REST API. Build the API once, build two thin frontends against it.

### Web Frontend Stack (v1.0 — ships first)

- **Framework:** Next.js 14+ with App Router
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS
- **UI components:** Radix UI primitives, shadcn/ui patterns, custom Bangla-typography components
- **Forms:** React Hook Form + Zod validation
- **State:** TanStack Query (server state) + Zustand (UI state)
- **Realtime:** Server-Sent Events for the inbox + order approval queue (new AI conversations and orders appear without refresh)
- **Bangla font:** Noto Sans Bengali, self-hosted
- **Hosting:** Vercel Pro ($20/mo) or self-host on Hetzner alongside backend

### Backend Stack (shared by web v1 and mobile v1.1)

- **Runtime:** Node.js 20 LTS
- **Framework:** Fastify
- **Language:** TypeScript (strict mode)
- **ORM:** Prisma
- **Database:** PostgreSQL 16
- **Cache + Queue:** Redis 7 with BullMQ
- **Object storage:** Cloudflare R2 (S3-compatible)
- **Auth:** Custom phone + OTP via SMS, JWT (15-min access + 30-day refresh)
- **API style:** REST + Zod schemas + OpenAPI spec generated for Dart client in v1.1
- **Webhook receivers:** Meta Messenger webhooks + courier webhooks, both with signature validation

### Infrastructure

- **Compute:** Hetzner Cloud, Singapore region (sub-100ms latency to Dhaka)
- **App server:** CPX21 (2 vCPU / 4GB RAM) in build phase; scale to CPX31 (4 vCPU / 8GB) at launch; possibly CPX41 by 500 sellers
- **Database:** Self-hosted Postgres on a second CPX21; migrate to managed at scale
- **Redis:** Self-hosted alongside Postgres in early phase
- **CDN + DNS + WAF:** Cloudflare (free tier)
- **Object storage:** Cloudflare R2 (zero egress, critical for label PDFs and conversation logs)
- **Email transactional:** Resend (free tier 3K/month)
- **SMS:** BulkSMSBD primary, SSL Wireless fallback
- **Error monitoring:** Sentry (free tier)
- **Status page:** Better Stack free tier
- **CI/CD:** GitHub Actions

### Repository Structure

```
boxbazar/
├── apps/
│   ├── web/              # Next.js — v1.0
│   ├── api/              # Fastify backend — shared
│   └── mobile/           # Flutter — v1.1, reserved directory
├── packages/
│   ├── db/               # Prisma schema + migrations
│   ├── ai-engine/        # Conversation + order extraction logic
│   ├── courier-sdk/      # Steadfast/Pathao/RedX adapters
│   ├── meta-sdk/         # Messenger webhook + Send API wrapper
│   └── shared/           # Shared TypeScript types
```

### v1.1 Mobile App (Flutter — Future)

To be built after web v1.0 has paying users. Stack:
- Flutter 3.x with Dart
- Riverpod for state management
- `dio` for API client (generated from OpenAPI spec)
- `flutter_secure_storage` for auth tokens
- `firebase_messaging` for FCM push notifications
- Standard Material 3 design with Bangla typography (Noto Sans Bengali)

Build target: Android 8.0+ (covers 95%+ of BD users). APK size under 25 MB. iOS deferred.

Mobile-specific concerns: test on Symphony/Walton entry-level (2GB RAM); battery optimization whitelist instructions for Xiaomi/Realme/Oppo during onboarding; deep links `boxbazar://order/12345` for push notification taps.

### What v1.0 Must Build To Be Mobile-Ready

The backend must avoid web-specific assumptions:
- All session state in JWT (no cookie-only sessions)
- All endpoints return JSON only
- File uploads via signed R2 URLs
- OpenAPI spec maintained from week 1
- Push notification payloads channel-agnostic (web push + FCM use same shape)

---

## 5. AI Engine Design (Critical Section)

This is the headline feature. It deserves explicit design rather than handwaving.

### Conversation State Machine

Each customer-seller conversation lives in one of these states:

```
new_inquiry → product_discussion → order_collection → order_confirmed → human_handoff (any state)
                                                                       → closed
```

State transitions are recorded; the AI uses current state + history to choose its next response style.

### Per-Conversation Context Loaded For Every AI Call

- The seller's full product catalog (compressed to a structured JSON the LLM can reason over)
- The last 20 messages in this specific conversation (longer history available on demand)
- The customer's profile if known: previous orders, fraud signals, name corrections
- The seller's tone profile + policies (delivery charge, return policy, working hours)
- Current conversation state

### Prompt Architecture

Two-stage LLM call per incoming customer message:

**Stage 1 — Intent + Confidence Classification (small, fast):**
- Inputs: incoming message + last 5 messages
- Output: JSON with `intent` (`greeting | product_inquiry | price_inquiry | order_intent | delivery_question | complaint | small_talk | unclear`), `confidence` (0-1), `requires_catalog` (bool)
- Model: Gemini 2.5 Flash with strict JSON mode

**Stage 2 — Response Generation (only if confidence > 0.6):**
- Inputs: full context bundle, intent classification
- Output: reply text + extracted entities (product_id, quantity, customer name, phone, address)
- Model: Gemini 2.5 Flash
- If `confidence < 0.6`: flag for human review, send polite "let me check with the seller" message

### Order Extraction

When intent = `order_intent`, AI enters structured collection mode. Five required fields:
1. Recipient name
2. Phone number (validated by regex `01[3-9]\d{8}`)
3. Full address (validated against district/upazila dictionary)
4. Product + variant
5. Confirmation of total amount

AI fills fields conversationally over multiple turns. It does NOT submit an order until all five are confirmed and customer has explicitly agreed to the total. The final confirmation message is templated: "Apu, total ৳X (product ৳Y + delivery ৳Z). Confirm korbo?"

### Fallback Behaviors

| Trigger | AI behavior |
|---|---|
| Customer asks about product not in catalog | "Apu, eta amader catalog e ekhon nei. Owner ke check kore janabo." + flag seller |
| Customer asks for discount below floor price | "Apu, ei product er price fixed. Discount manager er sathe direct kotha bolte hobe." + flag seller |
| Customer asks question outside commerce ("how are you?") | Polite brief reply, redirect to products: "ji apu valo. Apnar kichu lagbe?" |
| Customer message in language AI cannot understand | "Apu English/Bangla te likhle help korte parbo, na holey owner ke pathai" + flag seller |
| Customer aggressive/abusive | AI does not respond at all. Flags seller immediately. Logs message for moderation. |
| Customer asks about another seller's product | "Apu, amra X bechi, eta amader na. Onyo page e check korben please." |
| LLM API timeout/error | Send templated "amader sathe ektu later kotha bolun, technical issue" + flag seller |

### Logging and Audit

Every AI conversation logged in full. Seller can review any past conversation. Audit trail per message: incoming text, AI's stage-1 classification, AI's stage-2 reply, send timestamp, customer reply timestamp.

Used for: seller trust, debugging hallucinations, dataset for fine-tuning later, dispute resolution if customer claims AI promised something.

### LLM Cost Math

Gemini 2.5 Flash pricing: $0.15 per 1M input tokens, $0.60 per 1M output tokens.

Per conversation (avg 12 messages back-and-forth):
- Input: ~6,000 tokens (context bundle + history) × 12 = 72K tokens
- Output: ~150 tokens × 12 = 1.8K tokens
- Cost per conversation: 72K × $0.15/1M + 1.8K × $0.60/1M = **~$0.012**

At 500 sellers × 20 conversations/day × 30 days = 300,000 conversations/month × $0.012 = **~$3,600/month at peak load.**

This is sustainable. At 100 sellers (realistic month 6 target) it's ~$720/month.

Caching strategy to reduce cost:
- Cache catalog tokens per seller (changes rarely) — saves ~40% on input tokens
- Cache common Q&A patterns ("delivery koto somoy?" → templated reply from seller config) — saves an estimated 25% of LLM calls entirely

Realistic month-6 cost: **~$400-500/month for AI at 100 active sellers.**

---

## 6. Database Schema (Core Tables)

```
User (seller)
 ├─ id, phone (unique), name, email (optional)
 ├─ created_at, updated_at, last_login_at
 ├─ subscription_tier (trial | starter | pro | read_only | suspended)
 └─ subscription_status (active | grace | canceled)

Store
 ├─ id, user_id (FK), name, category
 ├─ fb_page_id, fb_page_access_token (encrypted)
 ├─ ai_tone_profile (formal_apu | casual_apu | friendly_bhai | custom)
 ├─ pickup_address (JSONB)
 ├─ delivery_charge_inside_dhaka_cents, delivery_charge_outside_dhaka_cents
 ├─ working_hours_start, working_hours_end
 ├─ return_policy_text
 ├─ ai_enabled (bool, global kill switch per store)
 └─ created_at

Product
 ├─ id, store_id (FK), name, description
 ├─ base_price_cents, floor_price_cents (AI cannot discount below)
 ├─ variants (JSONB)
 ├─ stock_status (in_stock | low_stock | out_of_stock)
 ├─ photo_url (R2)
 ├─ keywords (text[] for AI matching)
 └─ active (bool)

CourierAccount
 ├─ id, store_id (FK), courier (steadfast | pathao | redx)
 ├─ encrypted_credentials (JSONB)
 ├─ status (active | invalid | rate_limited)
 └─ last_balance_checked_at, last_balance_cents

Customer
 ├─ id, store_id (FK), phone (normalized), name (best-known)
 ├─ messenger_psid (Meta page-scoped ID, unique per page)
 ├─ address_history (JSONB array)
 └─ created_at

Conversation
 ├─ id, store_id (FK), customer_id (FK)
 ├─ channel (messenger | instagram | whatsapp)
 ├─ state (new_inquiry | product_discussion | order_collection | order_confirmed | human_handoff | closed)
 ├─ ai_enabled (bool, can be disabled per-conversation)
 ├─ last_message_at, last_ai_action_at
 └─ created_at

Message
 ├─ id, conversation_id (FK)
 ├─ direction (inbound | outbound)
 ├─ source (customer | ai | seller)
 ├─ text, attachments (JSONB)
 ├─ ai_intent_classification (JSONB, null for non-AI messages)
 ├─ ai_confidence (float, null for non-AI)
 ├─ ai_raw_payload (JSONB, full LLM response for debugging)
 ├─ meta_message_id (Meta's message ID for echo deduplication)
 └─ created_at

Order
 ├─ id, store_id (FK), customer_id (FK), conversation_id (FK, nullable)
 ├─ source (ai | manual)
 ├─ status (pending_approval | approved | shipped | delivered | returned | canceled | rejected)
 ├─ items (JSONB)
 ├─ subtotal_cents, delivery_cents, cod_cents
 ├─ pickup_address_override (JSONB, nullable - falls back to store.pickup_address)
 ├─ notes
 ├─ ai_extracted_data (JSONB)
 ├─ approved_at, approved_by_user_id
 ├─ rejection_reason
 └─ created_at

Consignment
 ├─ id, order_id (FK), courier, consignment_id
 ├─ tracking_code, invoice_id
 ├─ current_status, label_pdf_url (R2)
 ├─ raw_creation_response (JSONB)
 └─ created_at

CourierEvent
 ├─ id, consignment_id (FK), status, occurred_at
 ├─ raw_payload (JSONB), source (webhook | poll)

FraudSignal
 ├─ id, customer_id (FK), courier
 ├─ total_orders, successful_orders, canceled_orders
 ├─ risk_score (0-100), risk_band (green | yellow | red)
 ├─ raw_payload (JSONB)
 └─ fetched_at, expires_at (24h TTL)

PayoutBatch
 ├─ id, store_id (FK), courier, payout_id
 ├─ total_amount_cents, bank_reference, paid_at
 └─ raw_payload (JSONB)

PayoutLineItem
 ├─ id, payout_batch_id (FK), consignment_id (FK, nullable)
 ├─ amount_cents, match_status (matched | unmatched | disputed)
 └─ raw_payload (JSONB)

Subscription
 ├─ id, user_id (FK)
 ├─ status (trial | trial_expired | read_only | active | grace | canceled | suspended)
 ├─ plan (starter | pro | null during trial)
 ├─ trial_started_at, trial_ends_at, trial_extension_count
 ├─ read_only_until, suspended_at, data_purge_at
 ├─ subscription_started_at, current_period_end, canceled_at
 ├─ payment_gateway (sslcommerz | shurjopay | null)
 └─ gateway_subscription_id

AiHandoffFlag
 ├─ id, conversation_id (FK), reason (low_confidence | catalog_miss | abuse | discount_request | manual)
 ├─ resolved (bool), resolved_by_user_id, resolved_at
 └─ created_at
```

**Schema rules — non-negotiable:**

1. All money in `bigint` cents (BDT × 100). Never floats.
2. All timestamps in UTC `timestamptz`. Display in Asia/Dhaka.
3. Every external API response stored as raw `JSONB` separately from parsed fields (Meta payloads, courier payloads, LLM payloads).
4. UTF-8 throughout. Test Banglish + Bangla inputs in fuzzy search via `pg_trgm`.
5. Encrypt all access tokens (Meta page tokens, courier credentials) with libsodium symmetric encryption.

---

## 7. Implementation Roadmap (16 Weeks to v1.0)

The AI receptionist requires more engineering than the previous "manual paste" plan. Budget 16 weeks honestly, not 13.

### Phase 0 — Decisions & Setup (Week 0, ~5 days)

- Lock the stack (final)
- Set up monorepo (pnpm workspaces or Turborepo)
- Three environments: `dev`, `staging`, `production`
- GitHub Actions CI: lint, typecheck, test on PR; deploy on merge
- **Critical Day-1 applications (long-pole):**
 - Meta for Developers — create app, request `pages_messaging`, `pages_messaging_subscriptions` permissions (for beta testing these work without App Review; full public launch needs review at week 14)
 - Steadfast API access: 3-5 days
 - Pathao API access: 1-2 weeks
 - RedX API access: 2-3 weeks
 - SSLCommerz or ShurjoPay merchant account: 2-4 weeks
- Register `boxbazar.com` and `boxbazar.com.bd`
- Provision Hetzner VPS (app + DB) in Singapore
- Set up Sentry, Resend, Cloudflare
- Register company (sole proprietorship; private ltd later)
- OpenAPI spec scaffold from day 1
- Get Gemini API key + billing setup

### Phase 1 — Foundation Sprint (Weeks 1-2)

Goal: a logged-in user creates a store, connects an FB Page, sees an empty dashboard.

**Week 1:**
- Prisma schema for User, Store, Session, Subscription
- Phone + OTP auth (BulkSMSBD primary, SSL Wireless fallback)
- libsodium encryption for sensitive credentials
- Bangla typography in Next.js (Noto Sans Bengali self-hosted)
- Landing page + signup/login flow

**Week 2:**
- Store creation wizard
- Facebook Login integration (request `pages_show_list` + `pages_messaging` scopes)
- Save Page Access Token (encrypted) on connect
- Webhook subscription: tell Meta we want `messages` and `messaging_postbacks` events for the connected page
- Webhook receiver scaffold (signature validation, async queue dispatch via BullMQ)
- Internal admin panel for founder (search sellers, debug, intervene)

### Phase 2 — Product Catalog (Week 3)

- Product CRUD: name, price, variants, photo upload to R2, stock status, keywords
- Bulk import via CSV/Excel paste-in
- Catalog completeness score (UI nudge to fill more fields before enabling AI)

### Phase 3 — AI Engine Core (Weeks 4-7) — THE BIG ONE

**Week 4: Two-stage prompt + scaffolding**
- `packages/ai-engine` module
- Stage 1 (intent classification) — Gemini 2.5 Flash with JSON mode
- Stage 2 (response generation) — Gemini 2.5 Flash with context bundle
- Logging: every LLM call's raw payload stored to `Message.ai_raw_payload`
- Conversation state machine implementation

**Week 5: Catalog grounding + tone profile**
- Catalog → LLM context serializer
- Tone profile injection (formal_apu / casual_apu / friendly_bhai)
- Working hours respect (AI pauses outside seller's hours)

**Week 6: Order extraction loop**
- Conversational field collection
- Phone regex validation post-LLM
- Address dictionary lookup
- Total confirmation message before saving
- Draft order push to admin panel

**Week 7: Guardrails + fallbacks**
- All fallback behaviors from Section 5
- Confidence threshold gate (< 0.6 → human review)
- AI per-conversation disable
- AI global disable per store
- Abuse detection (flag, don't reply)
- Off-topic redirect

### Phase 4 — Messenger Integration End-to-End (Week 8)

- Production webhook deployment (HTTPS, < 5s response, signature validated)
- Send API wrapper with retry + rate limit handling
- Echo deduplication (Meta sometimes sends our own outbound messages back)
- 24-hour messaging window respect (defensive, even though we always reply inbound)
- Read receipts + typing indicators (AI types like a human)
- Conversation list UI in admin dashboard with realtime SSE updates

### Phase 5 — Courier Integration (Weeks 9-10)

**Week 9: Steadfast + adapter pattern**
- `CourierAdapter` interface in `packages/courier-sdk`
- Steadfast implementation: create_order, webhooks, get_balance, fraud_check
- Label PDF generation via Puppeteer, stored on R2
- Order approval card UI

**Week 10: Pathao + RedX**
- Pathao: OAuth2 token caching in Redis, refresh logic
- RedX: extra validation due to inconsistent responses
- Address-to-zone mapping cron (refresh daily)
- Courier picker UI with balance/charge/area success rate

### Phase 6 — Fraud Check (Week 11)

- Aggregator: parallel calls to Steadfast/Pathao/RedX fraud endpoints with 3s timeout
- Risk score calculation, traffic-light mapping
- 24h Redis cache by phone
- Auto-fires when AI captures a phone number
- Display on order approval card
- Per-tier rate limits
- Anti-scraping: pattern detection on sequential phone numbers

### Phase 7 — COD Reconciliation (Week 12)

- Daily 6 AM cron pulls payouts from all couriers
- Match payout line items to consignments by tracking code
- Reconciliation dashboard with three tabs
- Daily 7 AM seller summary
- Manual reconciliation override

### Phase 8 — Trial & Subscription Billing (Week 13)

**Trial mechanics:**
- 15-day trial auto-starts on signup, full Starter features, no card required
- State machine: `trial_active → trial_ending_soon → trial_expired (read-only 7 days) → suspended (90-day retention)`
- Day 13/14 reminders (push + email + WhatsApp template)
- Day 15: flip to read-only mode (AI auto-pauses to prevent seller from looking bad)
- Day 22: suspend; preserve data 90 days
- Reactivation: subscribing at any point restores

**Subscription billing:**
- SSLCommerz or ShurjoPay recurring monthly
- Plans: Starter (BDT 999/mo), Pro (BDT 1,799/mo)
- *Higher pricing than previous F-commerce ops plan because AI receptionist value is much higher and saves the seller 4-6 hours/day*
- Webhook from gateway → update subscription status
- 3-day grace period after failed payment
- One-tap in-app cancel
- 30-day money-back guarantee

**Trial edge cases:**
- Abandoned trial, returned > 60 days later: trial consumed, no second free trial
- Account suspended at day 22, returns at day 30: data intact, subscribing restores
- Founder-granted 7-day extensions for hardship cases via admin panel

### Phase 9 — Pre-Launch Hardening (Week 14)

- Load test: simulate 200 concurrent sellers + 500 simultaneous Messenger webhooks
- Security pass: credentials encrypted, JWT short-lived, rate limit every endpoint, CORS locked, HSTS, audit log on every credential read
- Backup verification (restore from backup in < 30 min)
- Sentry alerts to founder phone within 60 sec
- Status page live
- Privacy policy + terms in Bangla + English, lawyer-reviewed
- Concierge onboarding admin tool
- **Submit Meta App Review for `pages_messaging` permission** (start in week 12, expect 2-4 weeks review time; need approval before public launch)
- Browser cross-test: Chrome (Win/Android), Firefox, Safari (Mac/iOS), mobile Chrome
- Lighthouse pass: Performance > 70, Accessibility > 90

### Phase 10 — Closed Beta (Weeks 15-17)

- 30-50 hand-picked sellers from earlier interviews
- One shared WhatsApp group for all beta users
- Daily founder check-ins
- Metrics tracked:
 - **AI accuracy:** % of AI-captured orders the seller approves without edits (target > 70%)
 - **Human handoff rate:** % of conversations needing seller intervention (target < 30%)
 - **Order conversion:** % of customer conversations resulting in approved orders (target > 25%)
 - **Day-7 retention:** > 50%
 - **NPS:** > 40
- Ship daily fixes for top friction points
- Critical: log every AI mistake and every seller override — that's the dataset for v1.1 fine-tuning

### Phase 11 — Public Launch — Web v1.0 (Week 18+)

- Goes live at boxbazar.com
- Open public signups
- Meta App Review approval required by this point
- Distribution playbook (see Section 12)
- Stability + concierge support > new features for 8 weeks post-launch

### Phase 12 — Flutter Mobile App — v1.1 (Months 7-9 post-launch)

Trigger: web has ≥ 100 paying sellers and Day-30 retention > 35%.

- 4-6 weeks of Flutter dev
- Reuse all backend APIs via generated Dart client
- Mobile focus: order approval queue, push notifications for new AI orders, conversation human-takeover
- COD reconciliation read-only on mobile in v1.1; web is the full surface
- Closed testing → production rollout

### Phase 13 — WhatsApp Integration — v1.2 (Months 9-12 post-launch)

- Pick a BSP (Twilio, 360dialog, or AiSensy for BD)
- WhatsApp Business API approval (1-3 months through BSP)
- Template message approval for AI's canned replies
- Conversation pricing absorbed into Pro tier
- AI engine already channel-agnostic — minimal new code

---

## 8. Meta Messenger Integration Reference

### Webhook Setup

- Subscribe to `messages` and `messaging_postbacks` events on each connected Page
- Webhook URL must be HTTPS with valid certificate
- Webhook must respond within 5 seconds (offload to BullMQ queue, return 200 immediately)
- Validate `X-Hub-Signature-256` header on every incoming POST
- Handle `hub.mode=subscribe` GET verification on initial subscribe

### Token Management

- Page Access Tokens are long-lived but can be invalidated by the user
- Detect 401/403 from Send API → mark Store as `invalid` → email seller to reconnect

### Echo Deduplication

When our app sends a message, Meta echoes it back through the webhook. Filter by `message.is_echo` flag or by matching `meta_message_id` against our outgoing messages.

### Rate Limits

Send API: ~250 messages/second per page is generous. Be defensive: queue all outbound, throttle to 50/sec per page.

### Compliance

- 24-hour messaging window: we always reply to inbound, so never an issue
- Message tags: we don't use these. v1 has no outbound marketing.
- Human handoff protocol: skip for v1 (BoxBazar is the only app on the page)

### App Review (Required Before Public Launch)

Submit during week 12. Permissions to request:
- `pages_messaging` (send messages)
- `pages_messaging_subscriptions` (receive messages via webhook)
- `pages_manage_metadata` (subscribe to webhook events)
- `pages_read_engagement` (basic page info)

Approval requires:
- Detailed use-case description
- Screen recording of the user flow
- Privacy policy URL
- Terms of service URL
- Live test app reviewers can use

Expect 2-4 weeks review, 1-2 rounds of follow-up questions typical.

---

## 9. Courier API Reference Notes

### Steadfast (Packzy) — Easiest

- Base URL: `https://portal.packzy.com/api/v1`
- Auth: `Api-Key` + `Secret-Key` headers
- Rate limit: ~60 req/min
- Webhooks supported (bearer token validation)
- Built-in fraud check endpoint
- Bulk order endpoint (up to 500 orders)
- Approval: 3-5 business days

### Pathao Courier

- OAuth2 client credentials
- Tokens expire; cache in Redis with TTL = `expires_in - 60s`
- Separate location/zone/city IDs from Steadfast
- Approval: 1-2 weeks

### RedX

- Less consistent API responses; extra validation
- Approval: 2-3 weeks, variable

### Cross-Courier Gotchas

1. COD amount = product price + delivery charge. AI computes; never trust seller manual entry.
2. Address taxonomy differs per courier. Canonical internal model; map at booking.
3. Pathao tokens expire proactively.
4. Webhook payloads duplicate. Dedup by `(consignment_id, status, timestamp)` hash.

---

## 10. Trust & Security Requirements

This segment has been burned by Evaly, by failed software, by data leaks. Trust is the moat. The AI receptionist makes trust **even more critical** because the seller is letting the AI speak in her voice to her customers.

### Non-Negotiable Trust Practices

1. **Identifiable Bangladeshi founder.** Real Dhaka address, real phone, real Facebook + LinkedIn.
2. **Data policy in plain Bangla.** Core promise: "আমরা আপনার customer list অন্য কাউকে কোনদিন দেখাব না, বিক্রিও করব না।"
3. **Never use one seller's data to train another seller's AI in v1.** Cross-seller learning requires explicit opt-in, only later.
4. **Founder visibility** in WE group + 3-4 other F-commerce FB groups daily.
5. **Generous 15-day free trial.** No card required up-front. No surprise charges day 16.
6. **AI is always overridable.** Global pause button on dashboard. Per-conversation handoff button. "Disable AI" is one click, no confirmation dialog, never punished.
7. **AI conversations are always visible.** Seller can review every word the AI said on her behalf, in her dashboard, fully searchable. No black box.
8. **Conservative AI claims.** "Our AI handles 70% of conversations" not "100% automation." Show real seller stats.
9. **Customer support in Bangla on WhatsApp** with humans (founder for first 6 months).
10. **30-day money-back guarantee** on first paid month.
11. **Founder runs own F-commerce store** and posts about it.

### AI-Specific Trust Practices

12. **AI mistakes are flagged proactively, not hidden.** When the AI does something the seller corrects, dashboard shows "We caught a mistake — here's what happened and how we'll improve."
13. **Seller can see AI confidence per message.** Transparency on when AI is sure vs guessing.
14. **No AI-generated outbound marketing in v1.** Customers must initiate. We are not in the spam-the-customers business.
15. **AI never sees customer DMs from before BoxBazar connection.** Only conversations going forward.
16. **Disclosure language available.** Sellers can optionally enable "Powered by BoxBazar AI" footer on AI messages if they want transparency. Default off.

### Security Implementation

- Meta Page Access Tokens encrypted at rest (libsodium)
- All courier API credentials encrypted at rest
- Last-4-only display in UI
- Audit log on every credential or token read
- JWT 15-min access + 30-day refresh tokens with rotation
- Rate limit every API endpoint
- HTTPS with HSTS
- DB connections via private network
- Daily encrypted backups, two locations
- Monthly restore drills (verify backups actually restore < 30 min)
- Sentry alerts to founder phone < 60 sec on critical errors

---

## 11. Pricing & Plans

| Plan | Price | Conversation limit | Features |
|---|---|---|---|
| Free Trial | BDT 0 | Unlimited for 15 days | Full Starter features, no card required |
| Starter | BDT 999/mo | 500 AI conversations/mo, 200 orders/mo | All couriers, fraud checks, COD reconciliation, label printing, 1 FB Page |
| Pro | BDT 1,799/mo | Unlimited | Multiple FB pages, customer database, priority support, future WhatsApp |

- Trial: 15 calendar days, full Starter, no card up-front
- Day 14: in-app + email + WhatsApp reminder
- Day 15: flip to read-only (AI auto-pauses to prevent seller from looking bad)
- 7-day read-only window, then suspended; data retained 90 days
- Annual: 2 months free (Starter BDT 9,990/year)
- 30-day money-back guarantee on first paid month
- Payment via SSLCommerz or ShurjoPay (bKash, Nagad, Rocket, cards)
- 3-day grace period after failed auto-debit

**Why higher than the original plan:** the AI receptionist saves the seller 4-6 hours/day vs. the previous plan's 1-2 hours/day from manual order capture. Sellers comparing this to hiring a part-time inbox manager (BDT 5-8K/month) see immediate value at BDT 999.

---

## 12. Distribution & Marketing Playbook

### Channel 1: Founder-led organic in Facebook groups

- WE (Women & E-commerce Forum) — primary, 1.7M+ members
- Bangladesh F-Commerce Sellers
- Daraz Seller Community
- Sub-niche groups (clothing, cosmetics, food sellers)
- Daily founder presence. Helpful answers, no pitches.

### Channel 2: Cold WhatsApp/Messenger DMs

- Personalized per seller (reference her page, products, recent posts)
- Bangla, conversational
- Lead with the AI receptionist time-savings hook ("apnar 4-5 ghonta r kaaj AI korbe")
- Offer concierge setup in 15 min
- 8-12% response rate expected

### Channel 3: Strategic complimentary Pro for mid-size sellers

- 5 sellers with 200+ follower count among fellow sellers
- 6 months complimentary Pro via admin grant
- In exchange: testimonial videos within 60 days

### Channel 4: Referral program

- Existing paid seller refers new seller who completes trial + subscribes
- Both get 1 month paid time credited automatically

### Channel 5: Micro-influencer YouTube/Reels

- BD F-commerce creators with 50K-300K subs
- BDT 15K-40K per sponsored video
- 2-3 deals months 5-6

### Channel 6: Paid Facebook ads (months 5-6 only)

- Target: "Facebook page admins" in BD
- Budget: BDT 30K/month
- Expected: 1,500-3,000 trial signups

### Funnel Math to 100 Paying Sellers

| Stage | Conversion |
|---|---|
| Cold DM → reply | 8-12% |
| Reply → live demo | 35-45% |
| Demo → trial signup | 70-80% |
| Trial → active use within 7 days | 60-70% (higher than manual plan because AI does work immediately) |
| Active trial → converts to paid day 15 | 30-40% (higher because trial-end means AI pauses, which is acute pain) |

To land 100 paying: ~300 trial signups = ~500 demos = ~4,000 DMs across 6 months = ~170 DMs/week. Doable with 1 founder + 1 ground person.

---

## 13. Cost Plan (Excluding Developer Cost)

### Build Phase (Months 1-4, before users)

| Item | Monthly |
|---|---|
| App server (Hetzner CPX21) | $6 |
| Postgres on second CPX21 | $6 |
| Redis (Upstash free) | $0 |
| Cloudflare (CDN + R2) | $0 |
| Sentry free tier | $0 |
| Resend free tier | $0 |
| Domain (amortized) | $1.50 |
| SMS testing | $2 |
| Gemini API (testing AI engine) | $30 |
| Meta API access | $0 |
| **Monthly burn** | **~$45** |
| **4-month total** | **~$180** |

### One-Time Setup

| Item | Cost |
|---|---|
| Sole proprietorship + trade license | $120 |
| TIN registration | $0 |
| Lawyer (privacy policy + ToS) | $80 |
| Google Play Console (deferred to v1.1) | $25 |
| Founder's "test seller" inventory | $60 |
| **Total** | **~$285** |

### Launch Phase (Months 5-7, scaling to 100-500 sellers)

| Item | Monthly |
|---|---|
| App server (upgrade to CPX31) | $13 |
| Postgres + backups | $25 |
| Redis (managed or self-hosted) | $8 |
| R2 storage | $3 |
| SMS (OTP + critical notifications) | $25 |
| Gemini API (100-500 active sellers) | $100-500 |
| Email (Resend Pro at 100+ sellers) | $20 |
| Sentry Team plan (at 100+ sellers) | $26 |
| Vercel Pro (if using Vercel for web) | $20 |
| **Monthly burn** | **~$240-640** |

LLM cost scales with active sellers. At 100 active sellers ≈ $100-150/mo. At 500 ≈ $400-700/mo.

### Marketing Budget (Months 5-7 total)

| Item | Cost |
|---|---|
| Beta tester incentives | $85 |
| Micro-influencer deals (2) | $330 |
| Facebook ads (3 mo) | $600 |
| Founder dogfooding | $200 |
| Content creation | $150 |
| **Total** | **~$1,365** |

### Grand Total — 7 Months to 100-500 Sellers

| Bucket | Minimum | Optimal |
|---|---|---|
| One-time setup | $285 | $525 |
| Build phase (4 mo) | $180 | $260 |
| Launch phase (3 mo) | $720 | $1,920 |
| Marketing | $400 | $1,365 |
| Buffer (15%) | $238 | $611 |
| **TOTAL 7-MONTH** | **~$1,820 (BDT 222K)** | **~$4,680 (BDT 570K)** |

Higher than previous plan because: 4 extra build weeks, scaling LLM costs, Meta App Review prep, higher upfront stability requirements due to AI being customer-facing.

### Cost-Saving Principles

1. **Hetzner over DigitalOcean.** 3x cheaper at equivalent specs.
2. **Self-host Postgres + Redis** early.
3. **Aggressive LLM caching** — cache catalog tokens, cache common Q&A patterns, use Stage-1 intent classifier to skip Stage-2 entirely for greetings/closures.
4. **Gemini 2.5 Flash, not Pro** for production. Flash is more than sufficient for this use case.
5. **Free tiers stacked** (Cloudflare, Resend, Sentry).
6. **Defer paid marketing** until product is sticky.
7. **Sole proprietorship over private ltd** first 12 months.

### What NOT to Cut

- Backups (free anyway; non-negotiable)
- Sentry (free tier)
- HTTPS everywhere
- Lawyer-reviewed privacy policy
- Founder dogfooding budget
- Real founder phone for WhatsApp support
- LLM raw payload logging (this is your debugging dataset, do not strip it)

---

## 14. Definition of Done — Web v1.0 Production-Ready

The BoxBazar web app is at v1.0 when ALL of these are true:

- A new seller signs up via OTP, connects FB Page, fills 5 products, and runs a live AI conversation with a test customer in under 25 minutes, unassisted
- AI replies within 4 seconds of incoming Messenger message (95th percentile)
- AI extracts orders with ≥ 70% accuracy (seller approves without edits) on real seller catalogs in beta
- Human handoff button works from any conversation, instantly
- Webhook from any courier updates order status in < 30 seconds end-to-end
- COD reconciliation matches > 90% of payout line items automatically
- Fraud check returns in < 4 seconds
- Web push works on Chrome, Firefox, mobile Chrome
- Email digest delivers reliably to Gmail, Yahoo, bd-hosted addresses
- Lighthouse Performance > 70 on dashboard route
- Sentry shows < 5 unique uncaught errors per 1,000 user actions
- DB backups verified by monthly restore drill
- Subscription billing tested end-to-end with real bKash, real card, real downgrade, real cancellation
- At least 30 beta sellers used the app for 14 consecutive days
- Day-7 retention in beta > 45%
- **Meta App Review approved for `pages_messaging` permission**
- Privacy policy + terms in Bangla + English, lawyer-reviewed
- Works on screen widths 360px to 1920px
- OpenAPI spec maintained, Dart client generation tested

If any of these is missing, the app is at v0.9 — not v1.0.

### Definition of Done — Mobile v1.1 (Future)

- Login + order approval queue + conversation human-takeover + push for new AI orders + courier dispatch all work end-to-end on Android 8+
- FCM push reliable on Symphony, Walton, Realme, Xiaomi
- APK < 25 MB
- Play Store approved
- ≥ 20 existing paid web sellers used mobile 14 days
- Mobile + web data sync verified

---

## 15. Risks & Pre-Mitigations

| Risk | Mitigation |
|---|---|
| Meta App Review rejection | Apply early (week 12), thorough documentation, Plan B (beta mode allows building + paid customers via app role assignments during review) |
| AI hallucination loses seller's customer | Strict catalog grounding, confidence threshold gate, mandatory human handoff for low-confidence, full audit log seller can review |
| LLM cost spirals out of control | Aggressive caching, Stage-1 intent filter, per-tier conversation limits, daily cost alerts to founder |
| Courier API breaks/changes | Raw payload storage + adapter pattern + automated daily smoke tests |
| Meta page token expires/revoked | Detect 401/403, mark store as invalid, email seller to reconnect within 1 hour |
| Seller credentials leak | KMS encryption, last-4-only UI, audit log on every read |
| Webhook flood (500 messages/sec from a viral seller's page) | BullMQ queue with concurrency caps; never process webhooks synchronously |
| Single seller scraping fraud-check endpoint | Per-tier daily caps, pattern detection, throttle then block |
| DB exposed | Private VPC, encrypted backups |
| Money calculation bug | All amounts in `bigint` cents, every txn in Postgres tx, payout checksums |
| Browser compatibility (mobile Safari quirks) | Cross-browser test before every release |
| Slow networks (2G/3G) | Aggressive client caching, optimistic UI updates, retry-with-backoff |
| Android push reliability on Chinese OEMs (v1.1 only) | Test extensively, document battery optimization whitelist |
| Customer realizes they're talking to AI and feels deceived | Sellers can opt-in to "Powered by BoxBazar AI" disclosure footer; AI is genuinely helpful so framing is "AI assistant" not "fake human" |

---

## 16. Anti-Goals (Things This Product Will Not Do)

- We are not a storefront builder. Shopify exists.
- We are not a payment gateway. SSLCommerz exists.
- We are not a courier company. We integrate.
- We are not a Daraz competitor. We serve sellers Daraz doesn't.
- We are not a generic CRM. We are F-commerce-specific.
- We do not do AI-generated outbound marketing. Customers must initiate.
- We do not sell aggregated seller data to third parties. Ever.
- We do not train cross-seller AI without explicit opt-in. v1 is strict per-seller isolation.
- We do not hide AI mistakes. Every error is logged, visible, fixable.
- We do not ignore mobile — v1 is responsive web that works on phone browsers; Flutter mobile in v1.1.
- We do not enable AI on a seller's page until their catalog has ≥ 5 products. Bad catalog = bad AI = lost trust.

---

## 17. Team & Operations

### Roles in v1

- 1 founder/engineer (full-stack, leads backend + AI engine + ops)
- 1 frontend dev (Next.js, full-time from week 2, ~BDT 100K-180K/mo)
- 1 support person from month 3 (concierge onboarding, ~BDT 35K-60K/mo)
- 1 contract content writer (Bangla AI prompts, marketing copy, ~BDT 20K-40K/mo)

### Daily Cadence

- Morning: Sentry errors review, overnight signups, LLM cost dashboard
- Mid-day: WhatsApp support queue, WE group presence
- Afternoon: ship one improvement
- Evening: weekly cohort retention check Mondays, AI accuracy metrics Fridays

### Communication Channels

- WhatsApp Business: founder's number, 9am-10pm, < 2h response
- In-app help → WhatsApp
- Facebook page, monitored daily
- support@boxbazar.com, < 48h response

### Internal Tools

- GitHub (private)
- Linear or GitHub Issues
- Notion / Obsidian for docs
- Better Stack for status
- Sentry for errors
- Custom admin dashboard in-app (don't pay for Retool)

---

## End of Context

A developer reading this file should be able to start building tomorrow. Open questions or ambiguities not covered here should be resolved by the principle: **ship the simplest thing that earns one Bangladeshi F-commerce seller's trust this week.** Everything else follows from that.

For the AI engine specifically, add a second principle: **when in doubt, ask the seller, don't guess.** AI confidence is currency; spend it carefully.
