import { useEffect, useState } from "react";

export default function AdminPage() {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(false);

  async function fetchTxs() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/transactions');
      const data = await res.json();
      setTxs(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTxs(); }, []);

  async function retrigger(id) {
    await fetch(`/api/admin/transactions/${id}/retrigger-airtime`, { method: 'POST' });
    fetchTxs();
  }

  async function markResolved(id) {
    const status = prompt('Enter status to set (AIRTIME_SENT | AIRTIME_FAILED | REFUNDED):');
    if (!status) return;
    await fetch(`/api/admin/transactions/${id}/mark-resolved`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    fetchTxs();
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Admin — Transactions (live feed)</h2>
      <button onClick={fetchTxs} className="mb-4 rounded bg-teal-600 px-3 py-2 text-white">Refresh</button>
      {loading && <div>Loading…</div>}
      <div className="space-y-3">
        {txs.map(tx => (
          <div key={tx.id} className="rounded border p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{tx.phoneNumber} — KES {tx.amount}</div>
                <div className="text-sm text-slate-500">{tx.status} — {tx.id}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => retrigger(tx.id)} className="rounded bg-emerald-500 px-2 py-1 text-white">Retrigger</button>
                <button onClick={() => markResolved(tx.id)} className="rounded bg-slate-600 px-2 py-1 text-white">Resolve</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
