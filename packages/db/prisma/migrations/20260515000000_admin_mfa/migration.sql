-- CreateEnum
CREATE TYPE "MfaCodePurpose" AS ENUM ('enroll', 'challenge');

-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaEnrolledAt" TIMESTAMPTZ;

-- Promote the earliest existing user to admin so the operator is not locked out
-- after this migration. Subsequent installs / fresh DBs will fall through to the
-- register-time auto-promotion path (see apps/api/src/routes/auth.ts).
UPDATE "users"
SET "isAdmin" = true
WHERE id = (SELECT id FROM "users" ORDER BY "createdAt" ASC LIMIT 1);

-- CreateTable
CREATE TABLE "mfa_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "MfaCodePurpose" NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "consumedAt" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mfa_codes_userId_createdAt_idx" ON "mfa_codes"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "mfa_codes" ADD CONSTRAINT "mfa_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
