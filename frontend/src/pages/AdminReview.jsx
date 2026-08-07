import { useEffect, useState } from "react";

function renderValue(value) {
  if (value === null || value === undefined) {
    return <span className="text-slate-500">—</span>;
  }
  if (typeof value !== "object") {
    return <span>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-slate-500">[]</span>;
    }
    return (
      <ul className="space-y-1 pl-5 text-sm text-slate-700">
        {value.map((item, index) => (
          <li key={index}>{renderValue(item)}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className="space-y-2 text-sm text-slate-700">
      {Object.entries(value).map(([key, val]) => (
        <div key={key} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 rounded-3xl bg-slate-50 p-3">
          <div className="font-medium text-slate-500">{key}</div>
          <div>{renderValue(val)}</div>
        </div>
      ))}
    </div>
  );
}

export default function AdminReviewPage() {
  const [txs, setTxs] = useState([]);
  const [aiParses, setAiParses] = useState([]);
  const [loading, setLoading] = useState(false);

  async function fetchAll() {
    setLoading(true);
    try {
      const [txRes, parseRes] = await Promise.all([
        fetch('/api/admin/transactions'),
        fetch('/api/admin/ai-parses?limit=50'),
      ]);
      const [txData, parseData] = await Promise.all([txRes.json(), parseRes.json()]);
      setTxs(txData);
      setAiParses(parseData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  return (
    <div className="space-y-8 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Admin review</h2>
          <p className="text-sm text-slate-500">Review airtime transactions and AI parse suggestions.</p>
        </div>
        <button onClick={fetchAll} className="rounded-full bg-teal-600 px-4 py-2 text-white">Refresh</button>
      </div>

      {loading && <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Loading…</div>}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-semibold">Latest AI parses</h3>
        <div className="mt-4 space-y-4">
          {aiParses.length === 0 ? (
            <p className="text-sm text-slate-500">No AI parses found.</p>
          ) : (
            aiParses.map(parse => (
              <div key={parse.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-slate-500">{new Date(parse.createdAt).toLocaleString()}</div>
                    <div className="font-semibold text-slate-900">{parse.model || 'unknown model'}</div>
                  </div>
                  <div className="text-sm text-slate-500">Transaction: {parse.transaction?.id ?? 'unlinked'}</div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">MPesa text</p>
                    <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap break-words">{parse.mpesaText}</p>
                  </div>
                  <div className="rounded-3xl bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">AI suggestion</p>
                    <div className="mt-2 space-y-3">{renderValue(parse.suggestion)}</div>
                  </div>
                </div>
                <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-100 p-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">Authoritative parse</p>
                  <div className="mt-2 space-y-3">{renderValue(parse.authoritative)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-semibold">Recent transactions</h3>
        <div className="mt-4 space-y-3">
          {txs.length === 0 ? (
            <p className="text-sm text-slate-500">No transactions found.</p>
          ) : (
            txs.map(tx => (
              <div key={tx.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{tx.phoneNumber} — KES {tx.amount}</div>
                    <div className="text-sm text-slate-500">{tx.status} • {new Date(tx.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="text-sm text-slate-500">{tx.airtimeProviderRef ?? 'no provider ref'}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
