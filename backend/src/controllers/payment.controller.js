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
  const { phone, amount } = req.body;

  if (!phone || !amount) {
    return res.status(400).json({ error: "phone and amount are required" });
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < MIN_AMOUNT || amt > MAX_AMOUNT) {
    return res.status(400).json({ error: `amount must be between ${MIN_AMOUNT} and ${MAX_AMOUNT}` });
  }

  let normalizedPhone;
  try {
    normalizedPhone = mpesa.normalizePhone(phone);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const transaction = await prisma.transaction.create({
    data: { phoneNumber: normalizedPhone, amount: amt },
  });

  try {
    const stkResponse = await mpesa.initiateSTKPush({
      phone: normalizedPhone,
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

    return res.status(202).json({
      transactionId: transaction.id,
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
  // Always ack Safaricom immediately so they don't retry the callback --
  // do the real work after, and log heavily since this endpoint is your
  // only signal that money actually moved.
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  let parsed;
  try {
    parsed = mpesa.parseStkCallback(req.body);
  } catch (err) {
    logger.error("Could not parse STK callback", req.body);
    return;
  }

  const transaction = await prisma.transaction.findUnique({
    where: { checkoutRequestId: parsed.checkoutRequestId },
  });
  if (!transaction) {
    logger.error("Callback for unknown transaction", parsed.checkoutRequestId);
    return;
  }

  if (!parsed.success) {
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: "PAYMENT_FAILED", failureReason: parsed.resultDesc },
    });
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
}

/**
 * GET /api/payments/:id/status
 * Frontend polls this after initiate() to show the customer live progress.
 */
async function status(req, res) {
  const transaction = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!transaction) return res.status(404).json({ error: "Transaction not found" });

  return res.json({
    id: transaction.id,
    status: transaction.status,
    amount: transaction.amount,
    phoneNumber: transaction.phoneNumber,
    failureReason: transaction.failureReason,
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

  let transaction = null;
  const claimReference = parsed.claimReference;
  if (claimReference) {
    transaction = await prisma.transaction.findFirst({ where: { mpesaReceiptNumber: claimReference } });
    if (transaction) {
      return res.status(409).json({ success: false, error: "This M-Pesa claim has already been used.", transactionId: transaction.id });
    }
  }

  if (!transaction) {
    transaction = await prisma.transaction.create({
      data: {
        phoneNumber: normalizedPhone,
        amount: amountValue,
        status: "PAYMENT_RECEIVED",
        mpesaReceiptNumber: claimReference,
        payerPhoneNumber: normalizedPhone,
      },
    });
  } else {
    if (transaction.status === "AIRTIME_SENT") {
      return res.json({ success: true, message: "Airtime was already delivered for this payment.", transactionId: transaction.id });
    }
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: "PAYMENT_RECEIVED",
        mpesaReceiptNumber: claimReference || transaction.mpesaReceiptNumber,
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
      data: { status: "AIRTIME_FAILED", failureReason: result.error },
    });
    return res.status(502).json({ success: false, error: result.error || "Airtime delivery failed", transactionId: transaction.id });
  } catch (err) {
    logger.error("Airtime redemption threw", err.message || err);
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: "AIRTIME_FAILED", failureReason: err.message || "Airtime redemption failed" },
    });
    return res.status(500).json({ error: "Airtime redemption failed" });
  }
}

module.exports = { initiate, callback, status, retryAirtime, airtimeWebhook, redeemPayment };
