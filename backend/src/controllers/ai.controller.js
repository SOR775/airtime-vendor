const aiService = require("../services/ai.service");
const mpesa = require("../services/mpesa.service");
const logger = require("../utils/logger");
const prisma = require("../config/db");

async function parseSms(req, res) {
  const { mpesaText, phone, amount } = req.body;
  if (!mpesaText) return res.status(400).json({ error: "mpesaText is required" });

  try {
    const ai = await aiService.parseSmsSuggestion(mpesaText, phone, amount);
    // Also run the authoritative heuristic parse to compare.
    let authoritative = null;
    try {
      authoritative = mpesa.parseMpesaClaimInput({ mpesaText, phone, amount });
    } catch (err) {
      authoritative = { error: err.message };
    }

    // Try to link to an existing transaction using the authoritative claimReference
    let linkedTransactionId = null;
    try {
      const claimRef = authoritative?.claimReference || null;
      if (claimRef) {
        const existing = await prisma.transaction.findFirst({ where: { mpesaReceiptNumber: claimRef } });
        if (existing) linkedTransactionId = existing.id;
      }
    } catch (err) {
      logger.error('Failed to lookup transaction for AI parse', err.message || err);
    }

    // Persist the AI parse for auditing
    try {
      await prisma.aiParse.create({ data: {
        mpesaText: mpesaText.slice(0, 2000),
        model: ai.model || null,
        suggestion: ai.suggestion || null,
        authoritative: authoritative || null,
        transactionId: linkedTransactionId,
      }});
    } catch (err) {
      logger.error('Failed to persist AI parse', err.message || err);
    }

    // Log both for ops visibility. Do NOT use AI suggestion for authorization.
    logger.info("AI parse requested", { ai: ai.suggestion || null, authoritative, linkedTransactionId });

    return res.json({ ai, authoritative, note: "AI suggests only; validate via Daraja/Stratum before redeeming." });
  } catch (err) {
    logger.error("AI parse failed", err.message || err);
    return res.status(500).json({ error: "AI parse failed" });
  }
}

async function chat(req, res) {
  const { message, transactionId } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  let transaction = null;
  if (transactionId) {
    try {
      transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
    } catch (err) {
      logger.warn("Failed to lookup transaction for support chat", err.message || err);
    }
  }

  try {
    const reply = await aiService.chat(message, transaction);
    return res.json({
      reply,
      transaction: transaction
        ? {
            id: transaction.id,
            status: transaction.status,
            amount: transaction.amount,
            phoneNumber: transaction.phoneNumber,
            failureReason: transaction.failureReason,
          }
        : null,
    });
  } catch (err) {
    logger.error("AI chat failed", err.message || err);
    const status = err.status || 500;
    const errorMessage = err.message || "AI chat failed";
    return res.status(status).json({ error: errorMessage });
  }
}

module.exports = { parseSms, chat };
