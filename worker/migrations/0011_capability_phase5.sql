-- Phase 5: explicit result retention state, seller notifications, delivery log

ALTER TABLE capability_async_jobs ADD COLUMN result_retention_state TEXT NULL;

-- Backfill: completed jobs with stored full body
UPDATE capability_async_jobs
SET result_retention_state = CASE
  WHEN status = 'completed' AND result_available = 1 AND result_storage_kind = 'd1_inline' THEN 'available'
  WHEN status = 'completed' AND result_available = 1 AND result_storage_kind = 'r2_object' THEN 'available'
  WHEN status = 'completed' AND result_storage_kind = 'preview_only' THEN 'preview_only'
  WHEN status = 'completed' AND result_available = 0 AND result_preview IS NOT NULL AND result_preview != '' THEN 'preview_only'
  WHEN status = 'completed' THEN 'not_stored'
  ELSE NULL
END
WHERE status = 'completed' AND result_retention_state IS NULL;

ALTER TABLE resource_definitions ADD COLUMN capability_notify_email TEXT NULL;

ALTER TABLE resource_definitions ADD COLUMN capability_notify_webhook_url TEXT NULL;

ALTER TABLE resource_definitions ADD COLUMN capability_notify_enabled INTEGER NOT NULL DEFAULT 0;

ALTER TABLE resource_definitions ADD COLUMN capability_notify_on_complete INTEGER NOT NULL DEFAULT 1;

ALTER TABLE resource_definitions ADD COLUMN capability_notify_on_fail INTEGER NOT NULL DEFAULT 1;

CREATE TABLE capability_notification_deliveries (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  slug TEXT NOT NULL,
  job_id TEXT NULL,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  attempted_at TEXT NULL,
  completed_at TEXT NULL,
  error_message TEXT NULL,
  metadata_json TEXT NULL
);

CREATE INDEX idx_capability_notification_deliveries_slug_time
  ON capability_notification_deliveries (slug, created_at DESC);

CREATE INDEX idx_capability_notification_deliveries_job
  ON capability_notification_deliveries (job_id);
