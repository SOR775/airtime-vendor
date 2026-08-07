const prisma = require("../config/db");
const airtime = require("../services/airtime.service");
const logger = require("../utils/logger");

async function listTransactions(req, res) {
  const { status, limit = 100 } = req.query;
  const where = {};
  if (status) where.status = status;

  const txs = await prisma.transaction.findMany({ where, orderBy: { createdAt: "desc" }, take: Number(limit) });
  return res.json(txs);
}

async function getTransaction(req, res) {
  const { id } = req.params;
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx) return res.status(404).json({ error: "Transaction not found" });
  return res.json(tx);
}

async function retriggerAirtime(req, res) {
  const { id } = req.params;
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx) return res.status(404).json({ error: "Transaction not found" });

  try {
    const result = await airtime.sendAirtime({ phone: tx.phoneNumber, amount: tx.amount });
    await prisma.transaction.update({ where: { id }, data: { airtimeProviderRef: result.providerRef || null, status: result.success ? "AIRTIME_SENT" : "AIRTIME_FAILED", failureReason: result.error || null } });
    return res.json({ success: result.success, raw: result.raw, error: result.error || null });
  } catch (err) {
    logger.error("Retrigger airtime failed", err.message || err);
    return res.status(500).json({ error: "Retrigger failed" });
  }
}

async function markResolved(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "status is required" });
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx) return res.status(404).json({ error: "Transaction not found" });
  await prisma.transaction.update({ where: { id }, data: { status } });
  return res.json({ ok: true });
}

async function listAiParses(req, res) {
  const { limit = 100 } = req.query;
  const records = await prisma.aiParse.findMany({
    orderBy: { createdAt: "desc" },
    take: Number(limit),
    include: {
      transaction: {
        select: { id: true, phoneNumber: true, amount: true, status: true },
      },
    },
  });
  return res.json(records);
}

module.exports = { listTransactions, getTransaction, retriggerAirtime, markResolved, listAiParses };
