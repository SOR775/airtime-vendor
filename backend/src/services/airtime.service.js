const axios = require("axios");
const config = require("../config/env");
const { normalizePhone } = require("./mpesa.service");

/**
 * Every provider adapter must implement:
 *   sendAirtime({ phone, amount }) -> { success, providerRef, raw, error? }
 * This keeps payment.controller.js and everything downstream provider-agnostic --
 * switch AIRTIME_PROVIDER in .env and nothing else needs to change.
 */

async function sendViaMock({ phone, amount }) {
  const normalizedPhone = normalizePhone(phone);
  const providerRef = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    success: true,
    providerRef,
    raw: {
      provider: "mock",
      phoneNumber: normalizedPhone,
      amount,
      note: "Simulated delivery used because no real airtime provider credentials were configured.",
    },
    error: null,
  };
}

async function sendViaAfricasTalking({ phone, amount }) {
  const url = config.airtimeBaseUrl || "https://api.africastalking.com/version1/airtime/send";
  const phoneNumber = "+" + normalizePhone(phone);

  try {
    const { data } = await axios.post(
      url,
      new URLSearchParams({
        username: config.airtimeUsername,
        recipients: JSON.stringify([{ phoneNumber, amount: `KES ${amount}` }]),
      }),
      {
        headers: {
          apiKey: config.airtimeApiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      }
    );

    const result = data?.responses?.[0];
    const success = result?.status === "Sent";
    return {
      success,
      providerRef: result?.requestId || null,
      raw: data,
      error: success ? null : result?.errorMessage || "Unknown error from Africa's Talking",
    };
  } catch (err) {
    return { success: false, providerRef: null, raw: err.response?.data, error: err.message };
  }
}

async function sendViaStatum({ phone, amount }) {
  const base = config.airtimeBaseUrl || "https://api.statum.co.ke/api/v2";
  const cleaned = base.replace(/\/$/, "");
  const url = cleaned.endsWith("/airtime") ? cleaned : `${cleaned}/airtime`;
  const phoneNumber = normalizePhone(phone);

  const buildAuthHeaders = () => {
    const key = config.airtimeApiKey;
    const secret = config.airtimeApiSecret;
    const scheme = (process.env.AIRTIME_AUTH_SCHEME || "basic").toLowerCase();
    if (!key) return {};
    if (scheme === "x-api-key" || scheme === "x_api_key") return { "X-API-Key": key };
    if (scheme === "basic") {
      const raw = secret ? `${key}:${secret}` : key;
      const token = Buffer.from(raw).toString("base64");
      return { Authorization: `Basic ${token}` };
    }
    return { Authorization: `Bearer ${key}` };
  };

  const headers = { ...buildAuthHeaders(), "Content-Type": "application/json" };

  const maxAttempts = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const body = { phone_number: phoneNumber, amount: String(amount) };
      if (process.env.AIRTIME_DEBUG) {
        console.log("[airtime][statum] POST", url);
        console.log("[airtime][statum] headers:", headers);
        console.log("[airtime][statum] body:", body);
      }

      const { data } = await axios.post(url, body, { headers, timeout: 10000 });
      const success = data?.status_code === 200 || data?.status === "success" || data?.success === true;
      const providerRef = data?.request_id || data?.requestId || data?.transaction_id || data?.id || null;

      return {
        success: Boolean(success),
        providerRef: providerRef || null,
        raw: data,
        error: success ? null : data?.description || data?.message || data?.error || "Unknown error from Statum",
      };
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      if (status && status < 500) {
        break;
      }
      const wait = 200 * attempt;
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  return { success: false, providerRef: null, raw: lastErr?.response?.data || null, error: lastErr?.message || "Request to Statum failed" };
}

/**
 * Safaricom's own Bulk Airtime API (M-Pesa B2B/B2C style). Requires a
 * separate commercial agreement/approval from Safaricom beyond the
 * standard Daraja developer account -- placeholder until you have real
 * credentials & endpoint docs from your Safaricom account manager.
 */
async function sendViaSafaricomBulk({ phone, amount }) {
  throw new Error(
    "Safaricom Bulk Airtime API integration not yet implemented -- " +
      "requires credentials from your Safaricom account manager. " +
      "Use AIRTIME_PROVIDER=africastalking or statum in the meantime."
  );
}

const PROVIDERS = {
  mock: sendViaMock,
  africastalking: sendViaAfricasTalking,
  statum: sendViaStatum,
  safaricom_bulk: sendViaSafaricomBulk,
};

async function sendAirtime({ phone, amount }) {
  const providerName = (config.airtimeProvider || "mock").toLowerCase();
  // If the requested amount is below the provider's minimum, use mock
  // delivery in development to avoid provider-side validation errors
  // (e.g., Statum requires at least 5 KES). This keeps dev flow working
  // for small amounts while preventing unintended charges.
  if (Number(amount) < Number(config.airtimeMinAmount || 5)) {
    console.warn(`[airtime] Requested amount ${amount} is below provider minimum ${config.airtimeMinAmount}; using mock delivery.`);
    return sendViaMock({ phone, amount });
  }
  const shouldUseMock =
    providerName === "mock" ||
    (providerName === "africastalking" && (!config.airtimeUsername || !config.airtimeApiKey)) ||
    (providerName === "statum" && !config.airtimeApiKey) ||
    (config.nodeEnv !== "production" && (!config.airtimeApiKey || config.airtimeApiKey.includes("replace") || config.airtimeApiKey.includes("your_")));

  if (shouldUseMock) {
    console.warn(`[airtime] Using mock delivery for ${providerName} in ${config.nodeEnv} mode`);
    return sendViaMock({ phone, amount });
  }

  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(`Unknown AIRTIME_PROVIDER "${config.airtimeProvider}"`);
  }
  return provider({ phone, amount });
}

module.exports = { sendAirtime };
