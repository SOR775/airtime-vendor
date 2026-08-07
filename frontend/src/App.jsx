import { useEffect, useRef, useState } from "react";
import { initiatePayment, getTransactionStatus, redeemPayment, retryAirtime } from "./services/api";
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

/* ── Custom animation keyframes ──
   `animate-credit-fly` / `animate-bounce-slow` / `animate-shake` are NOT
   Tailwind utilities, so without these they never run. Defined here so the
   component works anywhere; prefer moving to tailwind.config.js if you
   standardize them globally. */
const STYLES = `
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

  @media (prefers-reduced-motion: reduce) {
    .animate-credit-fly,
    .animate-bounce-slow,
    .animate-shake,
    .animate-progress-slide,
    .animate-pop-in,
    .animate-fade-in-up,
    .animate-modal-in {
      animation: none !important;
    }
  }
`;

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
  const [view, setView] = useState(() => {
    const path = window.location.pathname;
    if (path === "/admin") return VIEWS.ADMIN;
    if (path === "/support") return VIEWS.SUPPORT;
    if (path === "/about") return VIEWS.ABOUT;
    return VIEWS.HOME;
  });
  const isHome = view === VIEWS.HOME;
  const isBuy = view === VIEWS.BUY;
  const isRedeem = view === VIEWS.REDEEM;
  const isSupport = view === VIEWS.SUPPORT;
  const isAbout = view === VIEWS.ABOUT;
  const isAdmin = view === VIEWS.ADMIN;
  const isLogin = view === VIEWS.LOGIN;
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem("airtimee-auth") === "true");
  const [user, setUser] = useState(() => localStorage.getItem("airtimee-user") || "");
  const [loginError, setLoginError] = useState(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
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

  function handleLogin(username, password) {
    setLoginError(null);
    setLoginSubmitting(true);
    if (!username.trim() || !password.trim()) {
      setLoginError("Username and password are required.");
      setLoginSubmitting(false);
      return;
    }
    localStorage.setItem("airtimee-auth", "true");
    localStorage.setItem("airtimee-user", username.trim());
    setUser(username.trim());
    setIsAuthenticated(true);
    setLoginSubmitting(false);
    setView(VIEWS.HOME);
  }

  function handleLogout() {
    localStorage.removeItem("airtimee-auth");
    localStorage.removeItem("airtimee-user");
    setIsAuthenticated(false);
    setUser("");
    setView(VIEWS.HOME);
  }

  function handleNavigate(nextView) {
    setView(nextView);
    if (nextView === VIEWS.REDEEM) {
      setRedeemMode(true);
    } else if (nextView === VIEWS.BUY || nextView === VIEWS.HOME || nextView === VIEWS.ABOUT || nextView === VIEWS.SUPPORT || nextView === VIEWS.ADMIN) {
      setRedeemMode(false);
    }
    const path = nextView === VIEWS.SUPPORT ? "/support" : nextView === VIEWS.ABOUT ? "/about" : nextView === VIEWS.ADMIN ? "/admin" : "/";
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
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Latest transaction</p>
        <p className="mt-3 text-base font-semibold text-slate-900">{formatLatestTransactionSummary(latestTransaction)}</p>
        <dl className="mt-4 grid gap-3 text-sm text-slate-600">
          <div className="flex items-center justify-between gap-4 text-slate-700">
            <span className="font-medium">Amount</span>
            <span>{latestTransaction.amount ? `KES ${Number(latestTransaction.amount).toLocaleString()}` : "Unknown"}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-slate-700">
            <span className="font-medium">Status</span>
            <span className="capitalize">{latestTransaction.status?.toLowerCase().replace(/_/g, " ") || "Unknown"}</span>
          </div>
          {latestTransaction.payerPhoneNumber && (
            <div className="flex items-center justify-between gap-4 text-slate-700">
              <span className="font-medium">Payer</span>
              <span>{latestTransaction.payerPhoneNumber}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 text-slate-700">
            <span className="font-medium">Updated</span>
            <span>{new Date(latestTransaction.updatedAt).toLocaleString()}</span>
          </div>
        </dl>
        <button
          type="button"
          onClick={() => {
            setTransactionId(latestTransaction.id);
            setStatus(latestTransaction.status);
            if (view !== VIEWS.HOME) {
              handleNavigate(VIEWS.HOME);
            }
          }}
          className="mt-4 inline-flex w-full items-center justify-center rounded-3xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Track latest transaction
        </button>
      </div>
    );
  }

  if (isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 p-4">
        <style>{STYLES}</style>
        <div className="mx-auto max-w-6xl rounded-[32px] border border-slate-200 bg-white p-6 shadow-xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.32em] text-teal-600">Admin dashboard</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">AI parse review & transaction controls</h1>
            </div>
            <button
              type="button"
              onClick={() => handleNavigate(VIEWS.HOME)}
              className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
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
      <div className="min-h-screen bg-slate-50 text-slate-900 p-4">
        <style>{STYLES}</style>
        <div className="mx-auto max-w-6xl rounded-[32px] border border-slate-200 bg-white p-6 shadow-xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.32em] text-teal-600">Support chat</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Transaction-aware support assistant</h1>
            </div>
            <button
              type="button"
              onClick={() => handleNavigate(VIEWS.HOME)}
              className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
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
      <div className="min-h-screen bg-slate-50 text-slate-900 p-4">
        <style>{STYLES}</style>
        <div className="mx-auto max-w-6xl rounded-[32px] border border-slate-200 bg-white p-6 shadow-xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.32em] text-teal-600">About Air-timee</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Built for fast airtime delivery</h1>
            </div>
            <button
              type="button"
              onClick={() => handleNavigate(VIEWS.HOME)}
              className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Back to home
            </button>
          </div>
          <div className="space-y-6 text-slate-700">
            <p>Air-timee helps you send airtime quickly using M-Pesa, with payment verification and support assistance all in one place.</p>
            <p>Our platform is designed for safe airtime purchases, delivery visibility, and a support assistant that references actual transaction data.</p>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Why Air-timee?</h2>
              <ul className="mt-4 space-y-3 text-slate-600 list-disc list-inside">
                <li>Simple airtime purchase flow with M-Pesa STK push.</li>
                <li>Automatic transaction status polling and delivery tracking.</li>
                <li>Support chat that uses real transaction context.</li>
                <li>Admin review tools for AI parse audits and retries.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (isLogin) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-4">
        <style>{STYLES}</style>
        <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl">
          <div className="mb-6 text-center">
            <p className="text-sm uppercase tracking-[0.32em] text-teal-600">Air-timee login</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Secure access</h1>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.target;
              handleLogin(form.username.value, form.password.value);
            }}
            className="space-y-5"
          >
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">Username</span>
              <input
                name="username"
                type="text"
                className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">Password</span>
              <input
                name="password"
                type="password"
                className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              />
            </label>
            {loginError && <p className="text-sm text-red-700">{loginError}</p>}
            <button
              type="submit"
              disabled={loginSubmitting}
              className="inline-flex w-full items-center justify-center rounded-3xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:opacity-50"
            >
              {loginSubmitting ? "Signing in..." : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => handleNavigate(VIEWS.HOME)}
              className="inline-flex w-full items-center justify-center rounded-3xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Back to home
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-4">
      <style>{STYLES}</style>
      {notification && (
        <div
          className={`fixed right-4 top-4 z-50 max-w-sm rounded-3xl px-4 py-3 text-sm shadow-2xl transition-all duration-150 ${
            notification.type === "success"
              ? "bg-emerald-600 text-white"
              : notification.type === "error"
              ? "bg-red-600 text-white"
              : "bg-slate-900 text-white"
          }`}
        >
          {notification.message}
        </div>
      )}

      <div className="w-full max-w-6xl space-y-6">
        <div className="animate-fade-in-up rounded-[32px] border border-slate-200 bg-white p-6 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Logo />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleNavigate(VIEWS.HOME)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${view === VIEWS.HOME ? "bg-teal-600 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                Home
              </button>
              <button
                type="button"
                onClick={() => handleNavigate(VIEWS.BUY)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${view === VIEWS.BUY ? "bg-teal-600 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                Buy airtime
              </button>
              <button
                type="button"
                onClick={() => handleNavigate(VIEWS.REDEEM)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${view === VIEWS.REDEEM ? "bg-teal-600 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                Redeem
              </button>
              <button
                type="button"
                onClick={() => handleNavigate(VIEWS.SUPPORT)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${view === VIEWS.SUPPORT ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                Support
              </button>
              <button
                type="button"
                onClick={() => handleNavigate(VIEWS.ABOUT)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${view === VIEWS.ABOUT ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                About
              </button>
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                >
                  Logout
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleNavigate(VIEWS.LOGIN)}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Login
                </button>
              )}
            </div>
          </div>
          <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-slate-600">
            <p className="text-sm">Air-timee is your M-Pesa airtime partner for fast, secure top-ups with builtin support and admin tools.</p>
          </div>
        </div>

        {isHome && (
          <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
            <section className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl">
              <div className="space-y-6">
                <h2 className="text-3xl font-semibold text-slate-900">Welcome to Air-timee</h2>
                <p className="text-slate-600">Use Air-timee to send airtime safely via M-Pesa or redeem a receipt instantly. Our support assistant can also help you with transaction questions.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                    <h3 className="text-xl font-semibold text-slate-900">Fast checkout</h3>
                    <p className="mt-2 text-slate-600">Create a payment request and approve the M-Pesa prompt within seconds.</p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                    <h3 className="text-xl font-semibold text-slate-900">Verify payments</h3>
                    <p className="mt-2 text-slate-600">Track your transaction status in real time and recover from stuck or failed payments.</p>
                  </div>
                </div>
              </div>
            </section>
            <aside className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl">
              <h3 className="text-xl font-semibold text-slate-900">Your account</h3>
              <p className="mt-3 text-slate-600">{isAuthenticated ? `Signed in as ${user}` : "You are not logged in."}</p>
              {renderLatestTransaction()}
              <div className="mt-6 space-y-3 rounded-3xl border border-teal-600/10 bg-teal-50 p-5 text-slate-700">
                <p className="font-semibold text-slate-900">Getting started</p>
                <ul className="list-disc space-y-2 pl-5 text-slate-600">
                  <li>Buy airtime with a recipient phone number.</li>
                  <li>Redeem a valid M-Pesa receipt message.</li>
                  <li>Use Support if you need help or have issues.</li>
                </ul>
              </div>
            </aside>
          </div>
        )}

        {isBuy && (
          <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
            <section className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold text-slate-900">Buy airtime</h2>
                <p className="text-slate-600">Enter the recipient phone and amount to start a top-up with M-Pesa.</p>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-600">Recipient phone number</span>
                      <input
                        type="tel"
                        required
                        placeholder="07XXXXXXXX"
                        value={recipientPhone}
                        onChange={(e) => setRecipientPhone(e.target.value)}
                        className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-600">Amount (KES)</span>
                      <input
                        type="number"
                        required
                        min={5}
                        placeholder="100"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                      />
                    </label>
                  </div>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-600">Your phone number (M-Pesa prompt recipient)</span>
                    <input
                      type="tel"
                      placeholder="07XXXXXXXX"
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                    />
                    <p className="mt-2 text-sm text-slate-500">Leave blank to send the prompt to the recipient number.</p>
                  </label>
                  {error && <p className="animate-fade-in-up rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex w-full items-center justify-center gap-3 rounded-3xl bg-teal-600 px-6 py-4 text-base font-semibold text-white shadow-xl shadow-teal-600/20 transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
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
              </div>
            </section>
            <aside className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl">
              <h3 className="text-xl font-semibold text-slate-900">Why use buy mode?</h3>
              <p className="mt-3 text-slate-600">Use this view when you want to send airtime to someone else and optionally receive the STK prompt on your own number.</p>
            </aside>
          </div>
        )}

        {isRedeem && (
          <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
            <section className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold text-slate-900">Redeem M-Pesa receipt</h2>
                <p className="text-slate-600">Paste your M-Pesa SMS text and we will verify it before crediting airtime.</p>
                <form onSubmit={handleRedeem} className="space-y-6">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-600">MPesa SMS / message text</span>
                    <textarea
                      required
                      rows={8}
                      value={mpesaText}
                      onChange={(e) => setMpesaText(e.target.value)}
                      className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                      placeholder="Paste the MPesa message body here"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-600">Optional phone number</span>
                    <input
                      type="tel"
                      placeholder="07XXXXXXXX"
                      value={redeemPhone}
                      onChange={(e) => setRedeemPhone(e.target.value)}
                      className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                    />
                  </label>
                  {error && <p className="animate-fade-in-up rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex w-full items-center justify-center gap-3 rounded-3xl bg-teal-600 px-6 py-4 text-base font-semibold text-white shadow-xl shadow-teal-600/20 transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
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
            <aside className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl">
              <h3 className="text-xl font-semibold text-slate-900">Redeem flow</h3>
              <p className="mt-3 text-slate-600">Use this mode when you already have a valid M-Pesa receipt text to convert into airtime.</p>
            </aside>
          </div>
        )}

        {isSupport && (
          <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl">
            <SupportChat currentTransactionId={transactionId} />
          </div>
        )}

        {isAbout && (
          <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl">
            <div className="space-y-6">
              <h2 className="text-3xl font-semibold text-slate-900">About Air-timee</h2>
              <p className="text-slate-600">Air-timee is a lightweight M-Pesa airtime vending platform with payment tracking, redemption support, and an admin dashboard for operations.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                  <h3 className="text-xl font-semibold text-slate-900">Mission</h3>
                  <p className="mt-2 text-slate-600">Make airtime top-up easy, transparent, and reliable for buyers and operators.</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                  <h3 className="text-xl font-semibold text-slate-900">Security</h3>
                  <p className="mt-2 text-slate-600">Protected access and environment-based secrets keep your service safe in production.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {isBuy || isRedeem ? (
          <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl">
            <div className="space-y-5">
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
      <div className="animate-fade-in-up rounded-[28px] border border-teal-600/10 bg-slate-50 p-6 shadow-inner">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-teal-600">Current status</p>
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
          className="w-full rounded-3xl border border-teal-600/20 bg-teal-50 px-5 py-3 text-sm font-semibold text-teal-700 transition hover:bg-teal-100"
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
    if (state === "done") return "bg-emerald-500 text-white";
    if (state === "active") return "bg-teal-600 text-white ring-2 ring-teal-500/40";
    if (state === "failed") return "bg-red-500 text-white";
    return "bg-slate-100 text-slate-400";
  };

  return (
    <div className="space-y-3">
      {states.map((state, i) => (
        <div
          key={i}
          className="animate-fade-in-up flex items-center gap-4 rounded-3xl border border-slate-200 bg-white px-4 py-4"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-lg ${iconClass(state)}`}>
            {state === "done" ? "✓" : state === "failed" ? "✕" : i + 1}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{titles[i]}</p>
            <p className={`truncate text-sm ${state === "waiting" ? "text-slate-400" : "text-slate-500"}`}>{descs[i]}</p>
          </div>
          {state === "active" && <span className="ml-auto h-2 w-2 flex-shrink-0 animate-ping rounded-full bg-teal-500" />}
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
    <div className="animate-fade-in-up relative overflow-hidden rounded-[32px] border border-slate-200 bg-white p-6 shadow-xl" style={{ animationDelay: "160ms" }}>
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
