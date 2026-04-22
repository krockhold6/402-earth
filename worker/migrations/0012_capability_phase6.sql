-- Phase 6: execution policy, notification channel toggles, last execution timestamp

ALTER TABLE resource_definitions ADD COLUMN capability_cooldown_seconds INTEGER NULL;
ALTER TABLE resource_definitions ADD COLUMN capability_max_concurrent_async INTEGER NULL;
ALTER TABLE resource_definitions ADD COLUMN capability_last_execution_at TEXT NULL;

ALTER TABLE resource_definitions ADD COLUMN capability_notify_email_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE resource_definitions ADD COLUMN capability_notify_webhook_enabled INTEGER NOT NULL DEFAULT 0;
