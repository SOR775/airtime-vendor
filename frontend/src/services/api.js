import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export async function initiatePayment(recipientPhone, amount, buyerPhone) {
  const { data } = await api.post("/payments/initiate", { recipientPhone, buyerPhone, amount });
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

export async function retryAirtime(transactionId) {
  const { data } = await api.post(`/payments/${transactionId}/retry-airtime`);
  return data;
}

export async function supportChat(message, transactionId) {
  const { data } = await api.post(`/ai/chat`, { message, transactionId });
  return data; // { reply, transaction }
}
