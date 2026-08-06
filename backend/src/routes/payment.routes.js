const express = require("express");
const rateLimit = require("express-rate-limit");
const controller = require("../controllers/payment.controller");

const router = express.Router();

// Prevent someone from hammering the STK push endpoint (each call costs you
// a Daraja API request and spams the target phone with prompts).
const initiateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Too many requests, please wait a moment and try again." },
});

router.post("/initiate", initiateLimiter, controller.initiate);
router.post("/callback", controller.callback); // Safaricom calls this, not the browser
router.post("/airtime-webhook", controller.airtimeWebhook); // Statum async delivery callbacks
router.post("/redeem", controller.redeemPayment);
router.get("/:id/status", controller.status);
// Admin/manual retry for airtime delivery after payment succeeded but delivery failed
router.post("/:id/retry-airtime", controller.retryAirtime);

module.exports = router;
