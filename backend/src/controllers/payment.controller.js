const prisma = require("../config/db");
const mpesa = require("../services/mpesa.service");
const airtime = require("../services/airtime.service");
const logger = require("../utils/logger");

const MIN_AMOUNT = 5;
const MAX_AMOUNT = 10000; // set a sane ceiling; tune to your risk appetite

/**
 * POST /api/payments/initiate
 * body: { phone: "07XXXXXXXX", amount: 100 }
 *
 * Creates a PENDING_PAYMENT transaction, then triggers the M-Pesa STK push
 * prompt on the customer's phone. The customer enters their M-Pesa PIN;
 * the result arrives later via the /callback endpoint below -- this
 * endpoint does NOT wait for that, it just confirms the prompt was sent.
 */
async function initiate(req, res) {
  const { recipientPhone, buyerPhone, amount } = req.body;

  if (!recipientPhone || !amount) {
    return res.status(400).json({ error: "recipientPhone and amount are required" });
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < MIN_AMOUNT || amt > MAX_AMOUNT) {
    return res.status(400).json({ error: `amount must be between ${MIN_AMOUNT} and ${MAX_AMOUNT}` });
  }

  let normalizedRecipientPhone;
  let normalizedBuyerPhone = null;
  try {
    normalizedRecipientPhone = mpesa.normalizePhone(recipientPhone);
    if (buyerPhone && String(buyerPhone).trim()) {
      normalizedBuyerPhone = mpesa.normalizePhone(buyerPhone);
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const transaction = await prisma.transaction.create({
    data: { phoneNumber: normalizedRecipientPhone, amount: amt },
  });

  try {
    const stkResponse = await mpesa.initiateSTKPush({
      phone: normalizedBuyerPhone || normalizedRecipientPhone,
      amount: amt,
      accountReference: transaction.id,
      transactionDesc: "Airtime",
    });

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        merchantRequestId: stkResponse.MerchantRequestID,
        checkoutRequestId: stkResponse.CheckoutRequestID,
      },
    });

    logger.info("STK push initiated", {
      transactionId: transaction.id,
      merchantRequestId: stkResponse.MerchantRequestID,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      response: stkResponse,
    });

    return res.status(202).json({
      transactionId: transaction.id,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      message: "Check your phone and enter your M-Pesa PIN to complete payment.",
    });
  } catch (err) {
    logger.error("STK push failed", JSON.stringify(err.response?.data), err.message);
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: "PAYMENT_FAILED", failureReason: "Failed to initiate STK push" },
    });
    return res.status(502).json({ error: "Could not initiate payment. Please try again." });
  }
}

/**
 * POST /api/payments/callback
 * Safaricom posts here once the customer completes/cancels the STK prompt.
 * This endpoint must respond quickly with { ResultCode: 0 } or Safaricom
 * will retry -- so we do the airtime delivery, but keep it fast and make
 * sure failures here don't leave money "stuck" (see AIRTIME_FAILED status,
 * which you should monitor and handle via a retry job or manual refund).
 */
async function callback(req, res) {
  // Persist raw callback payload for audit before processing. This ensures
  // Daraja's POST is recorded even if later processing fails.
  let savedCallback = null;
  try {
    savedCallback = await prisma.mpesaCallback.create({
      data: {
        darajaCallbackId: req.body?.Body?.stkCallback?.CheckoutRequestID || null,
        checkoutRequestId: req.body?.Body?.stkCallback?.CheckoutRequestID || null,
        raw: req.body,
      },
    });
  } catch (err) {
    logger.error("Failed to persist raw MPesa callback", err.message || err);
  }

  const callbackMeta = {
    darajaCallbackId: req.body?.Body?.stkCallback?.MerchantRequestID || null,
    checkoutRequestId: req.body?.Body?.stkCallback?.CheckoutRequestID || null,
    resultCode: req.body?.Body?.stkCallback?.ResultCode ?? null,
    resultDesc: req.body?.Body?.stkCallback?.ResultDesc || null,
  };

  logger.info("MPesa callback received", callbackMeta);

  // Acknowledge immediately so Safaricom doesn't retry the callback.
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  let parsed;
  try {
    parsed = mpesa.parseStkCallback(req.body);
  } catch (err) {
    logger.error("Could not parse STK callback", { error: err.message || err, body: req.body });
    if (savedCallback) {
      await prisma.mpesaCallback.update({
        where: { id: savedCallback.id },
        data: { processed: true, processedAt: new Date(), processingError: 'parse_error' },
      });
    }
    return;
  }

  logger.info("Parsed STK callback", {
    checkoutRequestId: parsed.checkoutRequestId,
    merchantRequestId: parsed.merchantRequestId,
    success: parsed.success,
    resultDesc: parsed.resultDesc,
  });

  // Prevent duplicate processing: if we've already processed a callback for
  // this checkoutRequestId, skip further work.
  if (parsed.checkoutRequestId) {
    const already = await prisma.mpesaCallback.findFirst({ where: { checkoutRequestId: parsed.checkoutRequestId, processed: true } });
    if (already) {
      logger.info("Duplicate STK callback ignored", { checkoutRequestId: parsed.checkoutRequestId });
      return;
    }
  }

  const transaction = await prisma.transaction.findUnique({ where: { checkoutRequestId: parsed.checkoutRequestId } });
  if (!transaction) {
    logger.error("Callback for unknown transaction", { checkoutRequestId: parsed.checkoutRequestId });
    if (savedCallback) {
      await prisma.mpesaCallback.update({
        where: { id: savedCallback.id },
        data: { processed: true, processedAt: new Date(), processingError: 'unknown_transaction' },
      });
    }
    return;
  }

  if (!parsed.success) {
    logger.info("STK callback indicates payment failed", { transactionId: transaction.id, resultDesc: parsed.resultDesc });
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: "PAYMENT_FAILED", failureReason: parsed.resultDesc },
    });
    if (savedCallback) {
      await prisma.mpesaCallback.update({
        where: { id: savedCallback.id },
        data: { processed: true, processedAt: new Date(), transactionId: transaction.id },
      });
    }
    return;
  }

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: "PAYMENT_RECEIVED",
      mpesaReceiptNumber: parsed.mpesaReceiptNumber,
      payerPhoneNumber: parsed.payerPhoneNumber,
    },
  });

  // Link the saved callback to the transaction before delivery.
  if (savedCallback) {
    try {
      await prisma.mpesaCallback.update({ where: { id: savedCallback.id }, data: { transactionId: transaction.id } });
    } catch (err) {
      logger.error('Failed to link mpesa callback to transaction', err.message || err);
    }
  }

  // Payment confirmed -- now actually deliver the airtime.
  try {
    const result = await airtime.sendAirtime({
      phone: transaction.phoneNumber,
      amount: transaction.amount,
    });

    if (result.success) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: "AIRTIME_SENT", airtimeProviderRef: result.providerRef },
      });
    } else {
      // Payment succeeded but delivery failed -- this needs attention.
      // In production: push to a retry queue and/or alert an admin;
      // don't just let this sit silently.
      logger.error("Airtime delivery failed after payment", transaction.id, result.error);
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: "AIRTIME_FAILED", failureReason: result.error },
      });
    }
  } catch (err) {
    logger.error("Airtime delivery threw", transaction.id, err.message);
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: "AIRTIME_FAILED", failureReason: err.message },
    });
  }
    // mark callback processed (success case or failure above will still mark processed)
    if (savedCallback) {
      try {
        await prisma.mpesaCallback.update({ where: { id: savedCallback.id }, data: { processed: true, processedAt: new Date() } });
      } catch (err) {
        logger.error('Failed to mark mpesa callback processed', err.message || err);
      }
    }
}

/**
 * GET /api/payments/:id/status
 * Frontend polls this after initiate() to show the customer live progress.
 */
async function status(req, res) {
  const transaction = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!transaction) return res.status(404).json({ error: "Transaction not found" });

  // Ensure polling clients never receive cached 304 responses.
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");

  // Helpful debug log so frontend polling issues are easier to trace in server logs.
  logger.info("Status requested", { transactionId: req.params.id, status: transaction.status });

  return res.json({
    id: transaction.id,
    status: transaction.status,
    amount: transaction.amount,
    phoneNumber: transaction.phoneNumber,
    payerPhoneNumber: transaction.payerPhoneNumber,
    failureReason: transaction.failureReason,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
  });
}

// Admin/manual retry endpoint for when airtime delivery failed after payment
async function retryAirtime(req, res) {
  const id = req.params.id;
  const transaction = await prisma.transaction.findUnique({ where: { id } });
  if (!transaction) return res.status(404).json({ error: "Transaction not found" });

  if (transaction.status !== "AIRTIME_FAILED" && transaction.status !== "PAYMENT_RECEIVED") {
    return res.status(400).json({ error: "Transaction not eligible for airtime retry" });
  }

  try {
    const result = await airtime.sendAirtime({ phone: transaction.phoneNumber, amount: transaction.amount });

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        retryCount: { increment: 1 },
        status: result.success ? "AIRTIME_SENT" : "AIRTIME_FAILED",
        airtimeProviderRef: result.providerRef || null,
        failureReason: result.success ? null : result.error || "Retry failed",
      },
    });

    return res.json({ success: result.success, raw: result.raw, error: result.error || null });
  } catch (err) {
    logger.error("Airtime retry threw", id, err.message || err);
    await prisma.transaction.update({ where: { id: transaction.id }, data: { status: "AIRTIME_FAILED", failureReason: err.message } });
    return res.status(500).json({ error: "Airtime retry failed" });
  }
}

/**
 * POST /api/payments/airtime-webhook
 * Statum posts async airtime delivery results here.
 * The request body should contain request_id, result_code, and result_desc.
 */
async function airtimeWebhook(req, res) {
  const expectedSecret = process.env.WEBHOOK_SHARED_SECRET;
  const receivedSecret = req.headers["x-webhook-secret"] || req.headers["x-webhook-token"];

  if (expectedSecret && receivedSecret !== expectedSecret) {
    logger.error("Rejected airtime webhook due to invalid secret", receivedSecret);
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  const { request_id: requestId, result_code: resultCode, result_desc: resultDesc, charge, account_balance } = req.body;
  if (!requestId) {
    logger.error("Airtime webhook missing request_id", req.body);
    return res.status(400).json({ error: "Missing request_id" });
  }

  const transaction = await prisma.transaction.findFirst({ where: { airtimeProviderRef: requestId } });
  if (!transaction) {
    logger.error("Airtime webhook for unknown transaction", requestId);
    return res.status(404).json({ error: "Transaction not found" });
  }

  const success = Number(resultCode) === 200;
  const status = success ? "AIRTIME_SENT" : "AIRTIME_FAILED";
  const updateData = {
    status,
    failureReason: success ? null : resultDesc || "Airtime webhook reported failure",
  };
  if (charge !== undefined) updateData.airtimeProviderRef = requestId;

  await prisma.transaction.update({ where: { id: transaction.id }, data: updateData });

  return res.json({ ok: true });
}

async function handleDuplicateClaim(claimReference) {
  const existing = await prisma.redeemedCode.findUnique({
    where: { code: claimReference },
    include: { transaction: true },
  });

  if (!existing || !existing.transaction) {
    return { message: "This M-Pesa claim has already been used." };
  }

  const transaction = existing.transaction;
  let note = "This M-Pesa claim has already been used.";
  if (transaction.status === "AIRTIME_FAILED") {
    note = "Payment succeeded but airtime delivery failed. Retry using the returned transactionId.";
  } else if (transaction.status === "PAYMENT_RECEIVED") {
    note = "Payment succeeded but airtime delivery is still pending.";
  } else if (transaction.status === "AIRTIME_SENT") {
    note = "Airtime has already been sent for this claim.";
  } else if (transaction.status === "PENDING_PAYMENT") {
    note = "Payment is still pending confirmation.";
  } else if (transaction.status === "PAYMENT_FAILED") {
    note = "The payment for this claim failed.";
  }

  return {
    message: "This M-Pesa claim has already been used.",
    transactionId: transaction.id,
    status: transaction.status,
    failureReason: transaction.failureReason,
    note,
  };
}

async function redeemPayment(req, res) {
  const { mpesaText, phone, amount } = req.body;
  if (!mpesaText || typeof mpesaText !== "string") {
    return res.status(400).json({ error: "mpesaText is required" });
  }

  let parsed;
  try {
    parsed = mpesa.parseMpesaClaimInput({ mpesaText, phone, amount });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const amountValue = Number(parsed.amount);
  if (!Number.isFinite(amountValue) || amountValue < MIN_AMOUNT || amountValue > MAX_AMOUNT) {
    return res.status(400).json({ error: `amount must be between ${MIN_AMOUNT} and ${MAX_AMOUNT}` });
  }

  const candidatePhone = parsed.phone || phone;
  if (!candidatePhone) {
    return res.status(400).json({ error: "Could not parse a phone number from the message. Please include a phone number as well." });
  }

  let normalizedPhone;
  try {
    normalizedPhone = mpesa.normalizePhone(candidatePhone);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const claimReference = parsed.claimReference;
  let transaction = null;

  if (claimReference) {
    try {
      transaction = await prisma.$transaction(async (tx) => {
        await tx.redeemedCode.create({
          data: { code: claimReference, amount: amountValue, phoneNumber: normalizedPhone },
        });

        const createdTransaction = await tx.transaction.create({
          data: {
            phoneNumber: normalizedPhone,
            amount: amountValue,
            status: "PAYMENT_RECEIVED",
            mpesaReceiptNumber: claimReference,
            payerPhoneNumber: normalizedPhone,
          },
        });

        await tx.redeemedCode.update({
          where: { code: claimReference },
          data: { transactionId: createdTransaction.id, redeemedAt: new Date() },
        });

        return createdTransaction;
      });
    } catch (err) {
      if (err && err.code === "P2002") {
        const duplicate = await handleDuplicateClaim(claimReference);
        return res.status(409).json({
          success: false,
          error: duplicate.message,
          transactionId: duplicate.transactionId,
          status: duplicate.status,
          failureReason: duplicate.failureReason,
          note: duplicate.note,
        });
      }
      throw err;
    }
  } else {
    transaction = await prisma.transaction.create({
      data: {
        phoneNumber: normalizedPhone,
        amount: amountValue,
        status: "PAYMENT_RECEIVED",
        payerPhoneNumber: normalizedPhone,
      },
    });
  }

  try {
    const result = await airtime.sendAirtime({ phone: normalizedPhone, amount: amountValue });
    if (result.success) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: "AIRTIME_SENT", airtimeProviderRef: result.providerRef, failureReason: null },
      });
      return res.json({ success: true, message: "Airtime redeemed and sent successfully.", transactionId: transaction.id });
    }

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: "AIRTIME_FAILED", failureReason: result.error || "Airtime delivery failed" },
    });
    return res.status(502).json({
      success: false,
      error: result.error || "Airtime delivery failed",
      transactionId: transaction.id,
    });
  } catch (err) {
    logger.error("Airtime redemption threw", err.message || err);
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: "AIRTIME_FAILED", failureReason: err.message || "Airtime redemption failed" },
    });
    return res.status(500).json({ error: "Airtime redemption failed", transactionId: transaction.id });
  }
}

module.exports = { initiate, callback, status, retryAirtime, airtimeWebhook, redeemPayment };
