-- AlterTable
ALTER TABLE "conversations"
  ADD COLUMN "useAsExample" BOOLEAN NOT NULL DEFAULT false;

-- Index lets the pipeline pull "useAsExample = true" rows for a store fast.
CREATE INDEX "conversations_storeId_useAsExample_idx"
  ON "conversations" ("storeId", "useAsExample");
