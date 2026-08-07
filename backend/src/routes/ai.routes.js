const express = require("express");
const controller = require("../controllers/ai.controller");

const router = express.Router();

router.post("/parse-sms", controller.parseSms);
router.post("/chat", controller.chat);

module.exports = router;
