---
name: 402-earth-x402
description: Operate the 402.earth x402 payment flow and public HTTP APIs.
---

# 402.earth agent skill

## Site

- Human UI and docs live at the canonical origin (see `https://402.earth/` and `/api`).
- Use `GET /sitemap.xml` for public page URLs.

## API host

- Base URL: `https://api.402.earth`
- Discovery: `GET /.well-known/api-catalog` (RFC 9727 linkset), `GET /openapi.json`, `GET /health`.

## Typical flow

1. `POST /api/resource` with `label`, `amount`, and Base USDC `receiverAddress` (and optional `slug`).
2. `POST /api/payment-attempt` with `slug` and `clientType` (`browser` | `agent` | `api`).
3. Open `GET /x402/pay/:slug?attemptId=…` for the payer flow.
4. After payment, `POST /x402/verify` with `attemptId`, `slug`, and `txHash` (or dev `paymentSignature`).

## Access

Machine access is **x402 over HTTP**: payment requirements, signatures / chain settlement, and `POST /x402/verify`. There is no separate OAuth or bearer-token platform for these APIs.
