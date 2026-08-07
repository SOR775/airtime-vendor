SELECT "id", "status", "checkoutRequestId", "merchantRequestId", "mpesaReceiptNumber", "payerPhoneNumber", "failureReason", "createdAt", "updatedAt"
FROM "Transaction"
WHERE "id" = '50577fab-991f-4070-bc0f-7846be647623';

SELECT "id", "darajaCallbackId", "checkoutRequestId", "transactionId", "processed", "processedAt", "receivedAt", "raw"
FROM "MpesaCallback"
WHERE "checkoutRequestId" IS NOT NULL OR "transactionId" = '50577fab-991f-4070-bc0f-7846be647623'
ORDER BY "receivedAt" DESC;
