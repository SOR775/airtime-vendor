const axios = require("axios");
const config = require("../config/env");

const BASE_URL =
  config.darajaEnv === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

let cachedToken = null;
let cachedTokenExpiry = 0;

/**
 * Get (and cache) an OAuth access token from Safaricom.
 * Tokens are valid for ~1 hour; we refresh a little early to be safe.
 */
async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry) {
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${config.darajaConsumerKey}:${config.darajaConsumerSecret}`
  ).toString("base64");

  const { data } = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  cachedToken = data.access_token;
  // expires_in is in seconds; refresh 60s before actual expiry
  cachedTokenExpiry = Date.now() + (Number(data.expires_in) - 60) * 1000;
  return cachedToken;
}

function timestampNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function buildPassword(timestamp) {
  const raw = `${config.darajaShortcode}${config.darajaPasskey}${timestamp}`;
  return Buffer.from(raw).toString("base64");
}

/**
 * Normalize a Kenyan phone number to the 2547XXXXXXXX format Daraja expects.
 * Accepts 07XXXXXXXX, 01XXXXXXXX, 2547XXXXXXXX, +2547XXXXXXXX.
 */
function normalizePhone(phone) {
  let p = String(phone).trim().replace(/\s+/g, "").replace(/^\+/, "");
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (!p.startsWith("254")) {
    throw new Error(`Unrecognized phone number format: ${phone}`);
  }
  return p;
}

function parseMpesaSms(text) {
  if (!text || typeof text !== "string") {
    throw new Error("MPesa message text is required.");
  }

  const normalized = text.replace(/\r\n/g, "\n");
  const amountMatch = normalized.match(/\b(?:KES|Ksh|Kshs|Shs?)\s*\.?(?:\s|-)?([0-9,]+(?:\.[0-9]{1,2})?)\b/i)
    || normalized.match(/\b([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:KES|Ksh|Kshs|Shs?)\b/i)
    || normalized.match(/\b(?:KES|Ksh|Kshs|Shs?)?\s*([0-9,]+(?:\.[0-9]{1,2})?)\b/i)
    || normalized.match(/\b([0-9,]+(?:\.[0-9]{1,2})?)\b/i)
    || normalized.match(/(?:^|\s)([0-9,]+(?:\.[0-9]{1,2})?)(?:\s|$)/i);
  const receiptMatch = normalized.match(/(?:Receipt(?:\s*No\.?| No| Number|:)|Ref(?:erence)?|Transaction(?: ID)?|Trans(?:action)? ID|TID)\s*[:#-]?\s*([A-Z0-9_-]{2,})/i)
    || normalized.match(/\b([A-Z0-9_-]{2,})\b(?=.*\b(?:receipt|reference|transaction|trans id|tid)\b)/i);
  const phoneMatch = normalized.match(/(\+2547\d{8}|2547\d{8}|07\d{8})/g);

  if (!amountMatch) {
    throw new Error("Could not parse the amount from the MPesa message.");
  }

  const amount = Number(amountMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(amount)) {
    throw new Error("Could not parse the amount from the MPesa message.");
  }

  return {
    amount,
    receipt: receiptMatch?.[1] || null,
    phone: phoneMatch?.[0] || null,
  };
}

function buildClaimReference({ receipt, text, amount, phone }) {
  const normalizedReceipt = String(receipt || "").trim().toUpperCase();
  if (normalizedReceipt) {
    return `receipt:${normalizedReceipt}`;
  }

  const fingerprint = [String(text || "").trim(), String(amount || ""), String(phone || "")]
    .filter(Boolean)
    .join("::");
  return `msg:${Buffer.from(fingerprint).toString("base64")}`;
}

function parseMpesaClaimInput({ mpesaText, phone, amount }) {
  if (typeof mpesaText === "string" && mpesaText.trim()) {
    const trimmed = mpesaText.trim();
    const amountOnlyMatch = trimmed.match(/^(?:KES|Ksh|Kshs|Shs?)\s*\.?(?:\s|-)?([0-9,]+(?:\.[0-9]{1,2})?)$/i)
      || trimmed.match(/^([0-9,]+(?:\.[0-9]{1,2})?)$/);

    if (amountOnlyMatch) {
      const normalizedAmount = Number(amountOnlyMatch[1].replace(/,/g, ""));
      if (!Number.isFinite(normalizedAmount)) {
        throw new Error("Could not parse the amount from the MPesa message.");
      }
      return {
        amount: normalizedAmount,
        receipt: null,
        phone: phone || null,
        claimReference: buildClaimReference({ receipt: null, text: trimmed, amount: normalizedAmount, phone: phone || null }),
      };
    }

    const looksLikeReceipt = /^[A-Za-z0-9_-]{3,}$/i.test(trimmed);

    if (looksLikeReceipt) {
      const normalizedAmount = Number(amount);
      if (!Number.isFinite(normalizedAmount)) {
        throw new Error("Could not parse the amount from the MPesa message.");
      }
      return {
        amount: normalizedAmount,
        receipt: trimmed,
        phone: phone || null,
        claimReference: buildClaimReference({ receipt: trimmed, text: trimmed, amount: normalizedAmount, phone: phone || null }),
      };
    }

    const parsed = parseMpesaSms(trimmed);
    return {
      amount: parsed.amount,
      receipt: parsed.receipt,
      phone: parsed.phone || phone || null,
      claimReference: buildClaimReference({ receipt: parsed.receipt, text: trimmed, amount: parsed.amount, phone: parsed.phone || phone || null }),
    };
  }

  if (!mpesaText || typeof mpesaText !== "string") {
    throw new Error("MPesa message text is required.");
  }

  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount)) {
    throw new Error("Could not parse the amount from the MPesa message.");
  }

  const normalizedPhone = phone || null;
  return {
    amount: normalizedAmount,
    receipt: mpesaText.trim(),
    phone: normalizedPhone,
    claimReference: buildClaimReference({ receipt: mpesaText.trim(), text: mpesaText.trim(), amount: normalizedAmount, phone: normalizedPhone }),
  };
}

/**
 * Initiate an STK Push (Lipa Na M-Pesa Online) prompt on the customer's
 * phone. Returns Safaricom's immediate response, which includes
 * CheckoutRequestID -- store this so you can match the later callback
 * (or a status query) back to this transaction.
 *
 * accountReference / transactionDesc show up on the customer's phone
 * prompt and in your Daraja dashboard -- keep them short and meaningful,
 * e.g. the transaction id.
 */
async function initiateSTKPush({ phone, amount, accountReference, transactionDesc }) {
  const token = await getAccessToken();
  const timestamp = timestampNow();
  const password = buildPassword(timestamp);
  const normalizedPhone = normalizePhone(phone);

  const payload = {
    BusinessShortCode: config.darajaShortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(amount),
    PartyA: normalizedPhone,
    PartyB: config.darajaShortcode,
    PhoneNumber: normalizedPhone,
    CallBackURL: config.darajaCallbackUrl,
    AccountReference: accountReference.slice(0, 12), // Daraja limits this field's length
    TransactionDesc: transactionDesc.slice(0, 13),
  };

  const { data } = await axios.post(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!data || Number(data.ResponseCode) !== 0) {
    throw new Error(`STK push failed: ${data?.ResponseDescription || JSON.stringify(data)}`);
  }

  // data looks like:
  // { MerchantRequestID, CheckoutRequestID, ResponseCode, ResponseDescription, CustomerMessage }
  return data;
}

/**
 * Parse the payload Safaricom POSTs to your CallBackURL once the customer
 * completes (or cancels/fails) the STK prompt. Shape:
 *
 * { Body: { stkCallback: {
 *     MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc,
 *     CallbackMetadata: { Item: [ {Name:'Amount',Value}, {Name:'MpesaReceiptNumber',Value}, ... ] }
 * }}}
 */
function parseStkCallback(body) {
  const cb = body?.Body?.stkCallback;
  if (!cb) throw new Error("Malformed STK callback payload");

  const success = cb.ResultCode === 0;
  const items = cb.CallbackMetadata?.Item || [];
  const getItem = (name) => items.find((i) => i.Name === name)?.Value;

  return {
    merchantRequestId: cb.MerchantRequestID,
    checkoutRequestId: cb.CheckoutRequestID,
    success,
    resultDesc: cb.ResultDesc,
    amount: success ? getItem("Amount") : null,
    mpesaReceiptNumber: success ? getItem("MpesaReceiptNumber") : null,
    payerPhoneNumber: success ? String(getItem("PhoneNumber")) : null,
    transactionDate: success ? getItem("TransactionDate") : null,
  };
}

module.exports = {
  getAccessToken,
  initiateSTKPush,
  parseStkCallback,
  normalizePhone,
  parseMpesaSms,
  parseMpesaClaimInput,
};
