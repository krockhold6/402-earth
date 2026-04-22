-- Phase 8: mature capability policy — execution caps, auto-pause, manual pause-until

ALTER TABLE resource_definitions ADD COLUMN capability_max_executions_per_24h INTEGER NULL;
ALTER TABLE resource_definitions ADD COLUMN capability_max_executions_per_7d INTEGER NULL;

ALTER TABLE resource_definitions ADD COLUMN capability_auto_pause_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE resource_definitions ADD COLUMN capability_auto_pause_threshold INTEGER NULL;
ALTER TABLE resource_definitions ADD COLUMN capability_auto_pause_window_seconds INTEGER NULL;
ALTER TABLE resource_definitions ADD COLUMN capability_auto_pause_duration_seconds INTEGER NULL;
ALTER TABLE resource_definitions ADD COLUMN capability_auto_paused_until TEXT NULL;
ALTER TABLE resource_definitions ADD COLUMN capability_auto_pause_reason TEXT NULL;

ALTER TABLE resource_definitions ADD COLUMN capability_manual_paused_until TEXT NULL;
