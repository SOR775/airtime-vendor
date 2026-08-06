# Airtime Vendor Platform

A starter scaffold for an airtime-vending platform (like Joopeed/Credo Faster):
customer enters phone + amount → pays via M-Pesa STK Push → your system
delivers airtime via an aggregator API.

This has been tested to install, build, and boot cleanly (Prisma client
generation aside — see note below). It is **not** production-ready as-is:
you still need real credentials, a production database, and the hardening
notes in `docs/ARCHITECTURE.md`.

## Structure

```
airtime-vendor-platform/
├── backend/                 Node.js + Express API
│   ├── src/
│   │   ├── config/          env loading, Prisma client singleton
│   │   ├── controllers/     request handlers (payment flow)
│   │   ├── routes/          Express route definitions
│   │   ├── services/        M-Pesa (Daraja) + airtime provider integrations
│   │   ├── middleware/      error handling
│   │   └── utils/           logger
│   ├── prisma/
│   │   └── schema.prisma    Transaction model
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── frontend/                React (Vite + Tailwind) customer-facing UI
│   └── src/
│       ├── components/      (empty, add as you grow the UI)
│       ├── pages/           (empty, add as you grow the UI)
│       ├── services/        api.js — talks to the backend
│       └── App.jsx          the buy-airtime form + status polling
└── docs/
    └── ARCHITECTURE.md      how it all fits together, what to do before launch
```

## Quick start

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # then fill in real values, see below
npx prisma migrate dev    # creates the Transaction table
npm run dev               # starts on http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                # starts on http://localhost:5173, proxies /api to :4000
```

### 3. Credentials you need before this actually works

- **Safaricom Daraja** (M-Pesa STK Push): register at
  https://developer.safaricom.co.ke, create an app, and get sandbox
  Consumer Key/Secret + a Lipa Na M-Pesa Online Passkey. Sandbox shortcode
  `174379` and its passkey are published on that same portal for testing.
- **A local tunnel for the callback URL**: Safaricom needs to reach
  `DARAJA_CALLBACK_URL` over the public internet even in sandbox. Use
  `ngrok http 4000` while developing and put the ngrok URL in `.env`.
- **Airtime delivery**: pick one —
  - Africa's Talking (`AIRTIME_PROVIDER=africastalking`) — easiest to get
    sandbox access to quickly: https://africastalking.com/airtime
  - Statum, Instalipa, Credo Faster, or a similar Kenyan aggregator —
    check their docs and adjust `src/services/airtime.service.js`
    accordingly (the response-parsing in `sendViaStatum` is a placeholder
    until you have their real API docs).
  - Safaricom's own Bulk Airtime API — requires a separate commercial
    agreement via your Safaricom account manager, not just a Daraja
    developer account. Stubbed out in the code until you have that.

### Note on Prisma in this scaffold

`npx prisma generate` downloads a query-engine binary from
`binaries.prisma.sh` the first time. On your own machine with normal
internet access this just works. (It was the one step that couldn't be
verified in the sandboxed environment this was built in, since that
environment blocks non-package-registry domains — everything else, from
`npm install` through `vite build` through Express route wiring, was run
and confirmed working here.)

See `docs/ARCHITECTURE.md` for the full payment/delivery flow, stack
reasoning, and what to add before taking real customer money.
