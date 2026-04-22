-- Phase 4: seller lifecycle, audit ledger, seller challenges, allowlist provenance, R2 result key

ALTER TABLE resource_definitions ADD COLUMN capability_lifecycle TEXT NULL;

UPDATE resource_definitions SET capability_lifecycle = 'active' WHERE sell_type = 'capability';

CREATE TABLE capability_audit_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  slug TEXT NULL,
  job_id TEXT NULL,
  actor_scope TEXT NOT NULL,
  actor_identifier TEXT NULL,
  status_summary TEXT NULL,
  metadata_json TEXT NULL
);

CREATE INDEX idx_capability_audit_slug_time ON capability_audit_events (slug, created_at DESC);

CREATE INDEX idx_capability_audit_job ON capability_audit_events (job_id);

CREATE TABLE capability_seller_challenges (
  id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE capability_origin_allowlist ADD COLUMN created_by_scope TEXT NULL;

ALTER TABLE capability_origin_allowlist ADD COLUMN created_by_identifier TEXT NULL;

ALTER TABLE capability_async_jobs ADD COLUMN result_storage_key TEXT NULL;
