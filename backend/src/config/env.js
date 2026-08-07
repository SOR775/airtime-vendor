require("dotenv").config();

function required(name) {
  const val = process.env[name];
  if (!val && process.env.NODE_ENV !== "test") {
    // Warn instead of crashing so the scaffold still boots before you've
    // filled in real credentials -- but you'll hit errors the moment you
    // actually try to call M-Pesa or the airtime provider.
    console.warn(`[config] WARNING: env var ${name} is not set`);
  }
  return val;
}

module.exports = {
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || "development",
  appBaseUrl: process.env.APP_BASE_URL,

  darajaEnv: process.env.DARAJA_ENV || "sandbox",
  darajaConsumerKey: required("DARAJA_CONSUMER_KEY"),
  darajaConsumerSecret: required("DARAJA_CONSUMER_SECRET"),
  darajaShortcode: process.env.DARAJA_SHORTCODE || "174379",
  darajaPasskey: required("DARAJA_PASSKEY"),
  darajaCallbackUrl: process.env.DARAJA_CALLBACK_URL,

  airtimeProvider: process.env.AIRTIME_PROVIDER || "africastalking",
  airtimeApiKey: required("AIRTIME_API_KEY"),
  airtimeApiSecret: process.env.AIRTIME_API_SECRET,
  airtimeUsername: process.env.AIRTIME_USERNAME,
  airtimeBaseUrl: process.env.AIRTIME_BASE_URL,

  jwtSecret: process.env.JWT_SECRET,
  webhookSharedSecret: process.env.WEBHOOK_SHARED_SECRET,
  
  // Minimum amount supported by the configured airtime provider. If a
  // requested amount is lower during development, the service may fall
  // back to the mock provider to avoid provider validation errors.
  airtimeMinAmount: Number(process.env.AIRTIME_MIN_AMOUNT || 5),

  // Artificial intelligence service
  claudeApiKey: process.env.CLAUDE_API_KEY,
  claudeModel: process.env.CLAUDE_MODEL || "claude-3.5-mini",
};
