# Capability platform invariants (Phase 10.5)

402 supports two paid objects: **resources** and **capabilities**. This document hardens the **capability spine** before broader product phases.

## Attempt vs job

| Concept | Table / ID | Role |
|--------|------------|------|
| **Attempt** | `payment_attempts`, `attempt_id` | Commercial / payment event (paid, expired, …). Receipts and x402 pay payloads anchor here. |
| **Job** | `capability_async_jobs`, `job_id` | Execution event for **async** capabilities: pending → running → completed/failed, retries, retained results. |

Do not conflate attempt status with job status in APIs or UI copy.

## Truth vs cache

- **D1 (`DB`)** — canonical for ownership, lifecycle, trust/policy inputs, job rows, audit, notification delivery rows, analytics aggregates read from D1, receipts metadata.
- **R2 (`CAPABILITY_RESULTS`)** — canonical blob store for large async results; metadata pointers live in D1.
- **Queues (`CAPABILITY_ASYNC`)** — **transport/orchestration only**. Messages trigger work; they do not replace D1 as source of truth. Duplicate deliveries are safe where D1 claim gates exist (`tryMarkJobRunning`).
- **KV** — not used for capability correctness today. If added: optional acceleration only, with explicit invalidation and never as sole authority.

## Async execution: queue-first

1. **Primary:** `CAPABILITY_ASYNC` messages (`run_job`, `notify_terminal`) written after payment (new job) or when scheduling retries / cron sweeps.
2. **Accelerator (optional):** `ExecutionContext.waitUntil(runCapabilityAsyncJob)` after enqueue — duplicate-safe via D1 claim.
3. **Secondary:** `scheduled` cron — stale `running` recovery, result retention cleanup, enqueue eligible jobs (or **direct** `runCapabilityAsyncJob` if the queue binding is absent, e.g. local tests).

Payload taxonomy: `worker/src/lib/capabilityAsyncQueueMessages.ts`.

## Result metadata

Normalized internal shape: `buildNormalizedCapabilityJobResultMetadata` in `capabilityResultMetadata.ts`. Use it to keep execution, retention, preview, full result, and retrieval semantics aligned across buyer poll and seller surfaces.

## Internal capability descriptor

`buildInternalCapabilityDescriptor` in `capabilityDescriptor.ts` — normalized seller/control-plane view for future discovery, teams, and analytics. Not a public marketplace schema.
