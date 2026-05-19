-- AlterEnum
ALTER TYPE "MfaCodePurpose" ADD VALUE 'owner_login';

-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicId" VARCHAR(4);

-- CreateIndex (unique on publicId; nulls allowed)
CREATE UNIQUE INDEX "users_publicId_key" ON "users"("publicId");

-- Backfill publicId for every existing user.
-- Format: 2 letters from A-Z minus I/O (24 options) + 2 digits from 2-9
-- minus 0/1 (8 options) at randomly chosen positions. Re-roll on collision.
DO $$
DECLARE
  u RECORD;
  letters TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  digits  TEXT := '23456789';
  candidate TEXT;
  p1 INT;
  p2 INT;
  parts TEXT[];
  i INT;
  collision_count INT;
BEGIN
  FOR u IN SELECT id FROM "users" WHERE "publicId" IS NULL LOOP
    LOOP
      -- pick two distinct slots (0..3) for the letters
      p1 := floor(random() * 4)::int;
      LOOP
        p2 := floor(random() * 4)::int;
        EXIT WHEN p2 <> p1;
      END LOOP;
      parts := ARRAY['', '', '', ''];
      FOR i IN 0..3 LOOP
        IF i = p1 OR i = p2 THEN
          parts[i + 1] := substr(letters, floor(random() * length(letters))::int + 1, 1);
        ELSE
          parts[i + 1] := substr(digits, floor(random() * length(digits))::int + 1, 1);
        END IF;
      END LOOP;
      candidate := array_to_string(parts, '');
      SELECT COUNT(*) INTO collision_count FROM "users" WHERE "publicId" = candidate;
      EXIT WHEN collision_count = 0;
    END LOOP;
    UPDATE "users" SET "publicId" = candidate WHERE id = u.id;
  END LOOP;
END $$;

-- Promote the configured platform owner (saikat351h@gmail.com) if the user
-- already exists. New owner accounts are also auto-promoted at owner-login
-- time, so this is just for the operator's existing account.
UPDATE "users"
SET "isOwner" = true, "isAdmin" = true
WHERE LOWER("email") = LOWER('saikat351h@gmail.com');
