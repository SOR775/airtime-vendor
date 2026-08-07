const express = require("express");
const controller = require("../controllers/admin.controller");

const router = express.Router();

router.get("/transactions", controller.listTransactions);
router.get("/transactions/:id", controller.getTransaction);
router.post("/transactions/:id/retrigger-airtime", controller.retriggerAirtime);
router.post("/transactions/:id/mark-resolved", controller.markResolved);
router.get("/ai-parses", controller.listAiParses);

module.exports = router;
