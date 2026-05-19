# BoxBazar — Session Progress

A running record of what was built, what was wired, and where we are mid-setup.

---

## 1. Platform API keys from the UI

Goal: no more `.env` edits to launch.

- `PlatformConfig` singleton table + migration. Public fields + AES-GCM `encryptedSecrets`.
- `apps/api/src/lib/platform-config.ts` — `getPlatformConfig()` w/ 30 s memo cache, env fallback.
- Routes:
  - `GET  /api/platform/config/status` — public readiness booleans (any logged-in user)
  - `GET  /api/platform/config` — **admin + recent-MFA gated**
  - `PATCH /api/platform/config` — admin + recent-MFA gated
- All runtime callers (webhooks, Messenger client, AI provider, SMS, chat-parser, Facebook routes) now read from `getPlatformConfig()` first.
- `/platform-setup` UI — admin-only, MFA-gated, copy-paste callback URLs, masked secrets.

---

## 2. Admin role + email MFA

- `users.isAdmin`, `users.mfaEnabled`, `users.mfaEnrolledAt`.
- `mfa_codes` table — purpose, expiresAt, consumedAt, attempts. Codes are 6 chars: **2 letters + 4 digits at random positions** (e.g. `K3X729`, `4A8B9X`). 10-min single-use, 5-attempt cap, 5-code-per-user-per-hour rate limit.
- `mfaVerifiedAt` JWT claim → 15-min admin session window.
- **Delivery**: nodemailer + SMTP (Gmail / Outlook / etc). If `SMTP_HOST` is unset, the code prints to API stdout with `[MFA DEV-MODE]`.
- Routes: `start-enroll`, `verify-enroll`, `start-challenge`, `verify-challenge` under `/api/auth/mfa/...`.
- `requireAdmin` + `requireRecentMfa` Fastify decorators gate `/api/platform/config`.
- Migration also promotes the earliest existing user to admin.

---

## 3. Long-lived Facebook Page Access Token

- `exchangeForLongLivedUserToken(shortToken, appId, appSecret)` in meta-sdk.
- `connect-facebook` exchanges the short Graph-Explorer token for a 60-day long-lived user token first, then derives a Page Access Token (effectively never expires).
- Connect response now includes `{ tokenLifetime, tokenWarning }` so the UI can warn if the exchange didn't take.

---

## 4. AI personality fixes

- Removed canned "Ji apu" template short-circuit for greetings — every message goes through Gemini now.
- Rewrote `tone.ts`: tones describe register only (formality / energy / Bangla vs Banglish). Form of address is decided per-conversation, not by the tone preset.
- Rewrote `prompts.ts`: context-first instructions, semantic catalog matching, 2-3 product listing on "what do you sell", high default Stage-1 confidence.
- `respond.ts`: temperature `0.7`, `maxOutputTokens: 2048`.
- `catalog.ts`: surfaces product keywords so the model matches fuzzy customer phrasings.

### 4a. Name-based bhai/apu salutation (2026-05-16)

The AI now infers how to address the customer from their Facebook profile name. Rules baked into Stage-2 system prompt:

1. **Bangladeshi names**: infer gender from typical suffix patterns (e.g. female: -a, -i, -un, -ya, -ima, "Begum", "Khatun"; male: -ul, -an, -uddin, "Md."). → use `apu` / `bhai` when greeting or when natural.
2. **Customer self-references override**: if the customer themselves writes "bhai" or "apu" anywhere in their messages, mirror that verbatim.
3. **Ambiguous / foreign names**: stay neutral. Use the name directly or "আপনি" form. Do NOT guess wrong — gender mismatches are more offensive than no salutation.
4. **No name on file**: just speak directly.

Salutations are also **rate-limited in the prompt** — once at greeting plus occasional warmth, not every message.

### 4b. Few-shot examples — seller picks their best conversations (2026-05-16)

The seller flags any past conversation as "use this style" via a star button in `/inbox/[id]`. The top 3 starred conversations (by recency) get injected into the Stage-2 system prompt as `EXAMPLE EXCHANGES FROM THIS SHOP`, so the AI starts matching the seller's actual voice — vocabulary, register, length, how they greet/close/order-collect.

- **Schema**: `Conversation.useAsExample Boolean @default(false)` with index on `(storeId, useAsExample)`. Migration `20260516010000_few_shot_examples` (applied).
- **API**: `PATCH /api/conversations/:id { useAsExample }` toggles the flag. `GET /api/conversations/:id` returns the current value.
- **Engine**: `ReceptionistInput.exampleConversations?` carries up to 3 exemplars. `prompts.formatExamples` renders them as `Example N:\n  Customer: …\n  Shop: …` blocks. Each example capped at 10 turns to bound token cost.
- **Pipeline**: `messenger-pipeline.ts` queries `prisma.conversation.findMany({ where: { useAsExample: true } })` in parallel with history + catalog fetches. Examples with < 2 messages are dropped (no signal).
- **UI**: small star icon in the inbox conversation header, next to the AI on/off button. Click → toggle. Filled amber = enabled.

Token cost: each example adds ~150-300 input tokens depending on length. With 3 exemplars, ~$0.0001 extra per reply. Within budget.

### 4c. Curated BoxBazar example library (2026-05-16)

A baseline of **32 hand-curated real conversations** ships with the AI engine at `packages/ai-engine/src/curated-examples.ts`. Used to seed the AI's voice on day 1 — before a seller has starred anything of their own.

- **Why in code (not the DB)**: zero clutter in seller inboxes, available on day 1, token-bounded (only 3 picked per call).
- **Outcomes labeled**: every example carries a label like "ORDER CONFIRMED — full flow", "DECLINED — kept price discipline", "INQUIRY — polite handling". Rendered into the prompt as `Example N (LABEL):` so the AI explicitly sees both happy paths AND graceful price-discipline patterns.
- **Diverse mix**: `pickCuratedExamples(count)` targets 1 confirmed + 1 declined + 1 inquiry by default. The AI learns when to push forward and when to hold the line.
- **Hourly rotation**: deterministic seed based on `floor(Date.now() / 1 hour)` rotates which examples are picked through the day, so different conversations get different exemplars without breaking the prompt cache within a minute.
- **Pipeline merge**: seller's starred conversations (max 3) take priority; curated fills the remaining slots. Once a seller has 3+ starred, curated contributes nothing — their voice wins.
- **Categories captured**: three-piece, saree, panjabi, lehenga, anarkali, kurti, gown, kameez, bridal-lehenga, kurti-set, policy questions, greetings.

Token cost: still ~$0.0001 extra per reply (3 examples in the prompt regardless of source). Budget unchanged.

### 4d. Multimodal — AI now reads customer images (2026-05-16)

The AI no longer ignores messages that contain images. Gemini 2.5 Flash receives the actual image bytes alongside the text prompt and replies as a shop owner who looked at the picture.

- **Stage-1 skipped on image messages.** When attachments are present, the engine synthesizes a `product_inquiry` intent at 0.85 confidence and goes straight to Stage 2. Saves a flash call per image message AND avoids the text classifier hallucinating "unclear" on short captions like "ei ta?".
- **Image-aware system prompt.** A new `IMAGE ATTACHED` block in `prompts.ts` tells the model to MATCH what it sees against the catalog and reply directly with name + price; ask back when 2-3 plausibly match; flag `catalogMiss` when nothing fits. Explicitly forbids vision-system narration ("I see a red garment with...").
- **Meta SDK fetcher** — new `fetchAttachment(url)` in `packages/meta-sdk/src/attachments.ts`. Pulls the image from Meta's signed CDN, validates `image/*` MIME, caps at 5 MB, 10s timeout. Returns null on any failure so the pipeline can soft-skip.
- **Gemini provider** — `LlmRequest.images?` accepted, serialized as `inlineData` parts (mimeType + base64). Text part precedes image parts in the user turn.
- **Pipeline orchestration** (`apps/api/src/lib/messenger-pipeline.ts`):
  - Filters to image attachments only, caps at 3 images per message (Meta allows more; we don't).
  - Fetches all images in parallel with the products / history / examples queries.
  - Passes `attachments` to `runReceptionist`; the engine routes them to Stage 2.
  - Image-only messages no longer return `recorded_no_ai` early — they flow through the AI now.

### Budget guardrail (added with multimodal)

A new per-customer rate limit in the pipeline: **max 30 inbound messages per customer per hour**. Beyond that, the message is persisted but the AI is skipped. Cheap floor under runaway cost — prevents a single chatty customer (or a probe / loop) from blowing the $2 / seller / month budget.

### Cost math reaffirmed

| Message type | Per-call cost (Flash) |
|---|---|
| Text only | ~$0.00035 |
| Image (one) — skips Stage 1 | ~$0.00035 |
| Image (three) — skips Stage 1 | ~$0.00060 |

At 500-1,000 messages / seller / month, even all-multimodal sellers stay well under $1. The $2 cap is the safety margin.

---

## 5. Owner panel + impersonation (2026-05-15/16)

**The most-privileged role in the system.** One per deployment, identified by env var `OWNER_EMAIL` (default `saikat351h@gmail.com`).

### Schema (migration `20260516000000_owner_role`)

- `users.isOwner Boolean @default(false)` — strict superset of `isAdmin`.
- `users.publicId VARCHAR(4) @unique` — 4-character public user ID. Format:
  - 2 letters from A-Z minus I/O (24 options)
  - 2 digits from 2-9 minus 0/1 (8 options)
  - letters and digits at **random positions**
  - examples: `K3X7`, `4A2B`, `9P5N`, `2WJ6`
  - keyspace ≈ 22K, collision retry handles dupes (uniqueness enforced by index)
- `MfaCodePurpose` enum gains `owner_login`.
- Migration backfills `publicId` for every existing user via a PL/pgSQL loop and promotes the configured `OWNER_EMAIL` user to `isOwner=true, isAdmin=true`.

### Passwordless owner login

- `POST /api/auth/owner/request-code` `{ email }` — if email matches `OWNER_EMAIL` (case-insensitive), mint a 6-char MFA code, email it. Returns identical shape whether or not the email matches (no enumeration).
- `POST /api/auth/owner/verify-code` `{ email, codeId, code }` — on valid, returns access token with `isOwner: true`, `isAdmin: true`, and `mfaVerifiedAt` already set. Auto-creates the owner user row on first login.
- Each request + success logged with `[OWNER]` tag in API stdout.

### Owner API (`/api/owner/...`)

Both gated by `authenticate + requireOwner + requireRecentMfa`:

- `GET /api/owner/users`
  - Lists every user with: id, publicId, name, email/phone, store count, total + per-day conversation counts for the last 7 days, isAdmin/isOwner flags.
  - Daily counts computed by one grouped SQL (`date_trunc('day', conversations.createdAt)`) — one round-trip total.
- `POST /api/owner/users` — Add a new user from the admin panel. Body: `{ name, email?, phone?, password? }`. Auto-assigns `publicId`. At least one of email or phone is required. Returns 201 with the created row.
- `DELETE /api/owner/users/:publicId` — Permanently deletes a user. Cascades stores → products → conversations → orders. Admin cannot delete themselves or another admin (owner).
- `POST /api/owner/users/:publicId/impersonate` — Mints a 15-min access token signed for the target user's id, carrying `impersonatedBy: <ownerId>`. Admin cannot impersonate another admin. Audit-logged to API stdout.

### JWT additions

- `isOwner?: boolean`
- `impersonatedBy?: string` — present iff the session is impersonating; UI banner reads this.

### UI

- **No owner-login link on `/login`** — the link is hidden. Admin bookmarks the secret URL.
- **`/login/admin-p`** is the hidden admin-login page. Inline email → code flow (no modal). Successful verify lands the admin on `/owner`.
- **Sidebar** gains "Admin panel" (Crown icon) — visible only when `user.isOwner === true`. Hidden while impersonating.
- **`/owner` page** (titled "Admin panel"):
  - "+ Add user" button in the top-right action slot → `AddUserModal` for creating a normal user (name, email/phone, optional password). Creates a regular account.
  - Search box (filters by name / email / phone / publicId).
  - User table — each row shows public-ID chip, name + admin badges, store count, today's conversations, 7-day total, mini SVG sparkline, **trash icon** for deletion.
  - Clicking the row body opens impersonation: POST to `/api/owner/users/:publicId/impersonate` → store admin's session in `impersonation.owner` slot → swap to target's token → `router.push('/settings')` (admin only lands on Settings, not the full dashboard).
- **Impersonation nav restriction**: when impersonating, only `/settings` is visible in the sidebar. Dashboard, Inbox, Approval, Products, Orders, Reconciliation are all hidden — the admin is here to configure, not to read private data.
- **Impersonation banner** (amber, top of every page) when active: shows public ID + name + "configuration access only" + "Stop impersonating" button. Stop restores the admin's saved token and routes back to `/owner`.
- `useMe()` hook skips refresh during impersonation so the admin's flags stay stashed.

### Files

```
new:
  apps/api/src/lib/public-id.ts
  apps/api/src/routes/owner.ts                          (list + add + delete + impersonate)
  apps/web/src/app/(dashboard)/owner/page.tsx           (admin panel)
  apps/web/src/app/(auth)/login/admin-p/page.tsx        (hidden admin-login route)
  apps/web/src/components/AddUserModal.tsx
  packages/db/prisma/migrations/20260516000000_owner_role/migration.sql

modified:
  apps/api/src/env.ts                       (+ OWNER_EMAIL)
  apps/api/src/plugins/auth.ts              (+ requireOwner, JWT carries isOwner + impersonatedBy)
  apps/api/src/routes/auth.ts               (+ owner-login routes, publicId on register, options arg)
  apps/api/src/routes/index.ts              (mount owner routes)
  apps/web/src/store/auth.ts                (impersonation state + start/stop helpers)
  apps/web/src/lib/use-me.ts                (skip param)
  apps/web/src/app/(auth)/login/page.tsx    (NO admin link — kept hidden)
  apps/web/src/app/(dashboard)/layout.tsx   ("Admin panel" nav, banner, impersonation nav restriction)
  packages/db/prisma/schema.prisma          (User.publicId/isOwner, MfaCodePurpose.owner_login)

removed:
  apps/web/src/components/OwnerLoginModal.tsx          (replaced by the inline /login/admin-p page)
```

---

## 6. Where we are operationally

| Step | Status |
|---|---|
| Postgres + Redis | running locally |
| Dev servers | stopped — start with `pnpm dev` |
| Migrations applied | 5 (last: `20260516000000_owner_role`) |
| SMTP | `apps/api/.env` has the Gmail block, real codes emailed |
| Owner | `saikat351h@gmail.com` auto-promoted by migration |

---

## 7. How to use the admin panel

1. `pnpm dev`
2. Open the **hidden** URL directly — there is no link to it from `/login`:
   ```
   http://localhost:3000/login/admin-p
   ```
3. Enter `saikat351h@gmail.com` → **Email me a code** → check inbox.
4. Enter the 6-character code → lands on `/owner` (titled "Admin panel").
5. **User table** — every account with public ID, store count, today's conversations, 7-day total, sparkline.
6. **Add user** — top-right "+ Add user" button. Modal accepts name + email/phone + optional password. Creates a normal user account just like a self-signup; auto-assigns a 4-character public ID.
7. **Delete user** — trash icon at the right of each row. Confirmation prompt; cascades all the user's data. Admin cannot delete themselves or another admin.
8. **Impersonate (configure) user** — click the row body. Confirmation prompt → opens **only their Settings page** (Facebook page, AI tone, courier APIs). Inbox / orders / dashboard analytics are all hidden. Amber banner up top labels the session.
9. Click **Stop impersonating** → returns to the admin panel with your admin session intact.

---

## 8. First-run setup (from scratch)

```bash
pnpm install
pnpm --filter @fcommerce/db generate
pnpm --filter @fcommerce/db exec prisma migrate deploy
pnpm dev
```

Add to `apps/api/.env` (optional but recommended):
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=<16-char-app-password>
SMTP_FROM=you@gmail.com
OWNER_EMAIL=you@gmail.com
```

Without SMTP, MFA/owner codes print to API stdout instead of email.

---

## 9. Verification

- `pnpm -r typecheck` — all 7 projects green.
- `apps/web` build — 17 routes including `/owner`.
- Migration `20260516000000_owner_role` applied.

---

## 10. Known limitations / not done

- No SMS MFA — email only. Add a phone fallback if email becomes unreliable.
- No backup recovery codes. Losing email access = DB edit to recover.
- Impersonation tokens last 15 min and can't be refreshed; owner re-impersonates to extend.
- Audit log is API stdout for now — no dedicated `ImpersonationLog` table yet.
- Owner cannot promote/demote admins yet (manual DB update); admin role still derives from "first registered user".
- The `/owner` table loads all users in one shot — fine for hundreds; add pagination if you cross a few thousand.
