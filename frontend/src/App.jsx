import { useEffect, useRef, useState } from "react";
import { initiatePayment, getTransactionStatus, redeemPayment } from "./services/api";

const TERMINAL_STATUSES = ["AIRTIME_SENT", "AIRTIME_FAILED", "PAYMENT_FAILED", "REFUNDED"];
const STATUS_COPY = {
  PENDING_PAYMENT: "Check your phone and enter your M-Pesa PIN.",
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
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [transactionId, setTransactionId] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [redeemMode, setRedeemMode] = useState(false);
  const [mpesaText, setMpesaText] = useState("");
  const [redeemResult, setRedeemResult] = useState(null);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const amountValue = Number(amount);
    if (!phone.trim() || !Number.isFinite(amountValue) || amountValue < 5) {
      setError("Please enter a valid phone number and an amount of at least KES 5.");
      return;
    }

    setShowConfirm(true);
  }

  async function confirmPayment() {
    setShowConfirm(false);
    setSubmitting(true);
    setError(null);

    try {
      const res = await initiatePayment(phone, Number(amount));
      // Tolerate both camelCase and snake_case API contracts.
      const id = res.transactionId ?? res.transaction_id;
      if (!id) {
        setError("Server did not return a transaction ID.");
        return;
      }
      if (!mountedRef.current) return;
      setTransactionId(id);
      setStatus("PENDING_PAYMENT");
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.response?.data?.error || "Something went wrong. Please try again.");
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
      const data = await redeemPayment(mpesaText, phone.trim() || undefined);
      if (!mountedRef.current) return;
      setRedeemResult(data);
      // Tolerate both camelCase and snake_case API contracts.
      const id = data.transactionId ?? data.transaction_id;
      if (id) {
        setTransactionId(id);
        setStatus("PAYMENT_RECEIVED");
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.response?.data?.error || "Could not redeem the MPesa message.");
    } finally {
      if (mountedRef.current) setSubmitting(false);
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
        setStatus(currentStatus);
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
    setPhone("");
    setAmount("");
    setMpesaText("");
    setRedeemResult(null);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-4">
      <style>{STYLES}</style>

      <div className="w-full max-w-6xl grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <section className="animate-fade-in-up rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.32em] text-teal-600">Airtime vendor</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Send airtime faster with M-Pesa</h1>
            </div>
            <div className="inline-flex items-center gap-2 rounded-3xl border border-teal-600/20 bg-teal-50 px-4 py-2 text-sm text-teal-700">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-teal-500" /> Live payment flow
            </div>
          </div>

          <div className="mt-4 max-w-2xl text-slate-500">Enter the customer phone, choose an amount, and approve the M-Pesa prompt. The app handles airtime delivery automatically once payment is confirmed.</div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setRedeemMode(false)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${redeemMode ? "border border-slate-300 bg-white text-slate-600" : "bg-teal-600 text-white"}`}
            >
              Buy airtime
            </button>
            <button
              type="button"
              onClick={() => setRedeemMode(true)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${redeemMode ? "bg-teal-600 text-white" : "border border-slate-300 bg-white text-slate-600"}`}
            >
              Redeem MPesa message
            </button>
          </div>

          {redeemMode ? (
            <form onSubmit={handleRedeem} className="mt-8 space-y-6">
              <div>
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
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Optional phone number</span>
                  <input
                    type="tel"
                    placeholder="07XXXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </label>
                <div className="rounded-[24px] border border-teal-600/10 bg-slate-50 p-4 text-sm text-slate-600 shadow-inner">
                  <p className="font-medium text-slate-900">How this works</p>
                  <p className="mt-2 text-slate-500">Upload your MPesa receipt text and optionally the recipient phone number. We will verify the payment and send airtime automatically.</p>
                </div>
              </div>

              {error && <p className="animate-fade-in-up rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              {redeemResult && (
                <p className={`animate-fade-in-up rounded-3xl px-4 py-3 text-sm ${redeemResult.success ? "border border-emerald-300 bg-emerald-50 text-emerald-700" : "border border-red-200 bg-red-50 text-red-700"}`}>
                  {redeemResult.message || (redeemResult.success ? "Redeem request submitted." : "Redeem request failed.")}
                </p>
              )}

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
          ) : !transactionId ? (
            <>
              <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-600">Phone number</span>
                    <input
                      type="tel"
                      required
                      placeholder="07XXXXXXXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
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

                {error && <p className="animate-fade-in-up rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

                {phone.trim() && amount.trim() && Number(amount) > 0 && (
                  <div className="animate-fade-in-up rounded-[24px] border border-teal-600/10 bg-slate-50 p-4 text-sm text-slate-600 shadow-inner">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium text-slate-900">Preview</p>
                        <p className="mt-1 text-slate-500">Review the airtime purchase before sending the M-Pesa prompt.</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-500">Preview</span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-3xl bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Phone</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{phone}</p>
                      </div>
                      <div className="rounded-3xl bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Amount</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">KES {Number(amount).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                )}

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

              {showConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                  <div className="animate-modal-in w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-6 shadow-2xl">
                    <h2 className="text-2xl font-semibold text-slate-900">Confirm airtime purchase</h2>
                    <p className="mt-3 text-slate-500">Please confirm you want to send airtime to the following number.</p>

                    <div className="mt-6 space-y-4 rounded-[24px] border border-teal-600/10 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-slate-500">Phone</span>
                        <span className="font-semibold text-slate-900">{phone}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-slate-500">Amount</span>
                        <span className="font-semibold text-slate-900">KES {Number(amount).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                      <button
                        type="button"
                        onClick={() => setShowConfirm(false)}
                        className="rounded-3xl border border-slate-300 px-5 py-3 text-sm text-slate-600 transition hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={confirmPayment}
                        className="rounded-3xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-500"
                      >
                        Confirm purchase
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <StatusPanel key={status || "none"} status={status} error={error} onReset={resetForm} />
          )}
        </section>

        <aside className="animate-fade-in-up rounded-[32px] border border-slate-200 bg-white p-6 shadow-xl" style={{ animationDelay: "80ms" }}>
          <div className="space-y-5">
            <div>
              <p className="text-sm uppercase tracking-[0.32em] text-slate-400">Live status</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-900">Visual delivery experience</h2>
              <p className="mt-2 text-sm text-slate-500">See the current step and the airtime transfer animation based on payment progress.</p>
            </div>

            <ProgressSteps status={status} />
            <DeliveryAnimation status={status} />
          </div>
        </aside>
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
