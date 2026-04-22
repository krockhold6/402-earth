-- Phase 2: verified origins, richer async jobs, receipt metadata

ALTER TABLE resource_definitions ADD COLUMN capability_endpoint_canonical TEXT NULL;

ALTER TABLE resource_definitions ADD COLUMN capability_origin_host TEXT NULL;

ALTER TABLE resource_definitions ADD COLUMN capability_origin_trust TEXT NULL;

ALTER TABLE capability_async_jobs ADD COLUMN failed_at TEXT NULL;

ALTER TABLE capability_async_jobs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE capability_async_jobs ADD COLUMN last_error TEXT NULL;

ALTER TABLE capability_async_jobs ADD COLUMN last_error_summary TEXT NULL;

ALTER TABLE capability_async_jobs ADD COLUMN result_http_status INTEGER NULL;

ALTER TABLE capability_async_jobs ADD COLUMN result_preview TEXT NULL;

CREATE TABLE capability_origin_allowlist (
  id TEXT PRIMARY KEY,
  receiver_address TEXT NOT NULL,
  host TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (receiver_address, host)
);

CREATE INDEX idx_capability_origin_allowlist_receiver ON capability_origin_allowlist (receiver_address);
