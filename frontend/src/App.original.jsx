import { useEffect, useRef, useState } from "react";
import { initiatePayment, getTransactionStatus } from "./services/api";

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

export default function App() {
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [transactionId, setTransactionId] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const pollRef = useRef(null);

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const amountValue = Number(amount);
    if (!phone.trim() || !Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Please enter a valid phone number and amount.");
      return;
    }

    setShowConfirm(true);
  }

  async function confirmPayment() {
    setShowConfirm(false);
    setSubmitting(true);
    setError(null);

    try {
      const { transactionId } = await initiatePayment(phone, Number(amount));
      setTransactionId(transactionId);
      setStatus("PENDING_PAYMENT");
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!transactionId) return;
    pollRef.current = setInterval(async () => {
      try {
        const data = await getTransactionStatus(transactionId);
        setStatus(data.status);
        if (data.failureReason) setError(data.failureReason);
        if (TERMINAL_STATUSES.includes(data.status)) {
          clearInterval(pollRef.current);
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
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <section className="rounded-[32px] border border-white/10 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.32em] text-cyan-300">Airtime vendor</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Send airtime faster with M-Pesa</h1>
            </div>
            <div className="inline-flex items-center gap-2 rounded-3xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" /> Live payment flow
            </div>
          </div>

          <p className="mt-4 max-w-2xl text-slate-400">Enter the customer phone, choose an amount, and approve the M-Pesa prompt. The app handles airtime delivery automatically once payment is confirmed.</p>

          {!transactionId ? (
            <>
              <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                <div className="grid gap-5 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-300">Phone number</span>
                  <input
                    type="tel"
                    required
                    placeholder="07XXXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-3xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-300">Amount (KES)</span>
                  <input
                    type="number"
                    required
                    min={5}
                    placeholder="100"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-3xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                  />
                </label>
              </div>

              {error && <p className="rounded-3xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

              {phone.trim() && amount.trim() && Number(amount) > 0 && (
                <div className="rounded-[24px] border border-cyan-500/10 bg-slate-950/90 p-4 text-sm text-slate-300 shadow-inner">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">Preview</p>
                      <p className="mt-1 text-slate-400">Review the airtime purchase before sending the M-Pesa prompt.</p>
                    </div>
                    <span className="rounded-full bg-slate-800/90 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-400">Preview</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-3xl bg-slate-900/80 p-4">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Phone</p>
                      <p className="mt-2 text-lg font-semibold text-white">{phone}</p>
                    </div>
                    <div className="rounded-3xl bg-slate-900/80 p-4">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Amount</p>
                      <p className="mt-2 text-lg font-semibold text-white">KES {Number(amount).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-3 rounded-3xl bg-cyan-500 px-6 py-4 text-base font-semibold text-slate-950 shadow-xl shadow-cyan-500/20 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
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
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
                <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-slate-900 p-6 shadow-2xl">
                  <h2 className="text-2xl font-semibold text-white">Confirm airtime purchase</h2>
                  <p className="mt-3 text-slate-400">Please confirm you want to send airtime to the following number.</p>

                  <div className="mt-6 space-y-4 rounded-[24px] border border-cyan-500/10 bg-slate-950/90 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-slate-400">Phone</span>
                      <span className="font-semibold text-white">{phone}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-slate-400">Amount</span>
                      <span className="font-semibold text-white">KES {Number(amount).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setShowConfirm(false)}
                      className="rounded-3xl border border-slate-700 px-5 py-3 text-sm text-slate-300 transition hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={confirmPayment}
                      className="rounded-3xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                    >
                      Confirm purchase
                    </button>
                  </div>
                </div>
              </div>
            )}
            </>
          ) : (
            <StatusPanel status={status} error={error} onReset={resetForm} />
          )}
        </section>

        <aside className="rounded-[32px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl">
          <div className="space-y-5">
            <div>
              <p className="text-sm uppercase tracking-[0.32em] text-slate-400">Live status</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">Visual delivery experience</h2>
              <p className="mt-2 text-sm text-slate-400">See the current step and the airtime transfer animation based on payment progress.</p>
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

  return (
    <div className="mt-8 space-y-6">
      <div className="rounded-[28px] border border-cyan-500/10 bg-slate-950/90 p-6 shadow-inner">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">Current status</p>
            <h3 className="mt-2 text-xl font-semibold text-white">{badge}</h3>
          </div>
          <span className="rounded-full bg-slate-800/90 px-4 py-2 text-sm text-slate-300 ring-1 ring-white/10">Step {STATUS_STEP[status] || 1}</span>
        </div>

        <p className="mt-5 text-slate-300">{copy}</p>

        {status === "PAYMENT_RECEIVED" && (
          <div className="mt-6 rounded-3xl bg-cyan-500/10 p-4 text-slate-100">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-cyan-500/20 flex items-center justify-center text-cyan-300">⏳</div>
              <div>
                <p className="font-medium text-white">Airtime delivery in progress</p>
                <p className="text-sm text-slate-300">Your airtime will be sent automatically, no extra action needed.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <p className="rounded-3xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

      {(status === "AIRTIME_SENT" || status === "AIRTIME_FAILED" || status === "PAYMENT_FAILED") && (
        <button
          onClick={onReset}
          className="w-full rounded-3xl border border-cyan-500/20 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
        >
          Buy more airtime
        </button>
      )}
    </div>
  );
}

function ProgressSteps({ status }) {
  const steps = [
    { id: 1, title: "M-Pesa prompt", active: status === "PENDING_PAYMENT" || status === "PAYMENT_RECEIVED" || status === "AIRTIME_SENT" },
    { id: 2, title: "Confirm payment", active: status === "PAYMENT_RECEIVED" || status === "AIRTIME_SENT" },
    { id: 3, title: "Airtime delivery", active: status === "AIRTIME_SENT" },
  ];

  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <div key={step.id} className="flex items-center gap-4 rounded-3xl border border-white/5 bg-slate-950/80 px-4 py-4">
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-lg ${step.active ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-400"}`}>
            {step.id}
          </div>
          <div>
            <p className="font-medium text-white">{step.title}</p>
            <p className="text-sm text-slate-400">{step.active ? "In progress" : "Waiting"}</p>
          </div>
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
    <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/90 p-6 shadow-xl">
      <div className="absolute -right-10 top-6 h-32 w-32 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="absolute left-4 top-12 h-16 w-16 rounded-full bg-fuchsia-500/20 blur-3xl" />

      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="relative h-[240px] w-[160px] rounded-[40px] border border-white/10 bg-slate-900/95 shadow-2xl">
          <div className="absolute inset-x-0 top-4 flex justify-center">
            <div className="h-2 w-14 rounded-full bg-slate-700" />
          </div>
          <div className="absolute inset-x-0 top-16 flex flex-col items-center gap-3 px-4 text-center">
            <div className={`flex h-16 w-16 items-center justify-center rounded-full text-3xl shadow-lg ${isSuccess ? "bg-emerald-400 text-slate-950" : "bg-cyan-500 text-slate-950"} ${isDelivering ? "animate-pulse" : ""}`}>
              {isSuccess ? "✔" : "📲"}
            </div>
            <div className="rounded-3xl bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.24em] text-slate-400">Mobile top-up</div>
          </div>

          {(isDelivering || isSuccess) && (
            <div className="absolute left-1/2 top-[46%] h-12 w-12 -translate-x-1/2 rounded-full bg-cyan-400/90 shadow-xl animate-credit-fly">
              <span className="flex h-full w-full items-center justify-center text-lg">💸</span>
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
          <p className="text-lg font-semibold text-white">
            {isPending ? "Waiting for your M-Pesa approval" : isDelivering ? "Airtime is on its way" : isSuccess ? "Top-up completed" : isFailed ? "Action required" : "Ready to start"}
          </p>
          <p className="text-sm text-slate-400">
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
