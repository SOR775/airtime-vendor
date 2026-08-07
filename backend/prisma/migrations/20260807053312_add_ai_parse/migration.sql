-- CreateTable
CREATE TABLE "AiParse" (
    "id" TEXT NOT NULL,
    "mpesaText" TEXT NOT NULL,
    "model" TEXT,
    "suggestion" JSONB,
    "authoritative" JSONB,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiParse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiParse_transactionId_idx" ON "AiParse"("transactionId");

-- AddForeignKey
ALTER TABLE "AiParse" ADD CONSTRAINT "AiParse_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
