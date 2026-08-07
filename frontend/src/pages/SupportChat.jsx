import { useEffect, useState } from "react";
import { supportChat } from "../services/api";

export default function SupportChat({ currentTransactionId }) {
  const [transactionId, setTransactionId] = useState(currentTransactionId || "");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [transactionContext, setTransactionContext] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (currentTransactionId) {
      setTransactionId(currentTransactionId);
    }
  }, [currentTransactionId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!message.trim()) {
      setError("Please enter a question or support request.");
      return;
    }

    setSending(true);
    try {
      const data = await supportChat(message.trim(), transactionId || undefined);
      setHistory((current) => [
        ...current,
        { role: "user", text: message.trim() },
        { role: "assistant", text: data.reply },
      ]);
      setTransactionContext(data.transaction || null);
      setMessage("");
    } catch (err) {
      setError(err.response?.data?.error || "Unable to send support message right now.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <div className="rounded-[32px] border border-slate-200 bg-slate-50 p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Support assistant</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          Ask questions about a transaction or get guidance for disputes, refunds, and delivery issues.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">Transaction ID (optional)</span>
              <input
                type="text"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="50577fab-..."
                className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">Support message</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                placeholder="Ask about payment status, refunds, or delivery issues..."
                className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              />
            </label>

            {error && (
              <p className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center justify-center rounded-3xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send message"}
            </button>
          </form>

          <div className="mt-10 rounded-[28px] border border-slate-200 bg-slate-50 p-6">
            <h3 className="text-lg font-semibold text-slate-900">Chat history</h3>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No messages yet. Start by asking a question.</p>
            ) : (
              <div className="mt-5 space-y-3">
                {history.map((item, index) => (
                  <div
                    key={`${item.role}-${index}`}
                    className={`rounded-3xl p-4 ${
                      item.role === "user"
                        ? "border border-slate-200 bg-white"
                        : "bg-slate-900 text-white"
                    }`}
                  >
                    <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      {item.role === "user" ? "You" : "Assistant"}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Transaction context</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                When provided, the support assistant uses this transaction record to answer accurately.
              </p>
            </div>

            {transactionContext ? (
              <div className="space-y-3 rounded-[24px] border border-teal-600/10 bg-teal-50 p-5 text-sm text-slate-700">
                <div className="grid gap-3">
                  <Row label="ID" value={transactionContext.id} />
                  <Row label="Status" value={transactionContext.status} />
                  <Row label="Amount" value={`KES ${transactionContext.amount}`} />
                  <Row label="Phone" value={transactionContext.phoneNumber} />
                  {transactionContext.failureReason && (
                    <Row label="Failure" value={transactionContext.failureReason} />
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                No transaction context available yet.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-medium text-slate-900">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}