# HTTP route boundaries (Phase 10.5)

## Public / buyer

- `GET /x402/pay/:slug`, `POST /x402/verify` — paywall and settlement.
- `GET /api/resource/:slug` — catalog-style resource/capability definition for buyers.
- `GET /api/payment-attempt/:id` — attempt status (payment truth).
- `GET /api/capability-job/:id`, `GET /api/capability-job/:id/result` — async job poll and result retrieval (execution truth).
- `GET /api/capability-proxy` — protected capability execution entry.
- `GET /unlock/:token` — SSR unlock page token resolution.

**Rule:** no seller-only secrets; responses must not leak other sellers’ data.

## Seller control plane

- `POST /api/capability/seller/challenge`, `POST /api/capability/seller/auth` — wallet session.
- `GET|PATCH /api/capability/seller/capability/:slug`, jobs, analytics, notifications, audit, allowlist — **JWT + slug ownership** (`assertCapabilityOwned`).

**Rule:** seller JWT is never a substitute for operator secrets; paths stay under `/api/capability/seller/`.

## Operator / platform

- `GET|POST|DELETE /api/capability-origin-allowlist` — **Bearer `CAPABILITY_MANAGEMENT_SECRET`**.
- `GET /api/capability-ops/summary` — same bearer.

**Rule:** management secret must not appear on public or seller-only surfaces.
