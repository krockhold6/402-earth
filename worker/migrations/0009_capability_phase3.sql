-- Phase 3: durable async pickup, retries, result storage, allowlist metadata

ALTER TABLE capability_async_jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3;

ALTER TABLE capability_async_jobs ADD COLUMN next_retry_at TEXT NULL;

ALTER TABLE capability_async_jobs ADD COLUMN failure_class TEXT NULL;

ALTER TABLE capability_async_jobs ADD COLUMN last_attempt_started_at TEXT NULL;

ALTER TABLE capability_async_jobs ADD COLUMN result_available INTEGER NOT NULL DEFAULT 0;

ALTER TABLE capability_async_jobs ADD COLUMN result_content_type TEXT NULL;

ALTER TABLE capability_async_jobs ADD COLUMN result_size_bytes INTEGER NULL;

ALTER TABLE capability_async_jobs ADD COLUMN result_storage_kind TEXT NULL;

ALTER TABLE capability_async_jobs ADD COLUMN result_expires_at TEXT NULL;

CREATE TABLE capability_job_results (
  job_id TEXT PRIMARY KEY,
  body_text TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL,
  storage_kind TEXT NOT NULL DEFAULT 'd1_inline',
  created_at TEXT NOT NULL,
  expires_at TEXT NULL
);

CREATE INDEX idx_capability_async_jobs_status_retry ON capability_async_jobs (status, next_retry_at);

ALTER TABLE capability_origin_allowlist ADD COLUMN note TEXT NULL;

ALTER TABLE capability_origin_allowlist ADD COLUMN source TEXT NULL;
