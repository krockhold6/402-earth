# 402.earth

Browser wrapper + Cloudflare Worker API for **x402-native** payments: resources and **payment attempts** live in D1; the UI talks to `api.402.earth` (or a local worker via Vite proxy).

---

## Developer workflow (x402-native)

### 1. Frontend

From repo root:

| Command | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server (proxies `/api` and `/x402` to `http://127.0.0.1:8787`) |
| `npm run build` | Production bundle (Vite `base` defaults to `/`; see `vite.config.ts`) |
| `npm run preview` | Preview production build at **`http://localhost:4173/`** (runs a build first if `dist/index.html` is missing). Port **4173** is fixed (`strictPort`); if you see “port already in use”, stop the other process (often a leftover `vite preview`) or run `lsof -i :4173`. |

**Static hosting:** Default `base` is **`/`** so scripts load as **`/assets/…`** on apex and on **custom domains at site root** (e.g. `https://402.earth/unlock/...` hard-refresh works). A relative base (`./`) breaks those routes because the browser resolves `./assets/…` under `/unlock/…`. For the raw **GitHub project** URL (`https://<user>.github.io/<repo>/`), build with `VITE_BASE_PATH=/<repo>/ npm run build` so assets live under `/<repo>/assets/…`. React Router basename on `*.github.io` still comes from `src/lib/appUrl.ts`.

**Public images / files in `public/`:** Use **`publicUrl()`** from `src/lib/publicUrl.ts` for URLs in React (Vite does not rewrite string literals; hardcoded `/img/…` misses the subpath when `base` is `/<repo>/`).

After `npm run build && npm run preview`, open the printed `localhost` URL; routing matches production for apex-style URLs (`basename` is inferred only on `*.github.io`).

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
| **Frontend** (GitHub Pages + apex) | Push to `main` — CI runs `npm run build` with default `/` base (apex + custom domain at `/`). Raw `github.io/<user>/<repo>/` preview needs a subpath build (`VITE_BASE_PATH=/<repo>/`) if you rely on that URL. |
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

**Frontend routes:** `/`, `/unlock/:slug` (canonical buyer unlock page), `/pay/:slug` (redirects to `/unlock/:slug`), `/success/:slug` (`?attemptId=` for v3; optional `?sessionId=` shows legacy checkout panel only).

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
