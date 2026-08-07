/*
  Warnings:

  - A unique constraint covering the columns `[mpesaReceiptNumber]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "MpesaCallback" (
    "id" TEXT NOT NULL,
    "darajaCallbackId" TEXT,
    "checkoutRequestId" TEXT,
    "transactionId" TEXT,
    "raw" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processingError" TEXT,

    CONSTRAINT "MpesaCallback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedeemedCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "transactionId" TEXT,
    "amount" INTEGER NOT NULL,
    "phoneNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),

    CONSTRAINT "RedeemedCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MpesaCallback_darajaCallbackId_key" ON "MpesaCallback"("darajaCallbackId");

-- CreateIndex
CREATE INDEX "MpesaCallback_checkoutRequestId_idx" ON "MpesaCallback"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "RedeemedCode_code_key" ON "RedeemedCode"("code");

-- CreateIndex
CREATE INDEX "RedeemedCode_code_idx" ON "RedeemedCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_mpesaReceiptNumber_key" ON "Transaction"("mpesaReceiptNumber");

-- AddForeignKey
ALTER TABLE "MpesaCallback" ADD CONSTRAINT "MpesaCallback_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedeemedCode" ADD CONSTRAINT "RedeemedCode_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
