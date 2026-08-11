import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
});

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export async function login(username, password) {
  const { data } = await api.post("/auth/login", { username, password });
  return data; // { token, user }
}

export async function initiateRegister(username, password) {
  const { data } = await api.post("/auth/register", { username, password });
  return data; // { message, otp? }
}

export async function verifyRegister(username, code) {
  const { data } = await api.post("/auth/register/verify", { username, code });
  return data; // { token, user }
}

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
