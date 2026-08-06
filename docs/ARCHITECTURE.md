# Architecture & Stack Notes

## Recommended stack (what's scaffolded here)

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + Express | M-Pesa's Daraja API is callback/webhook-driven (Safaricom POSTs to you asynchronously once payment completes) — Node's event loop is a natural fit, and there's more community M-Pesa integration code/examples in JS than most other stacks. |
| Database | PostgreSQL + Prisma | You're recording money movements. Postgres gives you real transactions/constraints; a NoSQL store makes it easier to end up with inconsistent transaction states under concurrent writes. Prisma gives you migrations + a typed client with minimal ceremony. |
| Frontend | React + Vite + Tailwind | Simple form + polling UI, nothing exotic needed. Vite keeps dev/build fast. |
| Payment | Safaricom Daraja — STK Push (Lipa Na M-Pesa Online) | This is the standard way sites like Joopeed collect payment: it pushes a PIN prompt directly to the customer's phone, no card/OTP flow needed. |
| Airtime delivery | Pluggable — Africa's Talking / Statum / similar aggregator | You cannot buy airtime with a plain consumer Daraja account. Delivery is a *separate* integration from *collecting* payment — see below. |

Alternative worth knowing about: **Django** is just as viable for the
backend (also has decent Daraja libraries, e.g. `django-daraja`), and if
you or your team already know Django/Python better than Node, that's a
perfectly reasonable substitution — the architecture below doesn't change.

## The two integrations are different things

This trips people up: getting money *from* the customer (Daraja STK Push)
and delivering airtime *to* a phone number are two unrelated APIs, usually
from two different companies:

1. **Collecting payment** — Safaricom Daraja, free developer account,
   sandbox available same-day at developer.safaricom.co.ke.
2. **Delivering airtime** — Safaricom does *not* hand this out to
   individual developers; you either (a) get a direct Bulk Airtime
   agreement with Safaricom (a business/commercial process, not a
   self-serve API signup), or (b) go through an aggregator who already
   has that relationship and resells access via API — Africa's Talking,
   Statum, Instalipa, Credo Faster, etc. Most sites like Joopeed run on
   an aggregator for exactly this reason: it's the fast path to actually
   shipping.

`src/services/airtime.service.js` is written so you can swap providers by
changing one env var (`AIRTIME_PROVIDER`) — start with an aggregator,
migrate to a direct Safaricom relationship later if volume justifies it.

## End-to-end flow

```
Customer                Frontend               Backend                  Safaricom / Aggregator
   |                        |                       |                            |
   | enter phone + amount   |                       |                            |
   |----------------------->|                       |                            |
   |                        | POST /payments/initiate                            |
   |                        |---------------------->|                            |
   |                        |                       | create Transaction         |
   |                        |                       | (PENDING_PAYMENT)          |
   |                        |                       | STK Push request           |
   |                        |                       |--------------------------->|
   | M-Pesa PIN prompt on phone <----------------------------------------------- |
   | enters PIN             |                       |                            |
   |------------------------------------------------------------------------->   |
   |                        |                       |   POST /payments/callback  |
   |                        |                       |<----------------------------
   |                        |                       | mark PAYMENT_RECEIVED      |
   |                        |                       | call airtime provider      |
   |                        |                       |--------------------------->|
   |                        |                       |   airtime delivered        |
   |                        |                       |<----------------------------
   |                        |                       | mark AIRTIME_SENT          |
   |                        | GET /payments/:id/status (polled every 3s)         |
   |                        |---------------------->|                            |
   |    "Airtime delivered" |<----------------------|                            |
   |<-----------------------|                       |                            |
```

The `Transaction.status` enum in `prisma/schema.prisma` tracks every stage
of this so nothing silently disappears, including the failure mode that
actually matters most: **payment succeeds but airtime delivery fails**
(`AIRTIME_FAILED`) — that's real customer money you now owe an airtime
top-up or a refund for, and it needs a retry job or an admin alert, not
just a log line.

## Before you take real customer money

This scaffold gets the core flow working end-to-end; it is deliberately
not "done." Before production traffic:

- **Idempotency on the callback**: Safaricom can retry the callback POST.
  The current code looks up by `checkoutRequestId`, which helps, but add
  an explicit check-then-skip if `status` is already past `PENDING_PAYMENT`.
- **Retry queue for `AIRTIME_FAILED`**: don't leave these to a human
  noticing manually. A simple cron job re-attempting delivery a few times
  before flagging for refund is enough at small scale (BullMQ + Redis if
  you want something more robust later).
- **Webhook validation**: Daraja doesn't sign callbacks the way e.g.
  Stripe does, so validate that the callback is at least well-formed and
  matches a transaction you actually created — don't trust the body blindly.
- **Rate limiting & fraud basics**: a cap per phone number per day, not
  just per-IP (already stubbed with `express-rate-limit`, but per-IP alone
  is weak against anyone with proxies).
- **Logging/alerting**: at minimum, alert yourself (Slack webhook, email)
  on every `AIRTIME_FAILED` — this is the state where you've taken money
  and not delivered.
- **Regulatory**: running a payment-adjacent business in Kenya touches
  CBK's National Payment System regulations and Safaricom's own merchant
  agreements — worth a conversation with a lawyer familiar with Kenyan
  fintech before going live with real money, separate from the tech build.
- **Secrets**: never commit `.env`; use your host's secret manager in
  production (Render/Railway/Fly/AWS Secrets Manager/etc.).
