-- Paid capabilities (execution) alongside resources; extends resource_definitions.

ALTER TABLE resource_definitions ADD COLUMN sell_type TEXT NOT NULL DEFAULT 'resource';

ALTER TABLE resource_definitions ADD COLUMN capability_name TEXT NULL;

ALTER TABLE resource_definitions ADD COLUMN endpoint TEXT NULL;

ALTER TABLE resource_definitions ADD COLUMN http_method TEXT NULL;

ALTER TABLE resource_definitions ADD COLUMN input_format TEXT NULL;

ALTER TABLE resource_definitions ADD COLUMN result_format TEXT NULL;

ALTER TABLE resource_definitions ADD COLUMN receipt_mode TEXT NULL;

CREATE TABLE capability_async_jobs (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  execution_started_at TEXT NULL,
  execution_completed_at TEXT NULL,
  result_hash TEXT NULL,
  provider_metadata_json TEXT NULL
);

CREATE INDEX idx_capability_async_jobs_attempt_id ON capability_async_jobs (attempt_id);

CREATE INDEX idx_capability_async_jobs_slug ON capability_async_jobs (slug);
