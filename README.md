# 402.earth

Browser wrapper + Cloudflare Worker API for **x402-native** payments: resources and **payment attempts** live in D1; the UI talks to `api.402.earth` (or a local worker via Vite proxy).

---

## Developer workflow (x402-native)

### 1. Frontend

From repo root:

| Command | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server (proxies `/api` and `/x402` to `http://127.0.0.1:8787`) |
| `npm run build` | Production bundle |
| `npm run preview` | Preview production build locally |

Optional: `VITE_API_ORIGIN=https://api.402.earth npm run dev` — point the UI at the live API while developing locally.

### 2. Worker

From `worker/`:

| Command | Purpose |
|--------|---------|
| `npm run dev` | `wrangler dev` (default `http://127.0.0.1:8787`) |
| `npm run deploy` | `wrangler deploy` to Cloudflare |

From repo root you can also run `npm run worker:dev`.

### 3. D1 migrations

From `worker/` (database name is `402-earth-payments` per `wrangler.toml`):

```bash
# Local (wrangler dev)
npx wrangler d1 migrations apply 402-earth-payments --local

# Remote (production D1)
npx wrangler d1 migrations apply 402-earth-payments --remote
```

Migrations live in `worker/migrations/` (e.g. `0002_x402_v3.sql` for `resource_definitions`, `payment_attempts`, `payment_events`).

### 4. Seed demo resource

From `worker/`:

```bash
npm run db:seed:local    # local D1
npm run db:seed:remote   # remote D1 (--yes for non-interactive)
```

SQL: `worker/seeds/demo_resource.sql` (slug `demo-001`). Requires the v3 migration applied first.

### 5. Production deploys

| Surface | How |
|--------|-----|
| **Frontend** (e.g. GitHub Pages / CI) | Push to `main` — your pipeline builds from `npm run build` (this repo: `git push origin main` if CI deploys on push). |
| **Worker + D1 binding** | From `worker/`: `npx wrangler deploy` (or `npm run deploy`). |

Apply remote migrations / seeds when schema or catalog data changes in production.

### 6. x402-native route map (Worker)

| Method | Path | Role |
|--------|------|------|
| `GET` | `/api/resource/:slug` | Load payable resource from D1 |
| `POST` | `/api/payment-attempt` | Create attempt (`clientType`, `slug`) |
| `GET` | `/api/payment-attempt/:id` | Read attempt (polling) |
| `GET` | `/x402/pay/:slug` | 402 + `PAYMENT-REQUIRED` or 200 when paid (`attemptId` query for v3) |
| `POST` | `/x402/verify` | Verify proof → can mark attempt `paid` |

**Legacy (Coinbase checkout era)** — still mounted after v3 routes: `GET`/`POST` `/api/payment-session`, `POST` `/api/webhooks/coinbase-business`, and `GET` `/x402/pay/:slug?sessionId=` (no `attemptId`).

**Frontend routes:** `/`, `/pay/:slug`, `/success/:slug` (`?attemptId=` for v3; optional `?sessionId=` shows legacy checkout panel only).

### 7. Mock / dev-only today

- **`POST /x402/verify`** succeeds without a real facilitator when `X402_MOCK_VERIFY=true` (recommended: `worker/.dev.vars`, see `worker/.dev.vars.example`). Production normally leaves this unset → **503** `FACILITATOR_NOT_CONFIGURED`.
- **Browser Pay flow** calls verify with placeholder `paymentSignature` (`browser-mock-signature`) — exercise only, not on-chain proof.
- **Mock payer / tx fields** written on successful mock verify are placeholders for D1 columns.

### 8. Real facilitator integration (still to do)

- Implement **`verifyWithFacilitator()`** in `worker/src/lib/facilitator.ts` for the non-mock path (same input contract as today).
- Optionally tighten **`GET /x402/pay/:slug`** `PAYMENT-REQUIRED` payload to match your facilitator’s requirement schema.
- Wire production env/secrets for the chosen facilitator; keep **`X402_MOCK_VERIFY`** off in prod.

---

## Stack

React 19, Vite 8, Coinbase CDS, React Router; Worker on Cloudflare (D1, Wrangler 4).
