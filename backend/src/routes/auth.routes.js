const express = require("express");
const controller = require("../controllers/auth.controller");

const router = express.Router();
// Two-step registration: initiate sends OTP, verify completes registration
router.post("/register", controller.initiateRegister);
router.post("/register/verify", controller.verifyRegister);
router.post("/login", controller.login);

module.exports = router;
