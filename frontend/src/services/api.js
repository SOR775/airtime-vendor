import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export async function initiatePayment(phone, amount) {
  const { data } = await api.post("/payments/initiate", { phone, amount });
  return data; // { transactionId, message }
}

export async function getTransactionStatus(transactionId) {
  const { data } = await api.get(`/payments/${transactionId}/status`);
  return data; // { id, status, amount, phoneNumber, failureReason }
}

export async function redeemPayment(mpesaText, phone) {
  const { data } = await api.post("/payments/redeem", { mpesaText, phone });
  return data; // { success, message, transactionId }
}
