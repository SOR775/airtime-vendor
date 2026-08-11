import { useEffect, useRef, useState } from "react";
import { initiatePayment, getTransactionStatus, redeemPayment, retryAirtime, login as apiLogin, initiateRegister as apiInitiateRegister, verifyRegister as apiVerifyRegister, setAuthToken } from "./services/api";
import AdminReviewPage from "./pages/AdminReview.jsx";
import SupportChat from "./pages/SupportChat.jsx";
import Logo from "./components/Logo.jsx";

const TERMINAL_STATUSES = ["AIRTIME_SENT", "AIRTIME_FAILED", "PAYMENT_FAILED", "REFUNDED"];
const STATUS_COPY = {
  PENDING_PAYMENT: "Waiting for M-Pesa confirmation. If you already completed the payment prompt, your backend callback may still be pending.",
  PAYMENT_RECEIVED: "Payment completed. Delivering airtime to your number now.",
  AIRTIME_SENT: "Airtime landed successfully. Your phone is topped up!",
  AIRTIME_FAILED: "Payment succeeded but airtime delivery failed. Please try again or contact support.",
  PAYMENT_FAILED: "Payment was not completed. Please retry the payment.",
  REFUNDED: "This transaction has been refunded.",
};
const STATUS_STEP = {
  PENDING_PAYMENT: 1,
  PAYMENT_RECEIVED: 2,
  AIRTIME_SENT: 3,
  AIRTIME_FAILED: 3,
  PAYMENT_FAILED: 1,
  REFUNDED: 3,
};

/* ── Style layer ──
   Two parts: (1) a small design-system (`.air-shell`, `.air-card`,
   `.btn-primary`, `.field`, ...) so repeated patterns stay consistent,
   and (2) the custom animation keyframes. The `animate-*` utilities are
   NOT Tailwind classes, so they are defined here; prefer moving the
   shared pieces to a global stylesheet / tailwind.config.js if you
   standardize them across the app. */
const STYLES = `
  /* ── Design system ── */
  .air-shell {
    min-height: 100vh;
    background:
      radial-gradient(60rem 30rem at 85% -10%, rgba(45, 212, 191, 0.10), transparent 60%),
      radial-gradient(50rem 26rem at -10% 10%, rgba(16, 185, 129, 0.08), transparent 55%),
      #f1f5f9;
  }
  .air-card {
    border-radius: 28px;
    border: 1px solid rgba(15, 23, 42, 0.08);
    background: #ffffff;
    box-shadow: 0 12px 40px -18px rgba(15, 23, 42, 0.16);
  }
  .air-kicker {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.26em;
    text-transform: uppercase;
    color: #0d9488;
  }
  .btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border-radius: 9999px;
    padding: 0.85rem 1.5rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: #ffffff;
    background: linear-gradient(135deg, #0d9488, #059669);
    box-shadow: 0 10px 24px -10px rgba(13, 148, 136, 0.55);
    transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
  }
  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 14px 30px -10px rgba(13, 148, 136, 0.6);
    filter: brightness(1.04);
  }
  .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn-ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    border: 1px solid rgba(15, 23, 42, 0.12);
    background: #ffffff;
    padding: 0.7rem 1.25rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #334155;
    transition: background 0.2s ease, border-color 0.2s ease;
  }
  .btn-ghost:hover { background: #f8fafc; border-color: rgba(15, 23, 42, 0.22); }
  .btn-dark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border-radius: 9999px;
    padding: 0.7rem 1.25rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #ffffff;
    background: #0f172a;
    transition: background 0.2s ease, transform 0.2s ease;
  }
  .btn-dark:hover { background: #1e293b; }
  .field {
    width: 100%;
    border-radius: 18px;
    border: 1px solid rgba(15, 23, 42, 0.14);
    background: #ffffff;
    padding: 0.8rem 1rem;
    font-size: 0.95rem;
    color: #0f172a;
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .field::placeholder { color: #94a3b8; }
  .field:focus { border-color: #14b8a6; box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.15); }
  .nav-pill {
    border-radius: 9999px;
    padding: 0.55rem 1.1rem;
    font-size: 0.85rem;
    font-weight: 600;
    transition: all 0.2s ease;
  }

  /* ── Custom animation keyframes ── */
  @keyframes credit-fly {
    0%   { transform: translateY(0) scale(.5); opacity: 0; }
    15%  { opacity: 1; }
    25%  { transform: translateY(-14px) scale(1.05); }
    85%  { opacity: 1; }
    100% { transform: translateY(-150px) scale(.92); opacity: 0; }
  }
  .animate-credit-fly { animation: credit-fly 1.7s cubic-bezier(.4,0,.2,1) infinite; }

  @keyframes bounce-slow {
    0%, 100% { transform: translateY(0); opacity: .45; }
    50%      { transform: translateY(-9px); opacity: 1; }
  }
  .animate-bounce-slow { animation: bounce-slow 1.5s ease-in-out infinite; }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
    20%, 40%, 60%, 80%      { transform: translateX(5px); }
  }
  .animate-shake { animation: shake .55s ease-in-out 2; }

  @keyframes progress-slide {
    0%   { transform: translateX(-110%); }
    100% { transform: translateX(310%); }
  }
  .animate-progress-slide { animation: progress-slide 1.3s ease-in-out infinite; }

  @keyframes pop-in {
    0%   { transform: scale(0); }
    70%  { transform: scale(1.18); }
    100% { transform: scale(1); }
  }
  .animate-pop-in { animation: pop-in .5s cubic-bezier(.16,1,.3,1) both; }

  @keyframes fade-in-up {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .animate-fade-in-up { animation: fade-in-up .45s cubic-bezier(.16,1,.3,1) both; }

  @keyframes modal-in {
    from { opacity: 0; transform: translateY(10px) scale(.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .animate-modal-in { animation: modal-in .3s cubic-bezier(.16,1,.3,1) both; }

  @keyframes toast-in {
    from { opacity: 0; transform: translateX(24px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  .animate-toast-in { animation: toast-in .3s cubic-bezier(.16,1,.3,1) both; }

  @media (prefers-reduced-motion: reduce) {
    .animate-credit-fly,
    .animate-bounce-slow,
    .animate-shake,
    .animate-progress-slide,
    .animate-pop-in,
    .animate-fade-in-up,
    .animate-modal-in,
    .animate-toast-in {
      animation: none !important;
    }
  }
`;

/* Small helper for the status pill shown in the "Latest transaction" card.
   Colors carry meaning: waiting = amber, processing = teal, success = green,
   failure = red, refunded = neutral. */
function statusPillClass(status) {
  if (!status) return "bg-slate-100 text-slate-600 ring-slate-200";
  if (status === "PENDING_PAYMENT") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "PAYMENT_RECEIVED") return "bg-teal-50 text-teal-700 ring-teal-200";
  if (status === "AIRTIME_SENT") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "REFUNDED") return "bg-slate-100 text-slate-600 ring-slate-300";
  return "bg-red-50 text-red-700 ring-red-200"; // AIRTIME_FAILED / PAYMENT_FAILED
}

export default function App() {
  const [recipientPhone, setRecipientPhone] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [transactionId, setTransactionId] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [redeemMode, setRedeemMode] = useState(false);
  const [latestTransaction, setLatestTransaction] = useState(null);
  const VIEWS = {
    HOME: "home",
    BUY: "buy",
    REDEEM: "redeem",
    SUPPORT: "support",
    ADMIN: "admin",
    ABOUT: "about",
    LOGIN: "login",
  };
  const [token, setToken] = useState(() => localStorage.getItem("airtimee-token") || "");
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(localStorage.getItem("airtimee-token")));
  const [user, setUser] = useState(() => localStorage.getItem("airtimee-user") || "");
  const [view, setView] = useState(() => {
    const path = window.location.pathname;
    const requestedView = path === "/admin" ? VIEWS.ADMIN : path === "/support" ? VIEWS.SUPPORT : path === "/about" ? VIEWS.ABOUT : path === "/login" ? VIEWS.LOGIN : VIEWS.HOME;
    return Boolean(localStorage.getItem("airtimee-token")) ? requestedView : VIEWS.LOGIN;
  });

  useEffect(() => {
    if (!isAuthenticated && view !== VIEWS.LOGIN) {
      setView(VIEWS.LOGIN);
      window.history.replaceState(null, "", "/login");
    }
  }, [isAuthenticated, view]);
  const isHome = view === VIEWS.HOME;
  const isBuy = view === VIEWS.BUY;
  const isRedeem = view === VIEWS.REDEEM;
  const isSupport = view === VIEWS.SUPPORT;
  const isAbout = view === VIEWS.ABOUT;
  const isAdmin = view === VIEWS.ADMIN;
  const isLogin = view === VIEWS.LOGIN;
  const [loginError, setLoginError] = useState(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [pendingOtp, setPendingOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [registerPendingEmail, setRegisterPendingEmail] = useState("");
  const [registerPendingPassword, setRegisterPendingPassword] = useState("");
  const [mpesaText, setMpesaText] = useState("");
  const [redeemResult, setRedeemResult] = useState(null);
  const [redeemPhone, setRedeemPhone] = useState("");
  const [notification, setNotification] = useState(null);
  const [retryMessage, setRetryMessage] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const pollRef = useRef(null);
  const notificationTimeoutRef = useRef(null);
  const prevStatusRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const storedToken = localStorage.getItem("airtimee-token");
    if (storedToken) {
      setAuthToken(storedToken);
    }
    return () => {
      mountedRef.current = false;
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);

  function showNotification({ type, message }) {
    if (!mountedRef.current) return;
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    setNotification({ type, message });
    notificationTimeoutRef.current = window.setTimeout(() => {
      if (mountedRef.current) setNotification(null);
      notificationTimeoutRef.current = null;
    }, 4500);
  }

  function getLatestTransactionKey(userKey) {
    return `airtimee-latest-transaction-${userKey || "guest"}`;
  }

  function loadLatestTransaction(userKey) {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(getLatestTransactionKey(userKey));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function persistLatestTransaction(transaction) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(getLatestTransactionKey(user), JSON.stringify(transaction));
    } catch {
      // ignore localStorage failures
    }
  }

  function makeLatestTransaction({ id, amount, recipientPhone, buyerPhone, status, payerPhoneNumber, createdAt, updatedAt, type }) {
    return {
      id,
      amount: amount ?? 0,
      recipientPhone: recipientPhone || "",
      buyerPhone: buyerPhone || "",
      payerPhoneNumber: payerPhoneNumber || "",
      status,
      type: type || (buyerPhone ? "other" : "self"),
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: updatedAt || new Date().toISOString(),
    };
  }

  function saveLatestTransaction(transaction) {
    setLatestTransaction(transaction);
    persistLatestTransaction(transaction);
  }

  useEffect(() => {
    setLatestTransaction(loadLatestTransaction(user));
  }, [user]);

  async function handleLogin(username, password) {
    setLoginError(null);
    setLoginSubmitting(true);
    if (!username.trim() || !password.trim()) {
      setLoginError("Username and password are required.");
      setLoginSubmitting(false);
      return;
    }

    try {
      const data = await apiLogin(username.trim(), password);
      const tokenValue = data.token;
      localStorage.setItem("airtimee-token", tokenValue);
      localStorage.setItem("airtimee-user", data.user.username);
      setAuthToken(tokenValue);
      setToken(tokenValue);
      setUser(data.user.username);
      setIsAuthenticated(true);
      setView(VIEWS.HOME);
    } catch (err) {
      const errorMessage = err.response?.data?.error || "Invalid username or password.";
      setLoginError(errorMessage);
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function handleRegister(username, password) {
    // Two-step: (1) initiateRegister -> sends OTP (or returns dev OTP), (2) verifyRegister -> returns token
    setLoginError(null);
    setLoginSubmitting(true);
    if (!username.trim() || !password.trim()) {
      setLoginError("Username and password are required.");
      setLoginSubmitting(false);
      return;
    }

    try {
      const data = await apiInitiateRegister(username.trim(), password);
      setRegisterPendingEmail(username.trim());
      setRegisterPendingPassword(password);
      if (data.otp) {
        setOtpCode(String(data.otp));
        showNotification({ type: "info", message: `Dev OTP: ${data.otp}` });
      }
      setPendingOtp(true);
    } catch (err) {
      const errorMessage = err.response?.data?.error || "Could not initiate registration.";
      setLoginError(errorMessage);
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function handleVerifyOtp() {
    setLoginError(null);
    setLoginSubmitting(true);
    try {
      const data = await apiVerifyRegister(registerPendingEmail, otpCode);
      const tokenValue = data.token;
      localStorage.setItem("airtimee-token", tokenValue);
      localStorage.setItem("airtimee-user", data.user.username);
      setAuthToken(tokenValue);
      setToken(tokenValue);
      setUser(data.user.username);
      setIsAuthenticated(true);
      setPendingOtp(false);
      setRegisterPendingEmail("");
      setRegisterPendingPassword("");
      setOtpCode("");
      setView(VIEWS.HOME);
    } catch (err) {
      const errorMessage = err.response?.data?.error || "Invalid OTP code.";
      setLoginError(errorMessage);
    } finally {
      setLoginSubmitting(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("airtimee-token");
    localStorage.removeItem("airtimee-user");
    setAuthToken(null);
    setToken("");
    setIsAuthenticated(false);
    setUser("");
    setView(VIEWS.LOGIN);
    window.history.pushState(null, "", "/login");
  }

  function handleNavigate(nextView) {
    if (!isAuthenticated && nextView !== VIEWS.LOGIN) {
      setView(VIEWS.LOGIN);
      window.history.pushState(null, "", "/login");
      return;
    }

    setView(nextView);
    if (nextView === VIEWS.REDEEM) {
      setRedeemMode(true);
    } else if (nextView === VIEWS.BUY || nextView === VIEWS.HOME || nextView === VIEWS.ABOUT || nextView === VIEWS.SUPPORT || nextView === VIEWS.ADMIN) {
      setRedeemMode(false);
    }
    const path = nextView === VIEWS.SUPPORT ? "/support" : nextView === VIEWS.ABOUT ? "/about" : nextView === VIEWS.ADMIN ? "/admin" : nextView === VIEWS.LOGIN ? "/login" : "/";
    window.history.pushState(null, "", path);
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const amountValue = Number(amount);
    if (!recipientPhone.trim() || !Number.isFinite(amountValue) || amountValue < 5) {
      setError("Please enter a valid recipient phone number and an amount of at least KES 5.");
      return;
    }

    setShowConfirm(true);
  }

  async function confirmPayment() {
    setShowConfirm(false);
    setSubmitting(true);
    setError(null);

    try {
      const res = await initiatePayment(recipientPhone, Number(amount), buyerPhone.trim() || undefined);
      // Tolerate both camelCase and snake_case API contracts.
      const id = res.transactionId ?? res.transaction_id;
      if (!id) {
        setError("Server did not return a transaction ID.");
        return;
      }
      if (!mountedRef.current) return;
      showNotification({ type: "success", message: "M-Pesa prompt sent. Approve it on your phone to complete payment." });
      // Persist a latest transaction summary for this user.
      saveLatestTransaction(
        makeLatestTransaction({
          id,
          amount: Number(amount),
          recipientPhone: recipientPhone.trim(),
          buyerPhone: buyerPhone.trim(),
          status: "PENDING_PAYMENT",
          type: buyerPhone.trim() ? "other" : "self",
        })
      );
      // Use the top-level state and polling effects to monitor status.
      setTransactionId(id);
      setStatus("PENDING_PAYMENT");
    } catch (err) {
      if (!mountedRef.current) return;
      const errorMessage = err.response?.data?.error || "Something went wrong. Please try again.";
      setError(errorMessage);
      showNotification({ type: "error", message: errorMessage });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }

  async function handleRedeem(e) {
    e.preventDefault();
    setError(null);
    setRedeemResult(null);
    setSubmitting(true);

    try {
      const data = await redeemPayment(mpesaText, redeemPhone.trim() || undefined);
      if (!mountedRef.current) return;
      setRedeemResult(data);
      const successMessage = data.success ? "Redeem succeeded. Airtime is being processed." : "Redeem request received.";
      showNotification({ type: data.success ? "success" : "info", message: successMessage });
      // Tolerate both camelCase and snake_case API contracts.
      const id = data.transactionId ?? data.transaction_id;
      const responseStatus = data.status ?? data.transaction_status ?? null;
      if (id) {
        const latest = makeLatestTransaction({
          id,
          amount: data.amount ?? 0,
          recipientPhone: redeemPhone.trim(),
          buyerPhone: "",
          status: responseStatus || "PAYMENT_RECEIVED",
          type: "redeem",
        });
        saveLatestTransaction(latest);
        setTransactionId(id);
        setStatus(responseStatus || "PAYMENT_RECEIVED");
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const responseData = err.response?.data || null;
      setRedeemResult(responseData);
      if (responseData?.status) {
        setStatus(responseData.status);
      }
      const errorMessage = responseData?.error || "Could not redeem the MPesa message.";
      setError(errorMessage);
      showNotification({ type: "error", message: errorMessage });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }

  async function handleRetryAirtime(transactionId) {
    if (!transactionId) return;
    setRetryMessage(null);
    setRetrying(true);
    try {
      const response = await retryAirtime(transactionId);
      const message = response.success ? "Airtime retry submitted successfully." : response.error || "Airtime retry failed.";
      setRetryMessage(message);
      showNotification({ type: response.success ? "success" : "error", message });
    } catch (err) {
      const message = err.response?.data?.error || "Airtime retry failed.";
      setRetryMessage(message);
      showNotification({ type: "error", message });
    } finally {
      setRetrying(false);
    }
  }

  useEffect(() => {
    if (!transactionId) return;
    pollRef.current = setInterval(async () => {
      if (document.hidden) return; // don't poll while the tab is hidden

      try {
        const data = await getTransactionStatus(transactionId);
        // Tolerate both camelCase and snake_case API contracts.
        const currentStatus = data.status;
        const failureReason = data.failureReason ?? data.failure_reason ?? null;

        if (!mountedRef.current) return;
        if (currentStatus && currentStatus !== prevStatusRef.current) {
          if (currentStatus === "AIRTIME_SENT") {
            showNotification({ type: "success", message: "Airtime was delivered successfully." });
          } else if (currentStatus === "AIRTIME_FAILED") {
            showNotification({ type: "error", message: `Airtime delivery failed: ${failureReason || "Please retry."}` });
          } else if (currentStatus === "PAYMENT_FAILED") {
            showNotification({ type: "error", message: `Payment failed: ${failureReason || "Please retry."}` });
          } else if (currentStatus === "PAYMENT_RECEIVED") {
            showNotification({ type: "info", message: "Payment received. Delivering airtime now." });
          }
          prevStatusRef.current = currentStatus;
        }

        setStatus(currentStatus);
        // Keep the persisted summary in sync with live status updates.
        if (transactionId) {
          saveLatestTransaction(
            makeLatestTransaction({
              id: transactionId,
              amount: data.amount ?? latestTransaction?.amount ?? 0,
              recipientPhone: latestTransaction?.recipientPhone || data.phoneNumber || "",
              buyerPhone: latestTransaction?.buyerPhone || "",
              payerPhoneNumber: data.payerPhoneNumber || latestTransaction?.payerPhoneNumber || "",
              status: currentStatus,
              createdAt: latestTransaction?.createdAt,
              updatedAt: data.updatedAt || latestTransaction?.updatedAt,
              type: latestTransaction?.type || (latestTransaction?.buyerPhone ? "other" : "self"),
            })
          );
        }
        // Clear the error when the latest poll carries no failure reason.
        setError(failureReason || null);

        if (TERMINAL_STATUSES.includes(currentStatus)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // transient network error while polling
      }
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [transactionId]);

  function resetForm() {
    setTransactionId(null);
    setStatus(null);
    setError(null);
    setRecipientPhone("");
    setBuyerPhone("");
    setAmount("");
    setMpesaText("");
    setRedeemPhone("");
    setRedeemResult(null);
  }

  function formatLatestTransactionSummary(tx) {
    if (!tx) return null;
    if (tx.type === "self") {
      return `Airtime for your own number (${tx.recipientPhone})`;
    }
    if (tx.type === "other") {
      return `Airtime for ${tx.recipientPhone} paid from ${tx.buyerPhone || "your number"}`;
    }
    if (tx.type === "redeem") {
      return `Redeem request for ${tx.recipientPhone || "your phone"}`;
    }
    return `Airtime transaction for ${tx.recipientPhone}`;
  }

  function renderLatestTransaction() {
    if (!latestTransaction) return null;
    return (
      <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Latest transaction</p>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${statusPillClass(latestTransaction.status)}`}>
              {latestTransaction.status?.toLowerCase().replace(/_/g, " ") || "Unknown"}
            </span>
          </div>
          <p className="mt-2 text-base font-semibold text-slate-900">{formatLatestTransactionSummary(latestTransaction)}</p>
        </div>
        <dl className="grid gap-3 px-5 py-4 text-sm text-slate-600">
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium text-slate-500">Amount</span>
            <span className="font-semibold text-slate-900">{latestTransaction.amount ? `KES ${Number(latestTransaction.amount).toLocaleString()}` : "Unknown"}</span>
          </div>
          {latestTransaction.payerPhoneNumber && (
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium text-slate-500">Payer</span>
              <span className="text-slate-700">{latestTransaction.payerPhoneNumber}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium text-slate-500">Updated</span>
            <span className="text-slate-700">{new Date(latestTransaction.updatedAt).toLocaleString()}</span>
          </div>
        </dl>
        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={() => {
              setTransactionId(latestTransaction.id);
              setStatus(latestTransaction.status);
              if (view !== VIEWS.HOME) {
                handleNavigate(VIEWS.HOME);
              }
            }}
            className="btn-dark w-full"
          >
            Track latest transaction
          </button>
        </div>
      </div>
    );
  }

  if (isAdmin) {
    return (
      <div className="air-shell p-4 text-slate-900">
        <style>{STYLES}</style>
        <div className="air-card mx-auto max-w-6xl p-6 md:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="air-kicker">Admin dashboard</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">AI parse review &amp; transaction controls</h1>
            </div>
            <button
              type="button"
              onClick={() => handleNavigate(VIEWS.HOME)}
              className="btn-dark"
            >
              Buyer view
            </button>
          </div>
          <AdminReviewPage />
        </div>
      </div>
    );
  }
  if (isSupport) {
    return (
      <div className="air-shell p-4 text-slate-900">
        <style>{STYLES}</style>
        <div className="air-card mx-auto max-w-6xl p-6 md:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="air-kicker">Support chat</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Transaction-aware support assistant</h1>
            </div>
            <button
              type="button"
              onClick={() => handleNavigate(VIEWS.HOME)}
              className="btn-dark"
            >
              Back to buyer view
            </button>
          </div>
          <SupportChat currentTransactionId={transactionId} />
        </div>
      </div>
    );
  }
  if (isAbout) {
    return (
      <div className="air-shell p-4 text-slate-900">
        <style>{STYLES}</style>
        <div className="air-card mx-auto max-w-6xl p-6 md:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="air-kicker">About Air-timee</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Built for fast airtime delivery</h1>
            </div>
            <button
              type="button"
              onClick={() => handleNavigate(VIEWS.HOME)}
              className="btn-dark"
            >
              Back to home
            </button>
          </div>
          <div className="space-y-6 text-slate-700">
            <p>Air-timee helps you send airtime quickly using M-Pesa, with payment verification and support assistance all in one place.</p>
            <p>Our platform is designed for safe airtime purchases, delivery visibility, and a support assistant that references actual transaction data.</p>
            <div className="rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-teal-50/50 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Why Air-timee?</h2>
              <ul className="mt-4 space-y-3 text-slate-600">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-teal-600/10 text-xs font-bold text-teal-700">1</span>
                  Simple airtime purchase flow with M-Pesa STK push.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-teal-600/10 text-xs font-bold text-teal-700">2</span>
                  Automatic transaction status polling and delivery tracking.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-teal-600/10 text-xs font-bold text-teal-700">3</span>
                  Support chat that uses real transaction context.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-teal-600/10 text-xs font-bold text-teal-700">4</span>
                  Admin review tools for AI parse audits and retries.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (isLogin) {
    return (
      <div className="air-shell flex items-center justify-center p-4 text-slate-900">
        <style>{STYLES}</style>
        <div className="air-card w-full max-w-md animate-fade-in-up p-8 md:p-10">
          <div className="mb-8 text-center">
            <span className="air-kicker">Air-timee login</span>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Secure access</h1>
            <p className="mt-2 text-sm text-slate-500">Sign in to keep your transactions synced.</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.target;
              if (registerMode) {
                if (pendingOtp) {
                  handleVerifyOtp();
                } else {
                  handleRegister(form.username.value, form.password.value);
                }
              } else {
                handleLogin(form.username.value, form.password.value);
              }
            }}
            className="space-y-5"
          >
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">Username</span>
              <input
                name="username"
                type="text"
                autoComplete="username"
                className="field"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">Password</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                className="field"
              />
            </label>
            {pendingOtp && (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">Verification code</span>
                <input
                  name="otp"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  type="text"
                  className="field"
                  placeholder="Enter the 6-digit code"
                />
              </label>
            )}
            {loginError && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loginError}</p>}
            <button
              type="submit"
              disabled={loginSubmitting}
              className="btn-primary w-full"
            >
              {loginSubmitting
                ? pendingOtp
                  ? "Verifying..."
                  : registerMode
                  ? "Creating account..."
                  : "Signing in..."
                : pendingOtp
                ? "Verify code"
                : registerMode
                ? "Create account"
                : "Sign in"}
            </button>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setRegisterMode((prev) => !prev)}
                className="btn-ghost w-full"
              >
                {registerMode ? "Use existing account" : "Create a new account"}
              </button>
              <button
                type="button"
                onClick={() => handleNavigate(VIEWS.HOME)}
                className="btn-ghost w-full"
              >
                Back to home
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="air-shell p-4 text-slate-900">
      <style>{STYLES}</style>
      {notification && (
        <div
          className={`fixed right-4 top-4 z-[60] flex max-w-sm animate-toast-in items-start gap-3 rounded-2xl px-4 py-3.5 text-sm font-medium text-white shadow-2xl ${
            notification.type === "success"
              ? "bg-emerald-600"
              : notification.type === "error"
              ? "bg-red-600"
              : "bg-slate-900"
          }`}
        >
          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-[11px] font-bold">
            {notification.type === "success" ? "✓" : notification.type === "error" ? "✕" : "i"}
          </span>
          <span>{notification.message}</span>
        </div>
      )}

      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="air-card animate-fade-in-up relative overflow-hidden p-6">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-teal-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-emerald-200/30 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <Logo />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleNavigate(VIEWS.HOME)}
                className={`nav-pill ${view === VIEWS.HOME ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-600/25" : "border border-slate-300 bg-white text-slate-700 hover:border-teal-500/50 hover:text-teal-700"}`}
              >
                Home
              </button>
              <button
                type="button"
                onClick={() => handleNavigate(VIEWS.BUY)}
                className={`nav-pill ${view === VIEWS.BUY ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-600/25" : "border border-slate-300 bg-white text-slate-700 hover:border-teal-500/50 hover:text-teal-700"}`}
              >
                Buy airtime
              </button>
              <button
                type="button"
                onClick={() => handleNavigate(VIEWS.REDEEM)}
                className={`nav-pill ${view === VIEWS.REDEEM ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-600/25" : "border border-slate-300 bg-white text-slate-700 hover:border-teal-500/50 hover:text-teal-700"}`}
              >
                Redeem
              </button>
              <button
                type="button"
                onClick={() => handleNavigate(VIEWS.SUPPORT)}
                className={`nav-pill ${view === VIEWS.SUPPORT ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20" : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900"}`}
              >
                Support
              </button>
              <button
                type="button"
                onClick={() => handleNavigate(VIEWS.ABOUT)}
                className={`nav-pill ${view === VIEWS.ABOUT ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20" : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900"}`}
              >
                About
              </button>
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="nav-pill bg-red-600 text-white shadow-lg shadow-red-600/25 transition hover:bg-red-500"
                >
                  Logout
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleNavigate(VIEWS.LOGIN)}
                  className="nav-pill bg-slate-900 text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800"
                >
                  Login
                </button>
              )}
            </div>
          </div>
          <div className="relative mt-5 flex items-center gap-4 rounded-[20px] border border-teal-600/10 bg-gradient-to-r from-teal-50 via-teal-50/60 to-emerald-50/70 px-5 py-4">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-600 text-lg text-white shadow-md shadow-teal-600/25">📲</span>
            <p className="text-sm text-slate-600">
              Air-timee is your M-Pesa airtime partner for fast, secure top-ups with built-in support and admin tools.
            </p>
          </div>
        </div>

        {isHome && (
          <div className="grid gap-6 xl:grid-cols-[1.55fr_0.85fr]">
            <section className="air-card animate-fade-in-up relative overflow-hidden p-8 md:p-10">
              <div className="pointer-events-none absolute -left-16 top-10 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />
              <div className="pointer-events-none absolute -right-20 top-24 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-[radial-gradient(circle_at_center,_rgba(56,189,248,0.18),_transparent_55%)]" />
              <div className="relative space-y-10">
                <div className="space-y-5">
                  <div className="inline-flex items-center gap-3 rounded-full border border-teal-500/20 bg-teal-500/5 px-4 py-2 text-sm font-semibold text-teal-700 shadow-sm shadow-teal-500/10">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-white">⚡</span>
                    <span>Experience M-Pesa airtime in hyperdrive</span>
                  </div>
                  <h2 className="text-5xl font-semibold tracking-tight text-slate-950 md:text-6xl">
                    Welcome to <span className="bg-gradient-to-r from-teal-400 via-cyan-500 to-emerald-500 bg-clip-text text-transparent">Air-timee</span>
                  </h2>
                  <p className="max-w-3xl text-lg leading-8 text-slate-600">
                    Send airtime through M-Pesa with a psychedelic user flow, realtime status pulses, and support that actually feels alive. This homepage is a launchpad for the fast, weird, and wonderful way you top up airtime.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="group relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-slate-950/95 p-6 text-white shadow-xl shadow-cyan-500/10 transition duration-300 hover:-translate-y-1 hover:bg-slate-900">
                    <div className="absolute right-4 top-4 h-24 w-24 rounded-full bg-cyan-400/10 blur-3xl" />
                    <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-teal-400 to-cyan-500 text-2xl">🚀</div>
                    <h3 className="relative z-10 mt-6 text-xl font-semibold">Warp-speed payments</h3>
                    <p className="relative z-10 mt-3 text-sm text-slate-300">Send a prompt, approve it, and watch the transaction rocket through status.</p>
                  </div>
                  <div className="group relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-slate-950/95 p-6 text-white shadow-xl shadow-emerald-500/10 transition duration-300 hover:-translate-y-1 hover:bg-slate-900">
                    <div className="absolute left-4 bottom-4 h-20 w-20 rounded-full bg-emerald-400/10 blur-3xl" />
                    <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 text-2xl">🧠</div>
                    <h3 className="relative z-10 mt-6 text-xl font-semibold">Smart support</h3>
                    <p className="relative z-10 mt-3 text-sm text-slate-300">Support options that surface your latest transaction instantly and keep the flow alive.</p>
                  </div>
                  <div className="group relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-slate-950/95 p-6 text-white shadow-xl shadow-slate-500/10 transition duration-300 hover:-translate-y-1 hover:bg-slate-900">
                    <div className="absolute right-4 bottom-10 h-20 w-20 rounded-full bg-cyan-300/10 blur-3xl" />
                    <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-slate-400 to-slate-600 text-2xl">✨</div>
                    <h3 className="relative z-10 mt-6 text-xl font-semibold">Glow mode</h3>
                    <p className="relative z-10 mt-3 text-sm text-slate-300">A bold, neon-infused interface with surreal energy and instant airtime vibes.</p>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-[32px] border border-cyan-300/10 bg-white/95 p-8 shadow-2xl shadow-cyan-500/10">
                    <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">Live pulse</div>
                    <div className="mt-6 flex items-start gap-5">
                      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-500 to-teal-500 text-2xl text-white shadow-lg">💳</div>
                      <div>
                        <p className="text-lg font-semibold text-slate-900">M-Pesa checkout like a sci-fi dashboard</p>
                        <p className="mt-2 text-slate-600">Every transaction is tracked, verified, and translated into a futuristic delivery experience.</p>
                      </div>
                    </div>
                    <div className="mt-8 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-3xl border border-slate-200/80 bg-slate-50 p-4">
                        <p className="text-sm text-slate-500">Status pulse</p>
                        <p className="mt-2 text-xl font-semibold text-slate-900">Realtime</p>
                      </div>
                      <div className="rounded-3xl border border-slate-200/80 bg-slate-50 p-4">
                        <p className="text-sm text-slate-500">Trusted by</p>
                        <p className="mt-2 text-xl font-semibold text-slate-900">Instant airtime flows</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-[32px] border border-teal-600/10 bg-gradient-to-br from-teal-50 via-cyan-50 to-slate-100 p-8 shadow-2xl shadow-teal-500/5">
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-700">dream state dashboard</p>
                    <h3 className="mt-4 text-3xl font-semibold text-slate-900">A homepage that feels alive</h3>
                    <p className="mt-4 text-slate-600">Everything here is designed to feel faster, brighter, and more surprising than a normal payments app.</p>
                    <div className="mt-8 grid gap-4">
                      <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm">
                        <p className="text-sm text-slate-500">Airtime pulse</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">instant status updates</p>
                      </div>
                      <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm">
                        <p className="text-sm text-slate-500">Support ready</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">chat with context</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            <aside className="air-card animate-fade-in-up relative overflow-hidden p-8" style={{ animationDelay: "90ms" }}>
              <div className="pointer-events-none absolute -top-10 right-8 h-32 w-32 rounded-full bg-emerald-300/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-10 left-8 h-28 w-28 rounded-full bg-cyan-300/10 blur-3xl" />
              <div className="relative z-10 rounded-[32px] border border-slate-200/80 bg-slate-950/95 p-6 text-white shadow-2xl shadow-cyan-500/10">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-cyan-200">Air-timee pilot</p>
                    <h3 className="mt-2 text-2xl font-semibold">Welcome back{isAuthenticated ? `, ${user}` : ""}</h3>
                  </div>
                  <div className="rounded-3xl bg-cyan-500/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100 ring-1 ring-cyan-500/20">Live</div>
                </div>
                <div className="mt-6 space-y-4 text-slate-300">
                  <div className="rounded-3xl bg-white/5 p-4">
                    <p className="text-sm text-cyan-200">Account mode</p>
                    <p className="mt-2 text-lg font-semibold text-white">{isAuthenticated ? "Synced user" : "Guest preview"}</p>
                  </div>
                  <div className="rounded-3xl bg-white/5 p-4">
                    <p className="text-sm text-cyan-200">Latest transaction</p>
                    <p className="mt-2 text-lg font-semibold text-white">{latestTransaction ? formatLatestTransactionSummary(latestTransaction) : "No recent activity"}</p>
                  </div>
                  <div className="rounded-3xl bg-white/5 p-4">
                    <p className="text-sm text-cyan-200">Why this page</p>
                    <p className="mt-2 text-lg font-semibold text-white">It’s bold, flashy, and entirely built around airtime speed.</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}

        {isBuy && (
          <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
            <section className="air-card animate-fade-in-up p-8 md:p-10">
              <div className="space-y-6">
                <div>
                  <p className="air-kicker">Send airtime</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Buy airtime</h2>
                  <p className="mt-2 text-slate-600">Enter the recipient phone and amount to start a top-up with M-Pesa.</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Recipient phone number</span>
                      <input
                        type="tel"
                        required
                        placeholder="07XXXXXXXX"
                        value={recipientPhone}
                        onChange={(e) => setRecipientPhone(e.target.value)}
                        className="field"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Amount (KES)</span>
                      <input
                        type="number"
                        required
                        min={5}
                        placeholder="100"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="field"
                      />
                    </label>
                  </div>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">Your phone number (M-Pesa prompt recipient)</span>
                    <input
                      type="tel"
                      placeholder="07XXXXXXXX"
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      className="field"
                    />
                    <p className="text-sm text-slate-400">Leave blank to send the prompt to the recipient number.</p>
                  </label>
                  {error && <p className="animate-fade-in-up rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary w-full py-4 text-base"
                  >
                    {submitting ? (
                      <>
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-white border-t-transparent text-white animate-spin" />
                        Sending M-Pesa prompt...
                      </>
                    ) : (
                      "Review and confirm"
                    )}
                  </button>
                </form>

                {showConfirm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
                    <div className="air-card w-full max-w-md animate-modal-in p-7">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="air-kicker">Review order</p>
                          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Confirm airtime purchase</h2>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowConfirm(false)}
                          aria-label="Close"
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="mt-3 text-sm text-slate-500">Please confirm you want to send airtime to the following number.</p>

                      <div className="mt-6 space-y-1 overflow-hidden rounded-[20px] border border-slate-200/80 bg-slate-50/60">
                        <div className="flex items-center justify-between gap-4 px-5 py-4">
                          <span className="text-sm text-slate-500">Phone</span>
                          <span className="font-semibold text-slate-900">{recipientPhone}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-t border-slate-200/60 px-5 py-4">
                          <span className="text-sm text-slate-500">Amount</span>
                          <span className="text-lg font-bold text-teal-700">KES {Number(amount).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <button
                          type="button"
                          onClick={() => setShowConfirm(false)}
                          className="btn-ghost"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={confirmPayment}
                          className="btn-primary"
                        >
                          Confirm purchase
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
            <aside className="air-card animate-fade-in-up p-8" style={{ animationDelay: "90ms" }}>
              <div className="rounded-3xl border border-slate-200/80 bg-slate-50/60 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/15 to-emerald-500/15 text-xl text-teal-700 ring-1 ring-teal-600/15">↗</div>
                <h3 className="mt-4 text-xl font-semibold text-slate-900">Why use buy mode?</h3>
                <p className="mt-2 text-slate-600">Use this view when you want to send airtime to someone else and optionally receive the STK prompt on your own number.</p>
              </div>
            </aside>
          </div>
        )}

        {isRedeem && (
          <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
            <section className="air-card animate-fade-in-up p-8 md:p-10">
              <div className="space-y-6">
                <div>
                  <p className="air-kicker">Instant redemption</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Redeem M-Pesa receipt</h2>
                  <p className="mt-2 text-slate-600">Paste your M-Pesa SMS text and we will verify it before crediting airtime.</p>
                </div>
                <form onSubmit={handleRedeem} className="space-y-6">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">MPesa SMS / message text</span>
                    <textarea
                      required
                      rows={8}
                      value={mpesaText}
                      onChange={(e) => setMpesaText(e.target.value)}
                      className="field resize-none leading-relaxed"
                      placeholder="Paste the MPesa message body here"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">Optional phone number</span>
                    <input
                      type="tel"
                      placeholder="07XXXXXXXX"
                      value={redeemPhone}
                      onChange={(e) => setRedeemPhone(e.target.value)}
                      className="field"
                    />
                    <p className="text-sm text-slate-400">Leave blank to credit the phone detected from the message.</p>
                  </label>
                  {error && <p className="animate-fade-in-up rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary w-full py-4 text-base"
                  >
                    {submitting ? (
                      <>
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-white border-t-transparent text-white animate-spin" />
                        Claim airtime
                      </>
                    ) : (
                      "Claim airtime"
                    )}
                  </button>
                </form>
              </div>
            </section>
            <aside className="air-card animate-fade-in-up p-8" style={{ animationDelay: "90ms" }}>
              <div className="rounded-3xl border border-slate-200/80 bg-slate-50/60 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/15 to-emerald-500/15 text-xl text-teal-700 ring-1 ring-teal-600/15">⇄</div>
                <h3 className="mt-4 text-xl font-semibold text-slate-900">Redeem flow</h3>
                <p className="mt-2 text-slate-600">Use this mode when you already have a valid M-Pesa receipt text to convert into airtime.</p>
              </div>
            </aside>
          </div>
        )}

        {isSupport && (
          <div className="air-card animate-fade-in-up p-8">
            <SupportChat currentTransactionId={transactionId} />
          </div>
        )}

        {isAbout && (
          <div className="air-card animate-fade-in-up p-8">
            <div className="space-y-6">
              <div>
                <p className="air-kicker">About Air-timee</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">About Air-timee</h2>
              </div>
              <p className="text-slate-600">Air-timee is a lightweight M-Pesa airtime vending platform with payment tracking, redemption support, and an admin dashboard for operations.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-200/80 bg-slate-50/60 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/15 to-emerald-500/15 text-xl text-teal-700 ring-1 ring-teal-600/15">✦</div>
                  <h3 className="mt-4 text-xl font-semibold text-slate-900">Mission</h3>
                  <p className="mt-2 text-slate-600">Make airtime top-up easy, transparent, and reliable for buyers and operators.</p>
                </div>
                <div className="rounded-3xl border border-slate-200/80 bg-slate-50/60 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/15 to-emerald-500/15 text-xl text-teal-700 ring-1 ring-teal-600/15">🔒</div>
                  <h3 className="mt-4 text-xl font-semibold text-slate-900">Security</h3>
                  <p className="mt-2 text-slate-600">Protected access and environment-based secrets keep your service safe in production.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {isBuy || isRedeem ? (
          <div className="air-card animate-fade-in-up p-8">
            <div className="space-y-6">
              <ProgressSteps status={status} />
              <DeliveryAnimation status={status} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusPanel({ status, error, onReset }) {
  const copy = STATUS_COPY[status] || "Preparing your airtime top-up...";
  const badge = status ? status.replace(/_/g, " ") : "Starting";

  const canReset =
    status === "AIRTIME_SENT" ||
    status === "AIRTIME_FAILED" ||
    status === "PAYMENT_FAILED" ||
    status === "REFUNDED"; // refunded is terminal too -- don't leave the user stuck

  return (
    <div className="mt-8 space-y-6">
      <div className="animate-fade-in-up rounded-[28px] border border-teal-600/10 bg-gradient-to-br from-slate-50 to-teal-50/50 p-6 shadow-inner">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="air-kicker">Current status</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">{badge}</h3>
          </div>
          <span className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-600 ring-1 ring-slate-200">Step {STATUS_STEP[status] || 1}</span>
        </div>

        <p className="mt-5 text-slate-600">{copy}</p>

        {status === "PAYMENT_RECEIVED" && (
          <div className="mt-6 rounded-3xl bg-teal-50 p-4 text-slate-700">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 animate-pulse items-center justify-center rounded-2xl bg-teal-100 text-teal-600">⏳</div>
              <div>
                <p className="font-medium text-slate-900">Airtime delivery in progress</p>
                <p className="text-sm text-slate-500">Your airtime will be sent automatically, no extra action needed.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <p className="animate-fade-in-up rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {canReset && (
        <button
          onClick={onReset}
          className="btn-primary w-full"
        >
          Buy more airtime
        </button>
      )}
    </div>
  );
}

function ProgressSteps({ status }) {
  // Per-step state: done | active | failed | waiting
  const stateMap = {
    PENDING_PAYMENT: ["active", "waiting", "waiting"],
    PAYMENT_RECEIVED: ["done", "active", "waiting"],
    AIRTIME_SENT: ["done", "done", "done"],
    PAYMENT_FAILED: ["failed", "waiting", "waiting"],
    AIRTIME_FAILED: ["done", "done", "failed"],
    REFUNDED: ["done", "done", "failed"],
  };
  const states = stateMap[status] || ["waiting", "waiting", "waiting"];
  const titles = ["M-Pesa prompt", "Confirm payment", "Airtime delivery"];
  const descs = ["STK push sent to your phone", "Payment received from M-Pesa", "Airtime sent to the target number"];

  const iconClass = (state) => {
    if (state === "done") return "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30";
    if (state === "active") return "bg-teal-600 text-white ring-2 ring-teal-500/40 shadow-md shadow-teal-600/30";
    if (state === "failed") return "bg-red-500 text-white shadow-md shadow-red-500/30";
    return "bg-slate-100 text-slate-400 ring-1 ring-slate-200";
  };

  return (
    <div className="space-y-4">
      {states.map((state, i) => (
        <div
          key={i}
          className="animate-fade-in-up relative flex items-center gap-4 rounded-3xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm transition duration-200 hover:border-teal-600/20 hover:shadow-md hover:shadow-teal-600/5"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          {/* connector line between steps (hidden on the last one) */}
          {i < states.length - 1 && (
            <span
              className={`absolute bottom-[-16px] left-[22px] h-4 w-px ${state === "done" ? "bg-emerald-400" : "bg-slate-200"}`}
              aria-hidden="true"
            />
          )}
          <div className={`relative z-10 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-lg font-semibold ${iconClass(state)}`}>
            {state === "done" ? "✓" : state === "failed" ? "✕" : i + 1}
          </div>
          <div className="min-w-0">
            <p className={`font-medium ${state === "waiting" ? "text-slate-400" : "text-slate-900"}`}>{titles[i]}</p>
            <p className={`truncate text-sm ${state === "waiting" ? "text-slate-400" : "text-slate-500"}`}>{descs[i]}</p>
          </div>
          {state === "active" && (
            <span className="ml-auto flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-600">
              <span className="h-2 w-2 animate-ping rounded-full bg-teal-500" />
              In progress
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function DeliveryAnimation({ status }) {
  const isPending = status === "PENDING_PAYMENT";
  const isDelivering = status === "PAYMENT_RECEIVED";
  const isSuccess = status === "AIRTIME_SENT";
  const isFailed = status === "AIRTIME_FAILED" || status === "PAYMENT_FAILED";

  return (
    <div className="animate-fade-in-up relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-b from-slate-50/80 to-white p-6 shadow-sm" style={{ animationDelay: "160ms" }}>
      <div className="absolute -right-10 top-6 h-32 w-32 rounded-full bg-teal-400/20 blur-3xl" />
      <div className="absolute left-4 top-12 h-16 w-16 rounded-full bg-emerald-300/30 blur-3xl" />

      <div className="relative z-10 flex flex-col items-center gap-5">
        {/* The phone stays dark on the light page -- a dark screen reads as a
            real device and keeps the status icons high-contrast. */}
        <div className="relative h-[240px] w-[160px] rounded-[40px] border border-slate-700 bg-slate-900/95 shadow-2xl">
          <div className="absolute inset-x-0 top-4 flex justify-center">
            <div className="h-2 w-14 rounded-full bg-slate-700" />
          </div>

          {/* Phone screen */}
          <div className="absolute inset-x-0 top-16 flex flex-col items-center gap-3 px-4 text-center">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full text-3xl shadow-lg">
              {/* Radar ping while delivering */}
              {isDelivering && <span className="absolute inset-0 animate-ping rounded-full bg-teal-400/40" />}
              {/* Success burst */}
              {isSuccess && (
                <>
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40" />
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" style={{ animationDelay: "350ms" }} />
                </>
              )}
              <div
                key={status}
                className={`relative flex h-full w-full items-center justify-center rounded-full shadow-lg ${
                  isSuccess ? "animate-pop-in bg-emerald-500 text-white" : isDelivering ? "animate-pulse bg-teal-500 text-white" : "bg-teal-600 text-white"
                }`}
              >
                {isSuccess ? "✔" : "📲"}
              </div>
            </div>
            <div className="rounded-3xl bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.24em] text-slate-400">Mobile top-up</div>
          </div>

          {/* Flying credit while delivering: wrapper centers via margin so the
              animation owns `transform` (no Tailwind translate conflict) */}
          {isDelivering && (
            <div className="absolute left-1/2 top-[46%] -ml-6 h-12 w-12">
              <div className="animate-credit-fly flex h-full w-full items-center justify-center rounded-full bg-teal-400/90 text-lg shadow-xl">
                💸
              </div>
            </div>
          )}

          {/* Delivery progress bar */}
          {isDelivering && (
            <div className="absolute inset-x-4 bottom-5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="animate-progress-slide h-full w-1/3 rounded-full bg-teal-400" />
              </div>
            </div>
          )}

          {isPending && (
            <div className="absolute left-1/2 top-[64%] h-10 w-10 -translate-x-1/2 rounded-full bg-slate-700/90 animate-bounce-slow" />
          )}

          {isFailed && (
            <div className="absolute left-1/2 top-[46%] h-12 w-12 -translate-x-1/2 rounded-full bg-red-500/90 shadow-xl animate-shake">
              <span className="flex h-full w-full items-center justify-center text-lg">⚠️</span>
            </div>
          )}
        </div>

        <div className="space-y-2 text-center">
          <p className="text-lg font-semibold text-slate-900">
            {isPending ? "Waiting for your M-Pesa approval" : isDelivering ? "Airtime is on its way" : isSuccess ? "Top-up completed" : isFailed ? "Action required" : "Ready to start"}
          </p>
          <p className="text-sm text-slate-500">
            {isPending && "Approve the STK prompt on your phone to continue."}
            {isDelivering && "Your airtime is being sent automatically to the target number."}
            {isSuccess && "The airtime has been delivered successfully."}
            {isFailed && "Something didn’t go through. Check the result above and retry."}
            {!status && "Fill the form and start a new airtime purchase."}
          </p>
        </div>
      </div>
    </div>
  );
}
